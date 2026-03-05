'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient }      from '@/lib/supabase/server'
import { revalidatePath }    from 'next/cache'
import type { HistoryEntry } from './cc-history-actions'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityType = 'call' | 'meeting' | 'note' | 'whatsapp' | 'email'

export interface LogActivityPayload {
  type:             ActivityType
  direction:        'inbound' | 'outbound'
  body:             string
  subject?:         string
  duration_seconds?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function activityChannel(type: ActivityType): string {
  if (type === 'whatsapp') return 'whatsapp'
  if (type === 'email')    return 'email'
  if (type === 'call')     return 'phone'
  return 'note'
}

// ── logActivity ───────────────────────────────────────────────────────────────
// Registra una actividad manual (llamada, reunión, nota, WA, email) para una cuenta.
// Retorna un HistoryEntry para actualización optimista en el cliente.

export async function logActivity(
  accountId: string,
  payload:   LogActivityPayload,
): Promise<HistoryEntry> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('account_activities')
    .insert({
      account_id:       accountId,
      type:             payload.type,
      direction:        payload.direction,
      body:             payload.body,
      subject:          payload.subject ?? null,
      actor_id:         user.id,
      duration_seconds: payload.duration_seconds ?? null,
    })
    .select('id, type, direction, body, subject, created_at, profiles!actor_id(full_name)')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(`/accounts/${accountId}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = (data as any).profiles as { full_name: string | null } | null

  return {
    id:            data.id,
    source:        'manual',
    channel:       activityChannel(payload.type),
    direction:     data.direction as 'inbound' | 'outbound',
    body:          data.body,
    subject:       data.subject ?? null,
    template_name: null,
    sender_name:   profile?.full_name ?? null,
    created_at:    data.created_at,
  }
}

// ── assignPortalAIAgent ───────────────────────────────────────────────────────
// Asigna o desasigna un agente IA portal a una cuenta.
// Solo admin/ops pueden hacer esto.

export async function assignPortalAIAgent(
  accountId: string,
  agentId:   string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'ops'].includes(profile?.role ?? '')) {
    return { error: 'Solo admin/ops pueden asignar agentes IA' }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('accounts')
    .update({ ai_agent_id: agentId })
    .eq('id', accountId)

  if (error) return { error: error.message }

  revalidatePath(`/accounts/${accountId}`)
  return {}
}

// ── getPortalAgents ───────────────────────────────────────────────────────────
// Retorna todos los agentes portal disponibles (agent_type = 'portal').

export async function getPortalAgents(): Promise<{ id: string; tool_name: string; persona_name: string | null; is_enabled: boolean }[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('ai_tool_configs')
    .select('id, tool_name, persona_name, is_enabled')
    .eq('agent_type', 'portal')
    .eq('is_enabled', true)
    .order('tool_name')

  return (data ?? []).map(row => ({
    id:           row.id,
    tool_name:    row.tool_name,
    persona_name: (row as Record<string, unknown>).persona_name as string | null ?? null,
    is_enabled:   row.is_enabled,
  }))
}
