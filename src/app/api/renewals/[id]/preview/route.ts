import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renewalNoticeHtml }   from '@/lib/email-templates/renewal-notice'
import { renewalPolicyHtml }   from '@/lib/email-templates/renewal-policy'
import { renewalAlertHtml }    from '@/lib/email-templates/renewal-alert'
import {
  renderRenewalTemplate,
  formatMXN,
  type RenewalVars,
} from '@/lib/collection-vars'

function formatDate(iso: string | null): string {
  if (!iso) return 'N/D'
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: renewalId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: renewal } = await admin
    .from('renewals')
    .select(`
      id, current_stage_id,
      policy:policies!renewals_policy_id_fkey(
        id, policy_number, insurer, premium, start_date, end_date, branch,
        tomador:contacts!policies_tomador_id_fkey(id, full_name, email, phone)
      ),
      new_policy:policies!renewals_new_policy_id_fkey(
        id, policy_number, insurer, premium, start_date, end_date
      ),
      stage:renewal_stages!renewals_current_stage_id_fkey(
        id, name, send_email, email_template_id
      )
    `)
    .eq('id', renewalId)
    .single()

  if (!renewal) return NextResponse.json({ error: 'Renovación no encontrada' }, { status: 404 })

  type StageShape  = { id: string; name: string; send_email: boolean; email_template_id: string | null }
  type TomadorShape = { id: string; full_name: string; email: string | null; phone: string | null }
  type PolicyShape  = { id: string; policy_number: string | null; insurer: string; premium: number | null; start_date: string | null; end_date: string | null; branch: string; tomador: TomadorShape[] | TomadorShape | null }
  type NewPolShape = { id: string; policy_number: string | null; insurer: string; premium: number | null; start_date: string | null; end_date: string | null }

  const stage    = (Array.isArray(renewal.stage)      ? renewal.stage[0]      : renewal.stage)      as StageShape  | null
  const policy   = (Array.isArray(renewal.policy)     ? renewal.policy[0]     : renewal.policy)     as PolicyShape | null
  const newPol   = (Array.isArray(renewal.new_policy) ? renewal.new_policy[0] : renewal.new_policy) as NewPolShape | null

  if (!policy) return NextResponse.json({ error: 'Póliza no encontrada' }, { status: 404 })

  const tomador       = Array.isArray(policy.tomador) ? policy.tomador[0] : policy.tomador
  const clientName    = tomador?.full_name ?? 'Cliente'
  const clientEmail   = tomador?.email ?? null
  const executiveName = (profile.full_name as string | null) ?? 'Su ejecutivo'

  if (!stage?.send_email) {
    return NextResponse.json({ error: 'Este stage no envía correo' }, { status: 400 })
  }

  const { data: allStages } = await admin
    .from('renewal_stages')
    .select('id, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const stageIdx = allStages?.findIndex(s => s.id === stage?.id) ?? 0

  const renewalVars: RenewalVars = {
    nombre:         clientName,
    aseguradora:    policy.insurer,
    ejecutivo:      executiveName,
    fecha_hoy:      formatDate(new Date().toISOString()),
    numero_poliza:  policy.policy_number ?? 'S/N',
    vencimiento:    formatDate(policy.end_date),
    prima_anterior: formatMXN(policy.premium),
    prima_nueva:    formatMXN(newPol?.premium),
    nueva_poliza:   newPol?.policy_number ?? 'S/N',
  }

  let html = '', subject = 'Renovación de su póliza — Murguía Seguros'

  if (stage.email_template_id) {
    const { data: tpl } = await admin
      .from('collection_templates')
      .select('body_email, subject_email')
      .eq('id', stage.email_template_id)
      .single()

    if (tpl?.body_email) {
      html    = renderRenewalTemplate(tpl.body_email, renewalVars).replace(/\n/g, '<br/>')
      subject = tpl.subject_email
        ? renderRenewalTemplate(tpl.subject_email, renewalVars)
        : subject
    }
  } else {
    if (stageIdx === 0) {
      html    = renewalNoticeHtml({ clientName, policyNumber: policy.policy_number, insurer: policy.insurer, endDate: formatDate(policy.end_date), executiveName, executivePhone: null })
      subject = `Renovación de su póliza ${policy.policy_number ?? ''} — Murguía Seguros`.trim()
    } else if (stageIdx === 1 && newPol) {
      html    = renewalPolicyHtml({ clientName, insurer: policy.insurer, prevPolicyNumber: policy.policy_number, prevEndDate: formatDate(policy.end_date), prevPremium: policy.premium, newPolicyNumber: newPol.policy_number, newStartDate: formatDate(newPol.start_date), newEndDate: formatDate(newPol.end_date), newPremium: newPol.premium, executiveName, executivePhone: null })
      subject = `Su nueva póliza está lista — ${policy.insurer}`
    } else {
      html    = renewalAlertHtml({ clientName, policyNumber: policy.policy_number, insurer: policy.insurer, endDate: formatDate(policy.end_date), executiveName, executivePhone: null })
      subject = `AVISO: Su póliza vence pronto — ${policy.insurer}`
    }
  }

  if (!html) {
    return NextResponse.json({ error: 'No se pudo generar la vista previa' }, { status: 500 })
  }

  return NextResponse.json({
    subject,
    html,
    to:     clientEmail,
    toName: clientName,
  })
}
