'use server'

import { revalidatePath }    from 'next/cache'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, EMAIL_FROM } from '@/lib/resend'
import { sendWhatsApp }      from '@/lib/kapso'
import { getEmailCcList }    from '@/lib/email-cc'
import {
  renderTemplate,
  formatMXN,
  formatDate,
  calcDaysUntil,
  BRANCH_LABELS,
  type CollectionVars,
} from '@/lib/collection-vars'

// ─── Types ────────────────────────────────────────────────────

export interface CollectionTemplate {
  id:                   string
  name:                 string
  type:                 string   // 'cobranza' | 'renovacion'
  channel:              string   // 'email' | 'whatsapp' | 'both'
  subject_email:        string | null
  body_email:           string | null
  body_whatsapp:        string | null
  is_shared:            boolean
  is_active:            boolean
  created_by:           string
  created_at:           string
  conducto_cobro_filter: string | null  // null=todos, 'domiciliado', 'no_domiciliado'
}

export interface CollectionTemplateInput {
  name:                  string
  type?:                 string   // 'cobranza' | 'renovacion' (default 'cobranza')
  channel:               'email' | 'whatsapp' | 'both'
  subject_email:         string | null
  body_email:            string | null
  body_whatsapp:         string | null
  is_shared:             boolean
  is_active:             boolean
  conducto_cobro_filter?: string | null
}

// ─── Auth helper ──────────────────────────────────────────────

async function requireOperator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') throw new Error('Acceso denegado')
  return { user, supabase, profile }
}

// ─── Queries ──────────────────────────────────────────────────

export async function getCollectionTemplates(): Promise<CollectionTemplate[]> {
  const { user } = await requireOperator()
  const supabase = await createClient()

  const { data } = await supabase
    .from('collection_templates')
    .select('*')
    .eq('is_active', true)
    .or(`created_by.eq.${user.id},is_shared.eq.true`)
    .order('name')

  return (data ?? []) as CollectionTemplate[]
}

// ─── Send ─────────────────────────────────────────────────────

export async function sendCollectionNotice(
  policyId:   string,
  templateId: string,
  channels:   ('email' | 'whatsapp')[],
  receiptId?: string,
): Promise<{ ok: boolean; sent: string[]; error?: string }> {
  const { user, profile } = await requireOperator()
  const admin = createAdminClient()

  // Cargar póliza + cuenta + tomador
  const { data: policy } = await admin
    .from('policies')
    .select(`
      id, policy_number, insurer, branch, start_date, premium, end_date, conducto_cobro, account_id,
      contacts!tomador_id(id, full_name, email, phone)
    `)
    .eq('id', policyId)
    .single()

  if (!policy) return { ok: false, sent: [], error: 'Póliza no encontrada' }

  const tomador = (Array.isArray(policy.contacts)
    ? policy.contacts[0]
    : policy.contacts) as { id: string; full_name: string; email: string | null; phone: string | null } | null

  const { data: account } = await admin
    .from('accounts')
    .select('name, team_id')
    .eq('id', policy.account_id)
    .single()

  // Cargar plantilla
  const { data: template } = await admin
    .from('collection_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (!template) return { ok: false, sent: [], error: 'Plantilla no encontrada' }

  // Construir variables
  const vars: CollectionVars = {
    nombre:           tomador?.full_name ?? 'Cliente',
    monto:            formatMXN(policy.premium),
    numero_poliza:    policy.policy_number ?? 'S/N',
    aseguradora:      policy.insurer ?? '—',
    vencimiento:      formatDate(policy.end_date),
    cuenta:           account?.name ?? '—',
    ejecutivo:        profile.full_name ?? 'Ejecutivo',
    fecha_hoy:        formatDate(new Date().toISOString()),
    // Campos extendidos
    ramo:             BRANCH_LABELS[(policy as { branch?: string }).branch ?? ''] ?? '',
    inicio_vigencia:  formatDate((policy as { start_date?: string }).start_date),
    dias_vencimiento: calcDaysUntil(policy.end_date),
    telefono_cliente: tomador?.phone ?? '',
    email_cliente:    tomador?.email ?? '',
    conducto:         (policy as { conducto_cobro?: string }).conducto_cobro ?? '',
  }

  const renderedWA    = template.body_whatsapp ? renderTemplate(template.body_whatsapp, vars) : null
  const renderedEmail = template.body_email     ? renderTemplate(template.body_email,    vars) : null

  const sent: string[] = []
  let channelUsed = channels.join('+')

  // ── Enviar WhatsApp ──────────────────────────────────────────
  if (channels.includes('whatsapp') && renderedWA && tomador?.phone) {
    const ok = await sendWhatsApp(tomador.phone, renderedWA)
    if (ok) sent.push('whatsapp')
  }

  // ── Enviar correo ────────────────────────────────────────────
  if (channels.includes('email') && renderedEmail && tomador?.email) {
    try {
      const cc = await getEmailCcList(false, account?.team_id ?? undefined)
      await resend.emails.send({
        from:    EMAIL_FROM,
        to:      tomador.email,
        subject: template.subject_email
          ? renderTemplate(template.subject_email, vars)
          : `Aviso de cobranza — ${vars.numero_poliza}`,
        text: renderedEmail,
        ...(cc.length ? { cc } : {}),
      })
      sent.push('email')
    } catch {
      // no bloquear si falla el email
    }
  }

  if (sent.length === 0) {
    return { ok: false, sent: [], error: 'No se pudo enviar por ningún canal (verifica datos de contacto)' }
  }

  channelUsed = sent.join('+')

  // ── Registrar envío ──────────────────────────────────────────
  await admin.from('collection_sends').insert({
    policy_id:         policyId,
    account_id:        policy.account_id,
    template_id:       templateId,
    template_name:     template.name,
    channel:           channelUsed,
    rendered_whatsapp: renderedWA,
    rendered_email:    renderedEmail,
    sent_to_email:     sent.includes('email')     ? tomador?.email  ?? null : null,
    sent_to_phone:     sent.includes('whatsapp')  ? tomador?.phone  ?? null : null,
    sent_by:           user.id,
    ...(receiptId ? { receipt_id: receiptId } : {}),
  })

  // ── Audit ────────────────────────────────────────────────────
  await admin.from('audit_events').insert({
    actor_id: user.id,
    action:   'collection.sent',
    payload:  { policy_id: policyId, template_id: templateId, channels: sent },
  })

  revalidatePath(`/accounts/${policy.account_id}`)
  revalidatePath('/cobranza')

  return { ok: true, sent }
}

// ─── Admin CRUD de plantillas ─────────────────────────────────

export async function createCollectionTemplate(
  teamIdOrInput: string | null | CollectionTemplateInput,
  maybeInput?: CollectionTemplateInput,
): Promise<{ id: string }> {
  // Soporta firma nueva createCollectionTemplate(teamId, input) y legacy createCollectionTemplate(input)
  const teamId = maybeInput !== undefined ? (teamIdOrInput as string | null) : null
  const input  = maybeInput !== undefined ? maybeInput : (teamIdOrInput as CollectionTemplateInput)
  const { user } = await requireOperator()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('collection_templates')
    .insert({ ...input, team_id: teamId, created_by: user.id })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Error al crear plantilla')

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.create',
    entity_type: 'collection_templates',
    payload:     { area: 'cobranza', team_id: teamId, name: input.name, data: input },
  })

  revalidatePath('/admin/cobranza')
  revalidatePath('/admin/renovaciones')
  return { id: data.id }
}

export async function updateCollectionTemplate(
  id:    string,
  input: Partial<CollectionTemplateInput>,
): Promise<void> {
  const { user } = await requireOperator()
  const admin = createAdminClient()

  const { error } = await admin
    .from('collection_templates')
    .update(input)
    .eq('id', id)

  if (error) throw new Error(error.message)

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.update',
    entity_type: 'collection_templates',
    payload:     { area: 'cobranza', template_id: id, data: input },
  })

  revalidatePath('/admin/cobranza')
  revalidatePath('/admin/renovaciones')
}

export async function deleteCollectionTemplate(id: string): Promise<void> {
  const { user } = await requireOperator()
  const admin = createAdminClient()

  const { error } = await admin
    .from('collection_templates')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.delete',
    entity_type: 'collection_templates',
    payload:     { area: 'cobranza', template_id: id },
  })

  revalidatePath('/admin/cobranza')
}
