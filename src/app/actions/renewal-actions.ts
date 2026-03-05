'use server'

import { revalidatePath } from 'next/cache'
import { createClient }   from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, EMAIL_FROM } from '@/lib/resend'

// ─── guards ──────────────────────────────────────────────────
async function requireOperator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') throw new Error('Sin permiso')
  return { user, supabase }
}

// ─── startRenewal ────────────────────────────────────────────
/** Inicia el proceso de renovación para una póliza */
export async function startRenewal(policyId: string) {
  const { user } = await requireOperator()
  const admin = createAdminClient()

  // Verificar que la póliza pertenece a cuenta persona_fisica
  const { data: policy } = await admin
    .from('policies')
    .select('id, account_id, accounts!inner(id, type)')
    .eq('id', policyId)
    .single()

  if (!policy) throw new Error('Póliza no encontrada')

  // Verificar que no hay una renovación activa para esta póliza
  const { data: existing } = await admin
    .from('renewals')
    .select('id')
    .eq('policy_id', policyId)
    .eq('status', 'in_progress')
    .maybeSingle()

  if (existing) throw new Error('Ya existe una renovación activa para esta póliza')

  // Obtener el primer stage activo (sort_order más bajo)
  const { data: firstStage } = await admin
    .from('renewal_stages')
    .select('id')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: renewal, error } = await admin
    .from('renewals')
    .insert({
      policy_id:        policyId,
      account_id:       policy.account_id,
      assigned_to:      user.id,
      current_stage_id: firstStage?.id ?? null,
      status:           'in_progress',
      created_by:       user.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  await admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'renewal.started',
    entity_type: 'renewal',
    entity_id:   renewal.id,
    payload:     { policy_id: policyId },
  })

  revalidatePath('/renovaciones')
  return renewal.id
}

// ─── startBulkRenewals ───────────────────────────────────────
export async function startBulkRenewals(policyIds: string[]) {
  const results: { policyId: string; renewalId?: string; error?: string }[] = []
  for (const id of policyIds) {
    try {
      const renewalId = await startRenewal(id)
      results.push({ policyId: id, renewalId })
    } catch (e) {
      results.push({ policyId: id, error: (e as Error).message })
    }
  }
  return results
}

// ─── linkNewPolicy ───────────────────────────────────────────
/** Vincula la nueva póliza creada al proceso de renovación */
export async function linkNewPolicy(renewalId: string, newPolicyId: string) {
  const { user } = await requireOperator()
  const admin = createAdminClient()

  // Obtener el siguiente stage (stage 2)
  const { data: renewal } = await admin
    .from('renewals')
    .select('current_stage_id')
    .eq('id', renewalId)
    .single()

  if (!renewal) throw new Error('Renovación no encontrada')

  const { data: nextStage } = await admin
    .from('renewal_stages')
    .select('id')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Find the next stage after current
  const { data: stages } = await admin
    .from('renewal_stages')
    .select('id, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const currentIdx = stages?.findIndex(s => s.id === renewal.current_stage_id) ?? -1
  const nextStageId = stages?.[currentIdx + 1]?.id ?? nextStage?.id

  const { error } = await admin
    .from('renewals')
    .update({ new_policy_id: newPolicyId, current_stage_id: nextStageId, updated_at: new Date().toISOString() })
    .eq('id', renewalId)

  if (error) throw new Error(error.message)

  await admin.from('renewal_events').insert({
    renewal_id: renewalId,
    action:     'stage_advanced',
    actor_id:   user.id,
    notes:      'Nueva póliza vinculada',
    metadata:   { new_policy_id: newPolicyId },
  })

  await admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'renewal.policy_linked',
    entity_type: 'renewal',
    entity_id:   renewalId,
    payload:     { new_policy_id: newPolicyId },
  })

  revalidatePath('/renovaciones')
  revalidatePath(`/renovaciones/${renewalId}`)
}

// ─── advanceStage ────────────────────────────────────────────
export async function advanceStage(renewalId: string) {
  const { user } = await requireOperator()
  const admin = createAdminClient()

  const { data: renewal } = await admin
    .from('renewals')
    .select('current_stage_id')
    .eq('id', renewalId)
    .single()

  if (!renewal) throw new Error('Renovación no encontrada')

  const { data: stages } = await admin
    .from('renewal_stages')
    .select('id, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const currentIdx = stages?.findIndex(s => s.id === renewal.current_stage_id) ?? -1
  const nextStageId = stages?.[currentIdx + 1]?.id ?? null

  const { error } = await admin
    .from('renewals')
    .update({ current_stage_id: nextStageId, updated_at: new Date().toISOString() })
    .eq('id', renewalId)

  if (error) throw new Error(error.message)

  await admin.from('renewal_events').insert({
    renewal_id: renewalId,
    stage_id:   nextStageId,
    action:     'stage_advanced',
    actor_id:   user.id,
  })

  revalidatePath('/renovaciones')
  revalidatePath(`/renovaciones/${renewalId}`)
}

// ─── logCallAttempt ──────────────────────────────────────────
export async function logCallAttempt(renewalId: string, notes: string) {
  const { user } = await requireOperator()
  const admin = createAdminClient()

  const { data: renewal, error: fetchErr } = await admin
    .from('renewals')
    .select('call_attempts, current_stage_id')
    .eq('id', renewalId)
    .single()

  if (fetchErr || !renewal) throw new Error('Renovación no encontrada')

  const newAttempts = renewal.call_attempts + 1

  const { error } = await admin
    .from('renewals')
    .update({ call_attempts: newAttempts, updated_at: new Date().toISOString() })
    .eq('id', renewalId)

  if (error) throw new Error(error.message)

  await admin.from('renewal_events').insert({
    renewal_id: renewalId,
    stage_id:   renewal.current_stage_id,
    action:     'call_attempted',
    actor_id:   user.id,
    notes,
    metadata:   { attempt_number: newAttempts },
  })

  await admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'renewal.call_attempted',
    entity_type: 'renewal',
    entity_id:   renewalId,
    payload:     { attempt: newAttempts },
  })

  revalidatePath(`/renovaciones/${renewalId}`)
}

// ─── closeRenewal ────────────────────────────────────────────
interface ClosePayload {
  status: 'changes_requested' | 'cancelled' | 'renewed_pending_payment' | 'renewed_paid'
  notes?: string
  // Para changes_requested
  task?: {
    insurer: string
    change_type: string
    due_date: string
  }
}

export async function closeRenewal(renewalId: string, payload: ClosePayload) {
  const { user } = await requireOperator()
  const admin = createAdminClient()

  const { data: renewal, error: fetchErr } = await admin
    .from('renewals')
    .select('id, account_id, policy_id')
    .eq('id', renewalId)
    .single()

  if (fetchErr || !renewal) throw new Error('Renovación no encontrada')

  const { error } = await admin
    .from('renewals')
    .update({
      status:     payload.status,
      notes:      payload.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', renewalId)

  if (error) throw new Error(error.message)

  await admin.from('renewal_events').insert({
    renewal_id: renewalId,
    action:     'closed',
    actor_id:   user.id,
    notes:      payload.notes,
    metadata:   { status: payload.status },
  })

  // Si pidió cambios → crear task
  if (payload.status === 'changes_requested' && payload.task) {
    await admin.from('tasks').insert({
      title:       `Cambios póliza — ${payload.task.insurer}`,
      description: payload.task.change_type,
      source_type: 'renewal',
      source_id:   renewalId,
      insurer:     payload.task.insurer,
      due_date:    payload.task.due_date,
      status:      'pending',
      assigned_to: user.id,
      created_by:  user.id,
      account_id:  renewal.account_id,
    })
  }

  await admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'renewal.closed',
    entity_type: 'renewal',
    entity_id:   renewalId,
    payload:     { status: payload.status },
  })

  revalidatePath('/renovaciones')
  revalidatePath(`/renovaciones/${renewalId}`)
}

// ─── requireAdmin helper ─────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Solo admin')
  return { user }
}

// ─── Stage queries (team-aware) ───────────────────────────────

interface RenewalStageRow {
  id: string; name: string; days_before: number
  send_email: boolean; send_whatsapp: boolean; requires_new_policy: boolean
  sort_order: number; is_active: boolean
  email_template_id: string | null; whatsapp_template_id: string | null
  team_id: string | null
}

/**
 * Devuelve todos los stages agrupados: globales + por equipo.
 * Para el admin, que necesita ver todos.
 */
export async function getAllRenewalStagesGrouped(): Promise<{
  global:  RenewalStageRow[]
  byTeam:  Record<string, RenewalStageRow[]>
}> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('renewal_stages')
    .select('*')
    .order('sort_order')

  const all = (data ?? []) as RenewalStageRow[]
  const global = all.filter(s => s.team_id === null)
  const byTeam: Record<string, RenewalStageRow[]> = {}
  for (const stage of all) {
    if (stage.team_id) {
      if (!byTeam[stage.team_id]) byTeam[stage.team_id] = []
      byTeam[stage.team_id].push(stage)
    }
  }
  return { global, byTeam }
}

/**
 * Devuelve stages para un equipo.
 * Si el equipo no tiene propios, devuelve globales (fallback).
 */
export async function getRenewalStages(teamId?: string | null): Promise<RenewalStageRow[]> {
  const admin = createAdminClient()
  if (teamId) {
    const { data: teamStages } = await admin
      .from('renewal_stages').select('*').eq('team_id', teamId).order('sort_order')
    if (teamStages && teamStages.length > 0) return teamStages as RenewalStageRow[]
  }
  const { data: global } = await admin
    .from('renewal_stages').select('*').is('team_id', null).order('sort_order')
  return (global ?? []) as RenewalStageRow[]
}

/**
 * Copia los stages globales al equipo como punto de partida para personalización.
 */
export async function copyGlobalRenewalStagesToTeam(teamId: string): Promise<void> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()

  const { data: globals } = await admin
    .from('renewal_stages')
    .select('name, days_before, send_email, send_whatsapp, requires_new_policy, sort_order, email_template_id, whatsapp_template_id')
    .is('team_id', null)
    .order('sort_order')

  if (!globals || globals.length === 0) return

  // Borrar stages previos del equipo (si los hubiera)
  await admin.from('renewal_stages').delete().eq('team_id', teamId)

  // Insertar copias con team_id
  await admin.from('renewal_stages').insert(
    globals.map(s => ({ ...s, team_id: teamId, is_active: true })),
  )

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.create',
    entity_type: 'renewal_stages',
    payload:     { area: 'renovaciones', team_id: teamId, name: 'Personalizar: copiar stages globales al equipo' },
  })

  revalidatePath('/admin/renovaciones')
  revalidatePath('/renovaciones')
}

// ─── updateRenewalStage ──────────────────────────────────────

export async function updateRenewalStage(
  stageId: string,
  updates: Partial<{
    name: string
    days_before: number
    send_email: boolean
    send_whatsapp: boolean
    requires_new_policy: boolean
    sort_order: number
    is_active: boolean
    email_template_id: string | null
    whatsapp_template_id: string | null
  }>
) {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('renewal_stages').update(updates).eq('id', stageId)
  if (error) throw new Error(error.message)

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.update',
    entity_type: 'renewal_stages',
    payload:     { area: 'renovaciones', stage_id: stageId, data: updates },
  })

  revalidatePath('/admin/renovaciones')
  revalidatePath('/renovaciones')
}

export async function createRenewalStage(
  teamId: string | null,
  data: {
    name: string
    days_before: number
    send_email: boolean
    send_whatsapp: boolean
    requires_new_policy: boolean
    sort_order: number
  }
) {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const { data: inserted, error } = await admin
    .from('renewal_stages')
    .insert({ ...data, team_id: teamId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.create',
    entity_type: 'renewal_stages',
    payload:     { area: 'renovaciones', team_id: teamId, name: data.name, data },
  })

  revalidatePath('/admin/renovaciones')
  revalidatePath('/renovaciones')
}

export async function deleteRenewalStage(stageId: string) {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('renewal_stages').delete().eq('id', stageId)
  if (error) throw new Error(error.message)

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.delete',
    entity_type: 'renewal_stages',
    payload:     { area: 'renovaciones', stage_id: stageId },
  })

  revalidatePath('/admin/renovaciones')
}

export async function reorderRenewalStages(orderedIds: string[]) {
  await requireAdmin()
  const admin = createAdminClient()
  await Promise.all(
    orderedIds.map((id, index) =>
      admin.from('renewal_stages').update({ sort_order: index + 1 }).eq('id', id)
    )
  )

  revalidatePath('/admin/renovaciones')
  revalidatePath('/renovaciones')
}

// ─── getSemaphoreSettings ─────────────────────────────────────

export async function getSemaphoreSettings(): Promise<{ green: number; yellow: number }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', ['renewal_semaphore_green', 'renewal_semaphore_yellow'])
  const map = Object.fromEntries((data ?? []).map(r => [r.key as string, r.value as string]))
  return {
    green:  parseInt(map['renewal_semaphore_green']  ?? '80', 10),
    yellow: parseInt(map['renewal_semaphore_yellow'] ?? '50', 10),
  }
}

// ─── saveSemaphoreSettings ────────────────────────────────────

export async function saveSemaphoreSettings(
  green: number,
  yellow: number,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Solo admin' }

  const admin = createAdminClient()
  const { error } = await admin.from('app_settings').upsert([
    { key: 'renewal_semaphore_green',  value: String(green)  },
    { key: 'renewal_semaphore_yellow', value: String(yellow) },
  ], { onConflict: 'key' })
  if (error) return { error: error.message }

  revalidatePath('/admin/renovaciones')
  revalidatePath('/renovaciones')
  return { success: true }
}

// ─── sendRenewalEmail ─────────────────────────────────────────

export async function sendRenewalEmail(input: {
  renewalId: string
  to: string
  cc?: string[]
  subject: string
  body: string
  attachment?: { filename: string; base64: string }
}): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const ctx = await requireOperator()
    userId = ctx.user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()

  const { data: renewal } = await admin
    .from('renewals').select('id').eq('id', input.renewalId).single()
  if (!renewal) return { error: 'Renovación no encontrada' }

  const attachments = input.attachment
    ? [{ filename: input.attachment.filename, content: Buffer.from(input.attachment.base64, 'base64') }]
    : undefined

  const { error: emailError } = await resend.emails.send({
    from:    EMAIL_FROM,
    to:      input.to,
    cc:      input.cc && input.cc.length > 0 ? input.cc : undefined,
    subject: input.subject,
    html:    input.body.replace(/\n/g, '<br>'),
    attachments,
  })
  if (emailError) return { error: (emailError as { message: string }).message }

  await admin.from('renewal_events').insert({
    renewal_id: input.renewalId,
    action:     'email_sent',
    actor_id:   userId,
    metadata:   { to: input.to, subject: input.subject, has_attachment: !!input.attachment },
  })

  revalidatePath(`/renovaciones/${input.renewalId}`)
  return { success: true }
}
