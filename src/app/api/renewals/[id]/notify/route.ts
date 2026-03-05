import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, EMAIL_FROM } from '@/lib/resend'
import { sendWhatsApp }      from '@/lib/kapso'
import { getEmailCcList }    from '@/lib/email-cc'
import { renewalNoticeHtml, renewalNoticeText }   from '@/lib/email-templates/renewal-notice'
import { renewalPolicyHtml, renewalPolicyText }   from '@/lib/email-templates/renewal-policy'
import { renewalAlertHtml,  renewalAlertText }    from '@/lib/email-templates/renewal-alert'
import {
  renderRenewalTemplate,
  formatMXN,
  type RenewalVars,
} from '@/lib/collection-vars'

function formatDate(iso: string | null): string {
  if (!iso) return 'N/D'
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: renewalId } = await params

  // channel = 'email' | 'whatsapp' — qué canal enviar
  const body = await req.json().catch(() => ({})) as { channel?: string }
  const channel = body.channel === 'email' ? 'email'
                : body.channel === 'whatsapp' ? 'whatsapp'
                : 'both'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, full_name, team_id').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: renewal } = await admin
    .from('renewals')
    .select(`
      id, status, current_stage_id,
      policy:policies!renewals_policy_id_fkey(
        id, policy_number, insurer, premium, start_date, end_date, branch,
        tomador:contacts!policies_tomador_id_fkey(id, full_name, email, phone, is_vip)
      ),
      new_policy:policies!renewals_new_policy_id_fkey(
        id, policy_number, insurer, premium, start_date, end_date
      ),
      stage:renewal_stages!renewals_current_stage_id_fkey(
        id, name, send_email, send_whatsapp, requires_new_policy,
        email_template_id, whatsapp_template_id
      )
    `)
    .eq('id', renewalId)
    .single()

  if (!renewal) return NextResponse.json({ error: 'Renovación no encontrada' }, { status: 404 })
  if (renewal.status !== 'in_progress') {
    return NextResponse.json({ error: 'Renovación ya cerrada' }, { status: 400 })
  }

  type StageShape  = {
    id: string
    name: string
    send_email: boolean
    send_whatsapp: boolean
    requires_new_policy: boolean
    email_template_id: string | null
    whatsapp_template_id: string | null
  }
  type PolicyShape = { id: string; policy_number: string | null; insurer: string; premium: number | null; start_date: string | null; end_date: string | null; branch: string; tomador: { id: string; full_name: string; email: string | null; phone: string | null; is_vip: boolean } | null }
  type NewPolShape = { id: string; policy_number: string | null; insurer: string; premium: number | null; start_date: string | null; end_date: string | null }

  const rawStage  = renewal.stage   as unknown
  const rawPolicy = renewal.policy  as unknown
  const rawNewPol = renewal.new_policy as unknown

  const stage    = (Array.isArray(rawStage)  ? rawStage[0]  : rawStage)  as StageShape  | null
  const policy   = (Array.isArray(rawPolicy) ? rawPolicy[0] : rawPolicy) as PolicyShape | null
  const newPol   = (Array.isArray(rawNewPol) ? rawNewPol[0] : rawNewPol) as NewPolShape | null

  if (!policy) return NextResponse.json({ error: 'Póliza no encontrada' }, { status: 404 })

  const tomador = Array.isArray(policy.tomador) ? policy.tomador[0] : policy.tomador
  const clientEmail   = tomador?.email ?? null
  const clientPhone   = tomador?.phone ?? null
  const clientName    = tomador?.full_name ?? 'Cliente'
  const executiveName = (profile.full_name as string | null) ?? 'Su ejecutivo'

  const { data: allStages } = await admin
    .from('renewal_stages')
    .select('id, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const stageIdx = allStages?.findIndex(s => s.id === stage?.id) ?? 0

  // ── Renewal vars para plantillas de DB ────────────────────────
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

  const sentEvents: string[] = []

  // ── Email ─────────────────────────────────────────────────────
  if ((channel === 'email' || channel === 'both') && stage?.send_email && clientEmail) {
    let html = '', text = '', subject = 'Renovación de su póliza — Murguía Seguros'

    if (stage.email_template_id) {
      // Usar plantilla de DB
      const { data: tpl } = await admin
        .from('collection_templates')
        .select('body_email, subject_email')
        .eq('id', stage.email_template_id)
        .single()

      if (tpl?.body_email) {
        html    = renderRenewalTemplate(tpl.body_email, renewalVars).replace(/\n/g, '<br/>')
        text    = renderRenewalTemplate(tpl.body_email, renewalVars)
        subject = tpl.subject_email
          ? renderRenewalTemplate(tpl.subject_email, renewalVars)
          : subject
      }
    } else {
      // Fallback a plantillas TypeScript hardcodeadas
      if (stageIdx === 0) {
        html    = renewalNoticeHtml({ clientName, policyNumber: policy.policy_number, insurer: policy.insurer, endDate: formatDate(policy.end_date), executiveName, executivePhone: null })
        text    = renewalNoticeText({ clientName, policyNumber: policy.policy_number, insurer: policy.insurer, endDate: formatDate(policy.end_date), executiveName, executivePhone: null })
        subject = `Renovación de su póliza ${policy.policy_number ?? ''} — Murguía Seguros`.trim()
      } else if (stageIdx === 1 && newPol) {
        html    = renewalPolicyHtml({ clientName, insurer: policy.insurer, prevPolicyNumber: policy.policy_number, prevEndDate: formatDate(policy.end_date), prevPremium: policy.premium, newPolicyNumber: newPol.policy_number, newStartDate: formatDate(newPol.start_date), newEndDate: formatDate(newPol.end_date), newPremium: newPol.premium, executiveName, executivePhone: null })
        text    = renewalPolicyText({ clientName, insurer: policy.insurer, prevPolicyNumber: policy.policy_number, prevEndDate: formatDate(policy.end_date), prevPremium: policy.premium, newPolicyNumber: newPol.policy_number, newStartDate: formatDate(newPol.start_date), newEndDate: formatDate(newPol.end_date), newPremium: newPol.premium, executiveName, executivePhone: null })
        subject = `Su nueva póliza está lista — ${policy.insurer}`
      } else {
        html    = renewalAlertHtml({ clientName, policyNumber: policy.policy_number, insurer: policy.insurer, endDate: formatDate(policy.end_date), executiveName, executivePhone: null })
        text    = renewalAlertText({ clientName, policyNumber: policy.policy_number, insurer: policy.insurer, endDate: formatDate(policy.end_date), executiveName, executivePhone: null })
        subject = `AVISO: Su póliza vence pronto — ${policy.insurer}`
      }
    }

    if (html) {
      const isVip = tomador?.is_vip ?? false
      const cc    = await getEmailCcList(isVip, (profile as { team_id?: string | null }).team_id ?? undefined)
      await resend.emails.send({
        from: EMAIL_FROM,
        to:   clientEmail,
        subject,
        html,
        text,
        ...(cc.length ? { cc } : {}),
      })
      sentEvents.push('email_sent')

      await admin.from('renewal_events').insert({
        renewal_id: renewalId,
        stage_id:   stage?.id ?? null,
        action:     'email_sent',
        actor_id:   user.id,
        metadata:   { to: clientEmail },
      })
    }
  }

  // ── WhatsApp ──────────────────────────────────────────────────
  if ((channel === 'whatsapp' || channel === 'both') && stage?.send_whatsapp && clientPhone) {
    let waMsg = ''

    if (stage.whatsapp_template_id) {
      // Usar plantilla de DB
      const { data: tpl } = await admin
        .from('collection_templates')
        .select('body_whatsapp')
        .eq('id', stage.whatsapp_template_id)
        .single()

      if (tpl?.body_whatsapp) {
        waMsg = renderRenewalTemplate(tpl.body_whatsapp, renewalVars)
      }
    } else {
      // Fallback a mensaje hardcodeado
      waMsg = stageIdx === 1 && newPol
        ? `Hola ${clientName}, su nueva póliza con ${policy.insurer} está lista. Prima: $${newPol.premium?.toLocaleString('es-MX') ?? 'N/D'} MXN. Vigencia: ${formatDate(newPol.start_date)} al ${formatDate(newPol.end_date)}. Por favor confirme respondiendo este mensaje. — Murguía Seguros`
        : `Hola ${clientName}, recordatorio: su póliza con ${policy.insurer} vence el ${formatDate(policy.end_date)}. Por favor confirme la renovación respondiendo este mensaje. — Murguía Seguros`
    }

    if (waMsg) {
      const sent = await sendWhatsApp(clientPhone, waMsg)
      if (sent) {
        sentEvents.push('whatsapp_sent')
        await admin.from('renewal_events').insert({
          renewal_id: renewalId,
          stage_id:   stage?.id ?? null,
          action:     'whatsapp_sent',
          actor_id:   user.id,
          metadata:   { to: clientPhone },
        })
      }
    }
  }

  await admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'renewal.notified',
    entity_type: 'renewal',
    entity_id:   renewalId,
    payload:     { channel, events: sentEvents },
  })

  return NextResponse.json({ ok: true, events: sentEvents })
}
