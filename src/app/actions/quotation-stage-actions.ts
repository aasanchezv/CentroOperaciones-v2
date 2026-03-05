'use server'

import { revalidatePath }   from 'next/cache'
import { createClient }     from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { QuotationStage } from '@/types/database.types'

// ─── Auth helper ──────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Solo admin puede gestionar stages')
  return { user }
}

// ─── getQuotationStages ───────────────────────────────────────
/**
 * Devuelve los stages para un equipo.
 * Si el equipo no tiene stages propios, devuelve los globales (team_id IS NULL).
 */
export async function getQuotationStages(teamId?: string | null): Promise<QuotationStage[]> {
  const admin = createAdminClient()

  if (teamId) {
    const { data: teamStages } = await admin
      .from('quotation_stages')
      .select('*')
      .eq('team_id', teamId)
      .order('sort_order')

    if (teamStages && teamStages.length > 0) {
      return teamStages as QuotationStage[]
    }
  }

  // Fallback a stages globales
  const { data: globalStages } = await admin
    .from('quotation_stages')
    .select('*')
    .is('team_id', null)
    .order('sort_order')

  return (globalStages ?? []) as QuotationStage[]
}

// ─── getAllQuotationStagesGrouped ─────────────────────────────
/**
 * Devuelve stages globales + todos los stages de cada equipo.
 * Para el admin, que necesita ver todos.
 */
export async function getAllQuotationStagesGrouped(): Promise<{
  global: QuotationStage[]
  byTeam: Record<string, QuotationStage[]>
}> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('quotation_stages')
    .select('*')
    .order('sort_order')

  const all = (data ?? []) as QuotationStage[]
  const global  = all.filter(s => s.team_id === null)
  const byTeam: Record<string, QuotationStage[]> = {}

  for (const stage of all) {
    if (stage.team_id) {
      if (!byTeam[stage.team_id]) byTeam[stage.team_id] = []
      byTeam[stage.team_id].push(stage)
    }
  }

  return { global, byTeam }
}

// ─── createQuotationStage ─────────────────────────────────────

export async function createQuotationStage(
  teamId: string | null,
  data: { name: string; color?: string; is_won?: boolean; is_lost?: boolean; sort_order?: number },
): Promise<void> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()

  // Calcular sort_order = max + 1 para ese team_id
  const query = admin.from('quotation_stages').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const filtered = teamId ? query.eq('team_id', teamId) : query.is('team_id', null)
  const { data: last } = await filtered

  const nextOrder = (last?.[0]?.sort_order ?? 0) + 1

  await admin.from('quotation_stages').insert({
    team_id:    teamId,
    name:       data.name,
    color:      data.color ?? 'gray',
    is_won:     data.is_won ?? false,
    is_lost:    data.is_lost ?? false,
    sort_order: data.sort_order ?? nextOrder,
    is_active:  true,
  })

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.create',
    entity_type: 'quotation_stages',
    payload:     { area: 'cotizaciones', team_id: teamId, name: data.name },
  })

  revalidatePath('/admin/cotizaciones')
  revalidatePath('/cotizaciones')
}

// ─── updateQuotationStage ─────────────────────────────────────

export async function updateQuotationStage(
  id: string,
  data: Partial<Pick<QuotationStage, 'name' | 'color' | 'is_won' | 'is_lost' | 'sort_order' | 'is_active'>>,
): Promise<void> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()

  await admin.from('quotation_stages').update(data).eq('id', id)

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.update',
    entity_type: 'quotation_stages',
    payload:     { area: 'cotizaciones', stage_id: id, data },
  })

  revalidatePath('/admin/cotizaciones')
  revalidatePath('/cotizaciones')
}

// ─── deleteQuotationStage ─────────────────────────────────────

export async function deleteQuotationStage(id: string): Promise<void> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()

  // Desasociar quotations que usen este stage antes de borrar
  await admin.from('quotations').update({ stage_id: null }).eq('stage_id', id)

  await admin.from('quotation_stages').delete().eq('id', id)

  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.delete',
    entity_type: 'quotation_stages',
    payload:     { area: 'cotizaciones', stage_id: id },
  })

  revalidatePath('/admin/cotizaciones')
  revalidatePath('/cotizaciones')
}

// ─── reorderQuotationStages ───────────────────────────────────

export async function reorderQuotationStages(ids: string[]): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()

  await Promise.all(
    ids.map((id, idx) =>
      admin.from('quotation_stages').update({ sort_order: idx + 1 }).eq('id', id),
    ),
  )

  revalidatePath('/admin/cotizaciones')
  revalidatePath('/cotizaciones')
}

// ─── copyGlobalStagesToTeam ───────────────────────────────────

export async function copyGlobalStagesToTeam(teamId: string): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()

  // Obtener stages globales
  const { data: globals } = await admin
    .from('quotation_stages')
    .select('name, color, is_won, is_lost, sort_order')
    .is('team_id', null)
    .order('sort_order')

  if (!globals || globals.length === 0) return

  // Borrar stages previos del equipo (si los hubiera)
  await admin.from('quotation_stages').delete().eq('team_id', teamId)

  // Insertar copia
  await admin.from('quotation_stages').insert(
    globals.map(s => ({ ...s, team_id: teamId, is_active: true })),
  )

  revalidatePath('/admin/cotizaciones')
  revalidatePath('/cotizaciones')
}
