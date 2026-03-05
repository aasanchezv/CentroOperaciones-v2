/**
 * _auto-renewals.ts — Crea renovaciones automáticamente post-sync
 *
 * Usa la función SQL get_renewal_candidates(window_date) que retorna
 * pólizas activas que vencen en los próximos N días sin renovación activa.
 *
 * El window se lee de app_settings.sync_renewal_window_days (default: 60).
 * El assigned_to viene de accounts.assigned_to (ya resuelto por el trigger existente).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export interface AutoRenewalsResult {
  count:  number
  errors: { policy_id: string; message: string }[]
}

export async function autoCreateRenewals(
  supabase: SupabaseClient,
  windowDays: number = 60,
): Promise<AutoRenewalsResult> {
  // Calcular la fecha límite del window
  const windowDate = new Date()
  windowDate.setDate(windowDate.getDate() + windowDays)
  const windowDateStr = windowDate.toISOString().split('T')[0] // YYYY-MM-DD

  // 1. Obtener candidatos via función SQL
  const { data: candidates, error: candidatesErr } = await supabase
    .rpc('get_renewal_candidates', { p_window_date: windowDateStr })

  if (candidatesErr) {
    throw new Error(`Error obteniendo candidatos de renovación: ${candidatesErr.message}`)
  }

  if (!candidates || candidates.length === 0) {
    return { count: 0, errors: [] }
  }

  // 2. Obtener el stage inicial de renovaciones para el equipo (o global)
  // Buscamos el primer stage con order_index = 0 (o el mínimo)
  const { data: firstStages } = await supabase
    .from('renewal_stages')
    .select('id, team_id, order_index')
    .order('order_index', { ascending: true })
    .limit(50)

  // Agrupar stages por team_id (null = global)
  const stageByTeam: Record<string, string | null> = {}
  for (const stage of (firstStages ?? [])) {
    const key = stage.team_id ?? '__global__'
    if (stageByTeam[key] === undefined) {
      stageByTeam[key] = stage.id
    }
  }
  const globalFirstStage = stageByTeam['__global__'] ?? null

  // 3. Crear renovaciones
  const errors: { policy_id: string; message: string }[] = []
  let createdCount = 0

  const renewalsToInsert = []
  for (const candidate of candidates) {
    renewalsToInsert.push({
      policy_id:        candidate.id,
      account_id:       candidate.account_id,
      assigned_to:      candidate.assigned_to ?? null,
      status:           'in_progress',
      current_stage_id: globalFirstStage,
      notes:            `Renovación iniciada automáticamente por sync. Póliza vence: ${candidate.end_date}`,
    })
  }

  const BATCH = 50
  for (let i = 0; i < renewalsToInsert.length; i += BATCH) {
    const batch = renewalsToInsert.slice(i, i + BATCH)
    const { error } = await supabase
      .from('renewals')
      .insert(batch)
      // Ignorar duplicados si la renovación ya existe (puede pasar si se corre 2 veces)
      .onConflict('policy_id, status')
      .ignore()

    if (error) {
      for (const r of batch) {
        errors.push({
          policy_id: r.policy_id,
          message:   `Error creando renovación: ${error.message}`,
        })
      }
    } else {
      createdCount += batch.length
    }
  }

  return { count: createdCount, errors }
}
