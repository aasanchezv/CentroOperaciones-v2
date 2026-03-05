'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type HistorySource = 'agent' | 'cobranza' | 'renovacion' | 'portal' | 'manual'

export interface HistoryEntry {
  id:            string
  source:        HistorySource
  channel:       string        // 'email' | 'whatsapp' | 'email+whatsapp' | 'portal'
  direction:     'inbound' | 'outbound'
  body:          string | null
  subject:       string | null
  template_name: string | null // null para mensajes manuales de agente
  sender_name:   string | null
  created_at:    string
}

// ── getAccountHistory ─────────────────────────────────────────────────────────
// Combina cc_messages (agente/portal), collection_sends (cobranza) y
// renewal_events (renovaciones) para dar un historial unificado por cuenta.
// Requiere service_role — llamar solo desde server actions.

export async function getAccountHistory(accountId: string): Promise<HistoryEntry[]> {
  if (!accountId) return []

  const admin = createAdminClient()

  const [ccResult, collResult, renewResult, activitiesResult] = await Promise.all([
    // 1. Mensajes de conversaciones (agente manual + portal)
    admin
      .from('cc_messages')
      .select('id, direction, channel, body, subject, sender_name, created_at, conversations!inner(account_id)')
      .eq('conversations.account_id', accountId)
      .neq('direction', 'note')
      .order('created_at', { ascending: false })
      .limit(200),

    // 2. Envíos de cobranza (automatizados con plantilla)
    admin
      .from('collection_sends')
      .select('id, template_name, channel, rendered_email, rendered_whatsapp, created_at, profiles!sent_by(full_name)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(100),

    // 3. Eventos de renovación (email_sent / whatsapp_sent)
    //    renewals tiene account_id directo — join un solo nivel
    admin
      .from('renewal_events')
      .select('id, action, metadata, actor_id, created_at, renewals!inner(account_id)')
      .eq('renewals.account_id', accountId)
      .in('action', ['email_sent', 'whatsapp_sent'])
      .order('created_at', { ascending: false })
      .limit(100),

    // 4. Actividades manuales registradas por agentes
    admin
      .from('account_activities')
      .select('id, type, direction, body, subject, created_at, profiles!actor_id(full_name)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const entries: HistoryEntry[] = []

  // Mapear cc_messages (agente o portal)
  for (const m of (ccResult.data ?? [])) {
    entries.push({
      id:            m.id,
      source:        m.channel === 'portal' ? 'portal' : 'agent',
      channel:       m.channel,
      direction:     m.direction as 'inbound' | 'outbound',
      body:          m.body ?? null,
      subject:       (m as { subject?: string | null }).subject ?? null,
      template_name: null,
      sender_name:   m.sender_name ?? null,
      created_at:    m.created_at,
    })
  }

  // Mapear collection_sends (cobranza automatizada)
  for (const s of (collResult.data ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prof = (s as any).profiles as { full_name: string } | null
    entries.push({
      id:            s.id,
      source:        'cobranza',
      channel:       s.channel,
      direction:     'outbound',
      body:          s.rendered_email ?? s.rendered_whatsapp ?? null,
      subject:       null,
      template_name: s.template_name,
      sender_name:   prof?.full_name ?? null,
      created_at:    s.created_at,
    })
  }

  // Mapear renewal_events (renovaciones automatizadas)
  for (const e of (renewResult.data ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (e.metadata ?? {}) as any
    entries.push({
      id:            e.id,
      source:        'renovacion',
      channel:       e.action === 'email_sent' ? 'email' : 'whatsapp',
      direction:     'outbound',
      body:          meta.body ?? null,
      subject:       meta.subject ?? null,
      template_name: meta.template_name ?? null,
      sender_name:   null,
      created_at:    e.created_at,
    })
  }

  // Mapear actividades manuales (llamadas, reuniones, notas, etc.)
  for (const a of (activitiesResult.data ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = (a as any).profiles as { full_name: string | null } | null
    const ch = a.type === 'whatsapp' ? 'whatsapp'
             : a.type === 'email'    ? 'email'
             : a.type === 'call'     ? 'phone'
             : 'note'
    entries.push({
      id:            a.id,
      source:        'manual',
      channel:       ch,
      direction:     a.direction as 'inbound' | 'outbound',
      body:          a.body ?? null,
      subject:       a.subject ?? null,
      template_name: null,
      sender_name:   profile?.full_name ?? null,
      created_at:    a.created_at,
    })
  }

  // Ordenar cronológicamente (más reciente primero)
  return entries.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}
