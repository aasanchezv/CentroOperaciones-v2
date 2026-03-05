'use server'

import { revalidatePath } from 'next/cache'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, EMAIL_FROM } from '@/lib/resend'
import type { MovementType, PolicyMovement } from '@/types/database.types'

// ─── Auth helpers ─────────────────────────────────────────────

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  return user
}

async function requireAdmin() {
  const user = await getUser()
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Acceso denegado')
  return user
}

// ─── Movement Types — Admin ───────────────────────────────────

export async function getMovementTypes(): Promise<MovementType[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('movement_types')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) return []
  return (data ?? []) as MovementType[]
}

export interface MovementTypeInput {
  name:            string
  code:            string
  description?:    string | null
  custom_fields:   object[]
  affects_premium: boolean
  company_only:    boolean
  team_id?:        string | null
  sort_order?:     number
}

export async function createMovementType(
  input: MovementTypeInput,
): Promise<{ id: string } | { error: string }> {
  try {
    const user  = await requireAdmin()
    const admin = createAdminClient()

    // sort_order = max + 1
    const { data: existing } = await admin
      .from('movement_types')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
    const nextOrder = ((existing?.[0]?.sort_order as number | null) ?? 0) + 1

    const { data, error } = await admin
      .from('movement_types')
      .insert({
        name:            input.name.trim(),
        code:            input.code,
        description:     input.description ?? null,
        custom_fields:   input.custom_fields,
        affects_premium: input.affects_premium,
        company_only:    input.company_only,
        team_id:         input.team_id ?? null,
        sort_order:      input.sort_order ?? nextOrder,
        created_by:      user.id,
      })
      .select('id')
      .single()

    if (error) return { error: error.message }

    await admin.from('audit_events').insert({
      actor_id:    user.id,
      action:      'movement_type.created',
      entity_type: 'movement_type',
      entity_id:   data.id,
      payload:     { name: input.name, code: input.code },
    })

    revalidatePath('/admin/movimientos')
    return { id: data.id }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateMovementType(
  id:     string,
  input:  Partial<MovementTypeInput> & { is_active?: boolean },
): Promise<{ success: true } | { error: string }> {
  try {
    const user  = await requireAdmin()
    const admin = createAdminClient()

    const updates: Record<string, unknown> = {}
    if (input.name            !== undefined) updates.name            = input.name.trim()
    if (input.code            !== undefined) updates.code            = input.code
    if (input.description     !== undefined) updates.description     = input.description
    if (input.custom_fields   !== undefined) updates.custom_fields   = input.custom_fields
    if (input.affects_premium !== undefined) updates.affects_premium = input.affects_premium
    if (input.company_only    !== undefined) updates.company_only    = input.company_only
    if (input.team_id         !== undefined) updates.team_id         = input.team_id
    if (input.sort_order      !== undefined) updates.sort_order      = input.sort_order
    if (input.is_active       !== undefined) updates.is_active       = input.is_active

    const { error } = await admin.from('movement_types').update(updates).eq('id', id)
    if (error) return { error: error.message }

    await admin.from('audit_events').insert({
      actor_id:    user.id,
      action:      'movement_type.updated',
      entity_type: 'movement_type',
      entity_id:   id,
      payload:     updates,
    })

    revalidatePath('/admin/movimientos')
    return { success: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function deleteMovementType(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const user  = await requireAdmin()
    const admin = createAdminClient()

    // Check if any movements use this type
    const { count } = await admin
      .from('policy_movements')
      .select('id', { count: 'exact', head: true })
      .eq('movement_type_id', id)

    if ((count ?? 0) > 0) {
      return { error: 'No se puede eliminar: ya existen movimientos con este tipo.' }
    }

    const { error } = await admin.from('movement_types').delete().eq('id', id)
    if (error) return { error: error.message }

    await admin.from('audit_events').insert({
      actor_id:    user.id,
      action:      'movement_type.deleted',
      entity_type: 'movement_type',
      entity_id:   id,
      payload:     {},
    })

    revalidatePath('/admin/movimientos')
    return { success: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function reorderMovementTypes(orderedIds: string[]): Promise<void> {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    await Promise.all(
      orderedIds.map((id, idx) =>
        admin.from('movement_types').update({ sort_order: idx }).eq('id', id)
      )
    )
    revalidatePath('/admin/movimientos')
  } catch {
    // ignore
  }
}

// ─── Movements — Agent/Ops ────────────────────────────────────

export async function createMovement(data: {
  policy_id:        string
  movement_type_id: string
  field_values:     Record<string, unknown>
  notes?:           string
}): Promise<{ id: string; task_id: string | null } | { error: string }> {
  try {
    const user  = await getUser()
    const admin = createAdminClient()

    // Batch pre-fetch: policy + movement type + account + agent profile (team_id)
    const [
      { data: policy },
      { data: mtype },
      { data: agentProfile },
    ] = await Promise.all([
      admin.from('policies').select('id, account_id, insurer, policy_number').eq('id', data.policy_id).single(),
      admin.from('movement_types').select('id, name').eq('id', data.movement_type_id).single(),
      admin.from('profiles').select('team_id').eq('id', user.id).single(),
    ])

    if (!policy) return { error: 'Póliza no encontrada' }
    if (!mtype)  return { error: 'Tipo de movimiento no encontrado' }

    const { data: account } = await admin
      .from('accounts')
      .select('id, name')
      .eq('id', policy.account_id)
      .single()

    // Insert movement (team_id denormalizado para RLS eficiente de manager)
    const { data: movement, error: mvErr } = await admin
      .from('policy_movements')
      .insert({
        policy_id:          data.policy_id,
        account_id:         policy.account_id,
        movement_type_id:   data.movement_type_id,
        movement_type_name: mtype.name,
        insurer:            policy.insurer,
        policy_number:      policy.policy_number ?? null,
        status:             'draft',
        field_values:       data.field_values,
        notes:              data.notes ?? null,
        assigned_to:        user.id,
        created_by:         user.id,
        team_id:            agentProfile?.team_id ?? null,
      })
      .select('id')
      .single()

    if (mvErr || !movement) return { error: mvErr?.message ?? 'Error al crear movimiento' }

    // Create initial movement_event
    await admin.from('movement_events').insert({
      movement_id: movement.id,
      actor_id:    user.id,
      status_from: null,
      status_to:   'draft',
      notes:       'Movimiento creado',
    })

    // Auto-create task
    const policyLabel = policy.policy_number ? ` (${policy.policy_number})` : ''
    const accountName = account?.name ?? 'Cliente'
    const taskTitle   = `Movimiento: ${mtype.name} — ${accountName}${policyLabel}`

    const { data: task } = await admin
      .from('tasks')
      .insert({
        title:       taskTitle,
        source_type: 'movement',
        source_id:   movement.id,
        insurer:     policy.insurer,
        account_id:  policy.account_id,
        status:      'pending',
        assigned_to: user.id,
        created_by:  user.id,
      })
      .select('id')
      .single()

    // Link task back to movement
    if (task) {
      await admin.from('policy_movements').update({ task_id: task.id }).eq('id', movement.id)
    }

    await admin.from('audit_events').insert({
      actor_id:    user.id,
      action:      'movement.created',
      entity_type: 'policy_movement',
      entity_id:   movement.id,
      payload:     { movement_type: mtype.name, policy_id: data.policy_id },
    })

    revalidatePath(`/accounts/${policy.account_id}`)
    revalidatePath('/movimientos')
    revalidatePath('/tareas')

    return { id: movement.id, task_id: task?.id ?? null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateMovementStatus(
  id:      string,
  status:  'sent' | 'confirmed' | 'rejected',
  notes?:  string,
): Promise<{ success: true } | { error: string }> {
  try {
    const user  = await getUser()
    const admin = createAdminClient()

    // Fetch current status
    const { data: movement } = await admin
      .from('policy_movements')
      .select('id, status, account_id')
      .eq('id', id)
      .single()

    if (!movement) return { error: 'Movimiento no encontrado' }

    const { error } = await admin
      .from('policy_movements')
      .update({ status })
      .eq('id', id)

    if (error) return { error: error.message }

    await admin.from('movement_events').insert({
      movement_id: id,
      actor_id:    user.id,
      status_from: movement.status,
      status_to:   status,
      notes:       notes ?? null,
    })

    revalidatePath(`/accounts/${movement.account_id}`)
    revalidatePath('/movimientos')
    return { success: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function getMovementsForPolicy(policyId: string): Promise<PolicyMovement[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('policy_movements')
    .select('*')
    .eq('policy_id', policyId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as PolicyMovement[]
}

export async function getMyMovements(filters?: {
  insurer?: string
  status?:  string
}): Promise<PolicyMovement[]> {
  const user  = await getUser()
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('role, team_id').eq('id', user.id).single()

  const admin = createAdminClient()

  // Ventana 90 días — datos históricos siguen en BD, consultables con filtro de fecha en UI
  const since = new Date()
  since.setDate(since.getDate() - 90)

  let query = admin
    .from('policy_movements')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(200)

  // Role-based scoping (usa idx_policy_movements_team_id / assigned_to)
  if (profile?.role === 'agent') {
    query = query.eq('assigned_to', user.id)
  } else if (profile?.role === 'manager' && profile.team_id) {
    query = query.eq('team_id', profile.team_id)
  }
  // admin/ops: sin scoping adicional — ventana 90 días actúa como límite

  if (filters?.insurer) query = query.eq('insurer', filters.insurer)
  if (filters?.status)  query = query.eq('status', filters.status)

  const { data } = await query
  return (data ?? []) as PolicyMovement[]
}

// ─── Batch email to insurer ───────────────────────────────────

export async function sendMovementFollowUp(data: {
  movementIds: string[]
  to:          string
  subject:     string
  body:        string
}): Promise<{ success: true } | { error: string }> {
  try {
    const user  = await getUser()
    const admin = createAdminClient()

    if (!data.to || !data.body) return { error: 'Destinatario y cuerpo son requeridos' }

    // Send email via Resend
    const { error: sendError } = await resend.emails.send({
      from:    EMAIL_FROM,
      to:      data.to,
      subject: data.subject,
      html:    data.body.replace(/\n/g, '<br>'),
    })

    if (sendError) return { error: (sendError as { message?: string }).message ?? 'Error al enviar correo' }

    // Batch update movements to 'sent' + batch log events (sin N+1)
    const { data: movements } = await admin
      .from('policy_movements')
      .select('id, status')
      .in('id', data.movementIds)

    if (movements && movements.length > 0) {
      await admin
        .from('policy_movements')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .in('id', data.movementIds)

      await admin.from('movement_events').insert(
        movements.map(mv => ({
          movement_id: mv.id,
          actor_id:    user.id,
          status_from: mv.status as string,
          status_to:   'sent',
          notes:       `Seguimiento enviado a ${data.to}`,
        }))
      )
    }

    revalidatePath('/movimientos')
    return { success: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
