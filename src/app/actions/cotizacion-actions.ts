'use server'

import { revalidatePath }    from 'next/cache'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { QuotationStatus } from '@/types/database.types'

// ─── Guard helper ────────────────────────────────────────────

async function requireOperator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'readonly') throw new Error('Acceso denegado')
  return { user, role: profile?.role ?? 'readonly', supabase }
}

// ─── Read ────────────────────────────────────────────────────

export async function getCotizaciones() {
  const { user, role, supabase } = await requireOperator()
  const admin = createAdminClient()

  const isManager = ['admin', 'ops', 'manager'].includes(role)

  const query = (isManager ? admin : supabase)
    .from('quotations')
    .select(`
      id, status, insurer, branch, estimated_premium, notes, expires_at,
      created_at, updated_at, assigned_to,
      account:accounts!quotations_account_id_fkey(id, name),
      contact:contacts!quotations_contact_id_fkey(id, full_name),
      assignee:profiles!quotations_assigned_to_fkey(id, full_name)
    `)
    .order('updated_at', { ascending: false })

  if (!isManager) {
    query.eq('assigned_to', user.id)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

// ─── Create ──────────────────────────────────────────────────

export interface CreateCotizacionData {
  account_id?:               string
  insurer?:                  string
  branch?:                   string
  estimated_premium?:        number
  notes?:                    string
  expires_at?:               string
  // Campos migration 021
  requested_by_id?:          string
  requester_is_contractor?:  boolean
  probable_contractor?:      string
  delivery_due_at?:          string
}

export async function createCotizacion(data: CreateCotizacionData): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const ctx = await requireOperator()
    userId = ctx.user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()

  const { error } = await admin.from('quotations').insert({
    account_id:               data.account_id               || null,
    insurer:                  data.insurer?.trim()           || null,
    branch:                   data.branch                   || null,
    estimated_premium:        data.estimated_premium        || null,
    notes:                    data.notes?.trim()            || null,
    expires_at:               data.expires_at               || null,
    requested_by_id:          data.requested_by_id          || null,
    requester_is_contractor:  data.requester_is_contractor  ?? false,
    probable_contractor:      data.probable_contractor?.trim() || null,
    delivery_due_at:          data.delivery_due_at          || null,
    assigned_to:              userId,
    created_by:               userId,
    status:                   'pendiente',
  })

  if (error) return { error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'quotation.created',
    entity_type: 'quotation',
    payload:     { insurer: data.insurer, branch: data.branch },
  })

  revalidatePath('/cotizaciones')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── Update status ───────────────────────────────────────────

export async function updateCotizacionStatus(
  id: string,
  newStatus: QuotationStatus,
): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const ctx = await requireOperator()
    userId = ctx.user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()

  // Verificar que pertenece al usuario (o es manager/admin)
  const { data: quot } = await admin
    .from('quotations').select('assigned_to').eq('id', id).single()
  if (!quot) return { error: 'Cotización no encontrada' }

  const { error } = await admin
    .from('quotations')
    .update({ status: newStatus })
    .eq('id', id)

  if (error) return { error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'quotation.status_changed',
    entity_type: 'quotation',
    entity_id:   id,
    payload:     { new_status: newStatus },
  })

  revalidatePath('/cotizaciones')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── Update stage (nuevo — migration 017) ───────────────────

export async function updateCotizacionStage(
  id: string,
  stageId: string,
): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const ctx = await requireOperator()
    userId = ctx.user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()

  // Obtener nombre del stage para sincronizar status (backward compat)
  const { data: stage } = await admin
    .from('quotation_stages').select('name').eq('id', stageId).single()

  const { error } = await admin
    .from('quotations')
    .update({
      stage_id: stageId,
      status:   stage?.name?.toLowerCase() ?? 'pendiente',
    })
    .eq('id', id)

  if (error) return { error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'quotation.stage_changed',
    entity_type: 'quotation',
    entity_id:   id,
    payload:     { stage_id: stageId, stage_name: stage?.name },
  })

  revalidatePath('/cotizaciones')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── Delete ──────────────────────────────────────────────────

export async function deleteCotizacion(id: string): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const ctx = await requireOperator()
    userId = ctx.user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()

  const { error } = await admin.from('quotations').delete().eq('id', id)
  if (error) return { error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'quotation.deleted',
    entity_type: 'quotation',
    entity_id:   id,
    payload:     {},
  })

  revalidatePath('/cotizaciones')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── Update (datos completos de una cotización) ──────────────

export interface UpdateCotizacionData {
  insurer?:                  string
  branch?:                   string
  estimated_premium?:        number | null
  notes?:                    string
  expires_at?:               string
  requested_by_id?:          string | null
  requester_is_contractor?:  boolean
  probable_contractor?:      string
  delivery_due_at?:          string
}

export async function updateCotizacion(
  id: string,
  data: UpdateCotizacionData,
): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const ctx = await requireOperator()
    userId = ctx.user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('quotations')
    .update({
      insurer:                  data.insurer?.trim()            || null,
      branch:                   data.branch                    || null,
      estimated_premium:        data.estimated_premium         ?? null,
      notes:                    data.notes?.trim()             || null,
      expires_at:               data.expires_at                || null,
      requested_by_id:          data.requested_by_id           || null,
      requester_is_contractor:  data.requester_is_contractor   ?? false,
      probable_contractor:      data.probable_contractor?.trim() || null,
      delivery_due_at:          data.delivery_due_at           || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'quotation.updated',
    entity_type: 'quotation',
    entity_id:   id,
    payload:     { insurer: data.insurer, branch: data.branch },
  })

  revalidatePath('/cotizaciones')
  return { success: true }
}

// ─── Convert won quotation to policy ─────────────────────────

export async function convertQuotationToPolicy(
  quotId: string,
): Promise<{ success: true; accountId: string } | { error: string }> {
  let userId: string
  try {
    const ctx = await requireOperator()
    userId = ctx.user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()

  const { data: quot, error: qErr } = await admin
    .from('quotations')
    .select('id, account_id, contact_id, insurer, branch, estimated_premium, notes')
    .eq('id', quotId)
    .single()

  if (qErr || !quot) return { error: 'Cotización no encontrada' }
  if (!quot.account_id) return { error: 'La cotización no tiene cuenta vinculada' }

  const { data: policy, error: pErr } = await admin
    .from('policies')
    .insert({
      account_id:   quot.account_id,
      insurer:      quot.insurer      ?? 'Por definir',
      branch:       quot.branch       ?? 'otro',
      premium:      quot.estimated_premium ?? null,
      status:       'quote',
      tomador_id:   quot.contact_id   ?? null,
      notes:        quot.notes        ?? null,
      created_by:   userId,
    })
    .select('id')
    .single()

  if (pErr || !policy) return { error: pErr?.message ?? 'Error al crear póliza' }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'quotation.converted_to_policy',
    entity_type: 'quotation',
    entity_id:   quotId,
    payload:     { policy_id: policy.id, account_id: quot.account_id },
  })

  revalidatePath('/cotizaciones')
  revalidatePath(`/accounts/${quot.account_id}`)
  return { success: true, accountId: quot.account_id }
}

// ─── Internal Requesters (migration 021) ─────────────────────

export async function getInternalRequesters() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('internal_requesters')
    .select('id, name, email, notes, is_active')
    .eq('is_active', true)
    .order('name')
  return data ?? []
}

export async function getAllInternalRequesters() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('internal_requesters')
    .select('id, name, email, notes, is_active, created_at')
    .order('name')
  return data ?? []
}

export async function createInternalRequester(
  data: { name: string; email?: string; notes?: string }
): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const ctx = await requireOperator()
    // Solo admin/ops puede crear
    if (!['admin', 'ops'].includes(ctx.role)) return { error: 'Solo admin puede gestionar solicitantes' }
    userId = ctx.user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('internal_requesters').insert({
    name:       data.name.trim(),
    email:      data.email?.trim() || null,
    notes:      data.notes?.trim() || null,
    created_by: userId,
  })

  if (error) return { error: error.message }
  revalidatePath('/admin/cotizaciones')
  return { success: true }
}

export async function updateInternalRequester(
  id: string,
  data: { name: string; email?: string; notes?: string; is_active?: boolean }
): Promise<{ success: true } | { error: string }> {
  try {
    const ctx = await requireOperator()
    if (!['admin', 'ops'].includes(ctx.role)) return { error: 'Solo admin puede gestionar solicitantes' }
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('internal_requesters').update({
    name:      data.name.trim(),
    email:     data.email?.trim() || null,
    notes:     data.notes?.trim() || null,
    is_active: data.is_active ?? true,
  }).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/cotizaciones')
  return { success: true }
}

export async function deleteInternalRequester(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const ctx = await requireOperator()
    if (!['admin', 'ops'].includes(ctx.role)) return { error: 'Solo admin puede gestionar solicitantes' }
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()
  // Desactivar en lugar de borrar (puede haber cotizaciones que lo referencien)
  const { error } = await admin.from('internal_requesters').update({ is_active: false }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/cotizaciones')
  return { success: true }
}
