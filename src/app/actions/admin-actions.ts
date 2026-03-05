'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ModuleId } from '@/lib/modules'
import type { UserRole } from '@/types/database.types'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Acceso denegado')
  return user
}

export async function updateUserName(targetId: string, fullName: string) {
  const actor = await requireAdmin()
  const admin = createAdminClient()
  const trimmed = fullName.trim()
  if (!trimmed) throw new Error('El nombre no puede estar vacío')

  await admin.from('profiles').update({ full_name: trimmed }).eq('id', targetId)

  await admin.from('audit_events').insert({
    actor_id: actor.id,
    action: 'user.name_changed',
    entity_type: 'profile',
    entity_id: targetId,
    payload: { full_name: trimmed },
  })

  revalidatePath('/admin/users')
}

export async function updateUserRole(targetId: string, newRole: UserRole) {
  const actor = await requireAdmin()
  const admin = createAdminClient()

  await admin.from('profiles').update({ role: newRole }).eq('id', targetId)

  await admin.from('audit_events').insert({
    actor_id: actor.id,
    action: 'user.role_changed',
    entity_type: 'profile',
    entity_id: targetId,
    payload: { new_role: newRole },
  })

  revalidatePath('/admin/users')
}

export async function toggleUserActive(targetId: string, currentlyActive: boolean) {
  const actor = await requireAdmin()
  const admin = createAdminClient()

  await admin
    .from('profiles')
    .update({ is_active: !currentlyActive })
    .eq('id', targetId)

  await admin.from('audit_events').insert({
    actor_id: actor.id,
    action: currentlyActive ? 'user.deactivated' : 'user.activated',
    entity_type: 'profile',
    entity_id: targetId,
    payload: { is_active: !currentlyActive },
  })

  revalidatePath('/admin/users')
}

export async function createTeam(name: string) {
  const actor = await requireAdmin()
  const admin = createAdminClient()

  const { data: team, error } = await admin
    .from('teams')
    .insert({ name: name.trim() })
    .select('id, name')
    .single()

  if (error) throw new Error('No se pudo crear el equipo')

  await admin.from('audit_events').insert({
    actor_id: actor.id,
    action: 'team.created',
    entity_type: 'team',
    entity_id: team.id,
    payload: { name: team.name },
  })

  revalidatePath('/admin/teams')
  return team
}

export async function assignUserTeam(targetId: string, teamId: string | null) {
  const actor = await requireAdmin()
  const admin = createAdminClient()

  await admin.from('profiles').update({ team_id: teamId || null }).eq('id', targetId)

  await admin.from('audit_events').insert({
    actor_id: actor.id,
    action: 'user.team_changed',
    entity_type: 'profile',
    entity_id: targetId,
    payload: { team_id: teamId },
  })

  revalidatePath('/admin/users')
}

export async function deleteTeam(teamId: string) {
  const actor = await requireAdmin()
  const admin = createAdminClient()

  // Desasignar usuarios antes de eliminar
  await admin.from('profiles').update({ team_id: null }).eq('team_id', teamId)

  await admin.from('teams').delete().eq('id', teamId)

  await admin.from('audit_events').insert({
    actor_id: actor.id,
    action: 'team.deleted',
    entity_type: 'team',
    entity_id: teamId,
    payload: {},
  })

  revalidatePath('/admin/teams')
}

// ── Team Settings ─────────────────────────────────────────────────────────────

export async function updateTeamSettings(
  teamId: string,
  settings: {
    email_cc?:            string | null
    vip_email_cc?:        string | null
    monthly_income_goal?: number | null
  }
): Promise<{ success: true } | { error: string }> {
  try { await requireAdmin() } catch (e) { return { error: (e as Error).message } }
  const admin = createAdminClient()
  const { error } = await admin.from('teams').update(settings).eq('id', teamId)
  if (error) return { error: error.message }
  revalidatePath('/admin/teams')
  return { success: true }
}

// ── Team Skills ───────────────────────────────────────────────────────────────

/** Devuelve los module_ids activos para un equipo. */
export async function getTeamSkills(teamId: string): Promise<ModuleId[]> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data } = await admin
    .from('team_skills')
    .select('module_id')
    .eq('team_id', teamId)

  return (data ?? []).map(r => r.module_id as ModuleId)
}

/**
 * Reemplaza los skills de un equipo con los moduleIds proporcionados.
 * Pasar [] para deshabilitar todos (el equipo verá todos los módulos por defecto).
 */
export async function setTeamSkills(
  teamId:    string,
  moduleIds: ModuleId[],
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()

  // DELETE all existing skills for this team
  await admin.from('team_skills').delete().eq('team_id', teamId)

  // INSERT new skills (skip if empty)
  if (moduleIds.length > 0) {
    const rows = moduleIds.map(module_id => ({ team_id: teamId, module_id }))
    const { error } = await admin.from('team_skills').insert(rows)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/teams')
  return { success: true }
}
