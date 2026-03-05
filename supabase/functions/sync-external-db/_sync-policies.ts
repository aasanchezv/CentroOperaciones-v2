/**
 * _sync-policies.ts — Sincroniza pólizas desde la BD externa
 *
 * Claves de negocio:
 * - external_id (ID de la póliza en BD externa) para deduplicar
 * - Solo pólizas con sync_source='external' son candidatas a cancelación automática
 * - Campos enriquecidos localmente (notes, commission_code_id, policy_url, etc.) nunca se tocan
 * - 4 campos nuevos: concepto, subramo, conducto_cobro, comision_total
 */
import { EntityFieldMaps, ReferenceMaps, SyncResult, SyncErrorRecord, mapRow } from './_mapping.ts'
import type { ExtDb, ExtDbConfig } from './_connector.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

interface ExistingPolicy {
  id:              string
  external_id:     string
  account_id:      string
  policy_number:   string | null
  branch:          string | null
  status:          string | null
  notes:           string | null
  commission_code_id: string | null
  policy_url:      string | null
  [key: string]: unknown
}

export async function syncPolicies(
  supabase: SupabaseClient,
  extDb: ExtDb,
  cfg: ExtDbConfig,
  fieldMaps: EntityFieldMaps,
  refMaps: ReferenceMaps,
  prefetchedRows?: Record<string, unknown>[],
): Promise<SyncResult> {
  const entityMaps = fieldMaps['policy'] ?? []
  if (entityMaps.length === 0) {
    return { count: 0, errors: [] }
  }

  // 1. Obtener pólizas de la BD externa (o usar filas pre-cargadas del orquestador)
  let extRows: Record<string, unknown>[] = prefetchedRows ?? []
  if (!prefetchedRows) {
    try {
      extRows = await extDb`SELECT * FROM ${extDb(cfg.policiesTable)}` as Record<string, unknown>[]
    } catch (err) {
      throw new Error(`No se pudo consultar la tabla "${cfg.policiesTable}" de la BD externa: ${(err as Error).message}`)
    }
  }

  if (extRows.length === 0) return { count: 0, errors: [] }

  // 2. Cargar mapa de external_id → account.id (siguiendo merged_into_id)
  const { data: accountRows } = await supabase
    .from('accounts')
    .select('id, external_id, merged_into_id')
    .not('external_id', 'is', null)

  const accountByExtId: Record<string, string> = {}
  for (const a of (accountRows ?? [])) {
    // Si la cuenta fue fusionada, las nuevas pólizas van a la cuenta destino
    accountByExtId[a.external_id] = a.merged_into_id ?? a.id
  }

  // 3. Mapear filas
  const allErrors: SyncErrorRecord[] = []
  const mappedRows: { mapped: Record<string, unknown>; extId: string }[] = []

  for (const row of extRows) {
    const { mapped, extId, warnings } = mapRow(row, entityMaps, refMaps, 'policy')
    allErrors.push(...warnings)

    if (!extId) {
      allErrors.push({
        entity_type:   'policy',
        external_id:   null,
        error_type:    'validation',
        error_message: 'Póliza sin external_id — revisa el mapeo del campo ID externo',
        raw_data:      row,
      })
      continue
    }

    // Resolver account_id
    if (mapped['_account_external_id'] !== undefined) {
      const accountExtId = String(mapped['_account_external_id'])
      const accountId    = accountByExtId[accountExtId]
      if (!accountId) {
        allErrors.push({
          entity_type:   'policy',
          external_id:   extId,
          error_type:    'unresolved_reference',
          error_message: `No se encontró account con external_id="${accountExtId}" para la póliza`,
          raw_data:      row,
        })
        continue
      }
      mapped['account_id'] = accountId
      delete mapped['_account_external_id']
    }

    if (!mapped['account_id']) {
      allErrors.push({
        entity_type:   'policy',
        external_id:   extId,
        error_type:    'validation',
        error_message: 'Póliza sin account_id — revisa el mapeo del ID de cuenta',
        raw_data:      row,
      })
      continue
    }

    mappedRows.push({ mapped, extId })
  }

  if (mappedRows.length === 0) return { count: 0, errors: allErrors }

  // 4. Consultar existentes
  const extIds = mappedRows.map(r => r.extId)
  const { data: existing, error: fetchErr } = await supabase
    .from('policies')
    .select('id, external_id, account_id, policy_number, branch, status, notes, commission_code_id, policy_url')
    .in('external_id', extIds)

  if (fetchErr) throw new Error(`Error consultando policies existentes: ${fetchErr.message}`)

  const existingByExtId: Record<string, ExistingPolicy> = {}
  for (const p of (existing ?? [])) {
    existingByExtId[p.external_id] = p
  }

  const syncMeta = {
    sync_source:    'external',
    last_synced_at: new Date().toISOString(),
  }

  // Campos que JAMÁS se tocan en un update (solo local)
  const neverOverrideFields = new Set([
    'notes', 'commission_code_id', 'policy_url', 'tomador_id', 'sum_insured',
  ])

  // 5. Split inserts / updates
  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; data: Record<string, unknown> }[] = []

  for (const { mapped, extId } of mappedRows) {
    const existing = existingByExtId[extId]

    if (!existing) {
      toInsert.push({ ...mapped, ...syncMeta })
    } else {
      const updateData: Record<string, unknown> = { ...syncMeta }
      for (const fm of entityMaps) {
        if (fm.localField === 'external_id') continue
        if (neverOverrideFields.has(fm.localField)) continue // jamás tocar campos locales
        const newVal = mapped[fm.localField]
        if (newVal === undefined) continue
        const oldVal = existing[fm.localField as keyof ExistingPolicy]
        if (fm.allowOverride) {
          updateData[fm.localField] = newVal
        } else if (oldVal === null || oldVal === undefined || oldVal === '') {
          updateData[fm.localField] = newVal
        }
      }
      if (Object.keys(updateData).length > 1) {
        toUpdate.push({ id: existing.id, data: updateData })
      }
    }
  }

  // 6. Insert batch
  let insertedCount = 0
  if (toInsert.length > 0) {
    const BATCH = 100
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH)
      const { error } = await supabase.from('policies').insert(batch)
      if (error) {
        allErrors.push({
          entity_type:   'policy',
          external_id:   null,
          error_type:    'upsert_failed',
          error_message: `Error en insert batch [${i}–${i + batch.length}]: ${error.message}`,
        })
      } else {
        insertedCount += batch.length
      }
    }
  }

  // 7. Updates
  let updatedCount = 0
  for (const { id, data } of toUpdate) {
    const { error } = await supabase.from('policies').update(data).eq('id', id)
    if (error) {
      allErrors.push({
        entity_type:   'policy',
        external_id:   null,
        error_type:    'upsert_failed',
        error_message: `Error actualizando policy id=${id}: ${error.message}`,
      })
    } else {
      updatedCount++
    }
  }

  return { count: insertedCount + updatedCount, errors: allErrors }
}

/**
 * Retorna el conjunto de external_ids de pólizas que vinieron en el feed externo.
 * Lo usa _cancel-missing.ts para detectar ausencias.
 */
export function extractExternalIds(extRows: Record<string, unknown>[], fieldMaps: EntityFieldMaps): Set<string> {
  const entityMaps = fieldMaps['policy'] ?? []
  const extIdMapping = entityMaps.find(m => m.localField === 'external_id')
  if (!extIdMapping) return new Set()

  const ids = new Set<string>()
  for (const row of extRows) {
    const val = row[extIdMapping.externalField]
    if (val !== null && val !== undefined && val !== '') {
      ids.add(String(val))
    }
  }
  return ids
}
