'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AccountStatus, AccountType } from '@/types/database.types'

// ─── Guard ──────────────────────────────────────────────────────────────────

async function requireOperator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role === 'readonly') redirect('/dashboard')
  return { supabase, userId: user.id }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'ops'].includes(profile?.role ?? '')) redirect('/accounts')
  return { supabase, userId: user.id }
}

// ─── Accounts ────────────────────────────────────────────────────────────────

// Retorna { id } en vez de llamar redirect() para que el cliente navegue.
// Llamar redirect() dentro de un server action invocado directamente desde un
// cliente lanza NEXT_REDIRECT que el try/catch del cliente atrapa, cancelando
// la navegación aunque la cuenta ya fue creada en BD.
export async function createAccount(formData: FormData): Promise<{ id: string }> {
  const { supabase, userId } = await requireOperator()
  const admin = createAdminClient()

  const payload = {
    name:        formData.get('name') as string,
    type:       (formData.get('type') as AccountType) ?? 'empresa',
    rfc:         (formData.get('rfc') as string) || null,
    email:       (formData.get('email') as string) || null,
    phone:       (formData.get('phone') as string) || null,
    status:     (formData.get('status') as AccountStatus) ?? 'prospect',
    team_id:     (formData.get('team_id') as string) || null,
    assigned_to: (formData.get('assigned_to') as string) || null,
    notes:       (formData.get('notes') as string) || null,
    created_by:  userId,
  }

  const { data: account, error } = await supabase
    .from('accounts')
    .insert(payload)
    .select('id, account_code')
    .single()

  if (error) throw new Error(error.message)

  // audit_events requiere service_role (RLS: deny client insert)
  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'account.created',
    entity_type: 'account',
    entity_id:   account.id,
    payload:     { name: payload.name, account_code: account.account_code },
  })

  // Si el contratante es el contacto, crear contacto automáticamente
  if (formData.get('create_contact') === 'true' && payload.name) {
    await supabase.from('contacts').insert({
      account_id: account.id,
      full_name:  payload.name,
      email:      payload.email ?? null,
      phone:      payload.phone ?? null,
      is_primary: true,
      created_by: userId,
    })
  }

  revalidatePath('/accounts')
  return { id: account.id }
}

export async function updateAccount(accountId: string, formData: FormData) {
  const { supabase, userId } = await requireOperator()
  const admin = createAdminClient()

  let requestedStatus = (formData.get('status') as AccountStatus) ?? 'prospect'

  // Regla permanente: 'active' solo si hay al menos una póliza activa
  if (requestedStatus === 'active') {
    const { count } = await supabase
      .from('policies')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'active')
    if (!count || count === 0) requestedStatus = 'prospect'
  }

  const payload = {
    name:        formData.get('name') as string,
    type:       (formData.get('type') as AccountType) ?? 'empresa',
    rfc:         (formData.get('rfc') as string) || null,
    email:       (formData.get('email') as string) || null,
    phone:       (formData.get('phone') as string) || null,
    status:      requestedStatus,
    team_id:     (formData.get('team_id') as string) || null,
    assigned_to: (formData.get('assigned_to') as string) || null,
    notes:       (formData.get('notes') as string) || null,
  }

  const { error } = await supabase
    .from('accounts')
    .update(payload)
    .eq('id', accountId)

  if (error) throw new Error(error.message)

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'account.updated',
    entity_type: 'account',
    entity_id:   accountId,
    payload,
  })

  revalidatePath(`/accounts/${accountId}`)
  revalidatePath('/accounts')
}

export async function deleteAccount(accountId: string) {
  const { supabase, userId } = await requireAdmin()
  const admin = createAdminClient()

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'account.deleted',
    entity_type: 'account',
    entity_id:   accountId,
    payload:     {},
  })

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', accountId)

  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
  redirect('/accounts')
}

export async function deleteAccountsBulk(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { supabase, userId } = await requireAdmin()
  const admin = createAdminClient()

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'account.bulk_deleted',
    entity_type: 'account',
    entity_id:   null,
    payload:     { ids, count: ids.length },
  })

  const { error } = await supabase
    .from('accounts')
    .delete()
    .in('id', ids)

  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}

// ─── Merge de cuentas ────────────────────────────────────────────────────────

/**
 * Fusiona `sourceId` en `targetId`:
 * - Transfiere pólizas, contactos, tareas, renovaciones y cotizaciones al destino
 * - Marca la cuenta fuente como is_merged = true
 * - Solo admin puede ejecutar este action
 */
export async function mergeAccounts(
  sourceId: string,
  targetId: string,
): Promise<{ error?: string }> {
  const { supabase, userId } = await requireAdmin()
  const admin = createAdminClient()

  // Solo admin estricto (no ops)
  const { data: actorProfile } = await supabase
    .from('profiles').select('role').eq('id', userId).single()
  if (actorProfile?.role !== 'admin') return { error: 'Solo el administrador puede fusionar cuentas.' }

  if (sourceId === targetId) return { error: 'No puedes fusionar una cuenta consigo misma.' }

  // Validar que ambas cuentas existen y ninguna está ya fusionada
  const { data: accounts } = await admin
    .from('accounts')
    .select('id, name, is_merged')
    .in('id', [sourceId, targetId])

  if (!accounts || accounts.length < 2) return { error: 'Una o ambas cuentas no fueron encontradas.' }
  const source = accounts.find(a => a.id === sourceId)
  const target = accounts.find(a => a.id === targetId)
  if (!source || !target) return { error: 'Error al obtener las cuentas.' }
  if (source.is_merged) return { error: `La cuenta "${source.name}" ya está fusionada en otra cuenta.` }
  if (target.is_merged) return { error: `La cuenta destino "${target.name}" ya está fusionada en otra cuenta.` }

  // Transferir todos los registros relacionados
  const tables = ['policies', 'contacts', 'tasks', 'renewals', 'quotations'] as const
  for (const table of tables) {
    const { error } = await admin
      .from(table)
      .update({ account_id: targetId })
      .eq('account_id', sourceId)
    if (error) return { error: `Error transfiriendo ${table}: ${error.message}` }
  }

  // Marcar la cuenta fuente como fusionada
  const { error: mergeErr } = await admin
    .from('accounts')
    .update({ is_merged: true, merged_into_id: targetId })
    .eq('id', sourceId)
  if (mergeErr) return { error: `Error marcando cuenta fusionada: ${mergeErr.message}` }

  // Audit log
  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'account.merge',
    entity_type: 'account',
    entity_id:   targetId,
    payload: {
      source_id:   sourceId,
      source_name: source.name,
      target_id:   targetId,
      target_name: target.name,
    },
  })

  revalidatePath('/accounts')
  return {}
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export async function createContact(accountId: string, formData: FormData) {
  const { supabase, userId } = await requireOperator()
  const admin = createAdminClient()

  // Solo manager+ puede marcar VIP — los agentes no pueden aunque envíen is_vip=true
  const { data: actorProfile } = await supabase
    .from('profiles').select('role').eq('id', userId).single()
  const canSetVip = ['admin', 'ops', 'manager'].includes(actorProfile?.role ?? '')

  const payload = {
    account_id: accountId,
    full_name:  formData.get('full_name') as string,
    email:      (formData.get('email') as string) || null,
    phone:      (formData.get('phone') as string) || null,
    position:   (formData.get('position') as string) || null,
    is_primary: formData.get('is_primary') === 'true',
    is_vip:     canSetVip && formData.get('is_vip') === 'true',
    vip_notes:  canSetVip ? ((formData.get('vip_notes') as string) || null) : null,
    notes:      (formData.get('notes') as string) || null,
    created_by: userId,
  }

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert(payload)
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'contact.created',
    entity_type: 'contact',
    entity_id:   contact.id,
    payload:     { account_id: accountId, full_name: payload.full_name },
  })

  revalidatePath(`/accounts/${accountId}`)
}

export async function updateContact(contactId: string, accountId: string, formData: FormData) {
  const { supabase, userId } = await requireOperator()
  const admin = createAdminClient()

  const payload = {
    full_name: (formData.get('full_name') as string).trim(),
    email:     (formData.get('email') as string)    || null,
    phone:     (formData.get('phone') as string)    || null,
    position:  (formData.get('position') as string) || null,
    notes:     (formData.get('notes') as string)    || null,
  }

  const { error } = await supabase
    .from('contacts')
    .update(payload)
    .eq('id', contactId)

  if (error) throw new Error(error.message)

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'contact.updated',
    entity_type: 'contact',
    entity_id:   contactId,
    payload:     { account_id: accountId, full_name: payload.full_name },
  })

  revalidatePath(`/accounts/${accountId}`)
  revalidatePath('/contacts')
}

export async function deleteContact(contactId: string, accountId: string) {
  const { supabase, userId } = await requireAdmin()
  const admin = createAdminClient()

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'contact.deleted',
    entity_type: 'contact',
    entity_id:   contactId,
    payload:     { account_id: accountId },
  })

  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId)

  if (error) throw new Error(error.message)

  revalidatePath(`/accounts/${accountId}`)
}
