/**
 * _sync-accounts.ts — Sincroniza cuentas desde la BD externa
 *
 * Estrategia:
 * 1. SELECT * FROM external_accounts_table
 * 2. Mapear cada fila con sync_field_mappings
 * 3. Para cada registro: upsert respetando allow_override
 *    - Si external_id ya existe → update (con COALESCE para campos sin override)
 *    - Si no existe → insert
 */
import { EntityFieldMaps, ReferenceMaps, SyncResult, SyncErrorRecord, mapRow } from './_mapping.ts'
import type { ExtDb, ExtDbConfig } from './_connector.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

interface ExistingAccount {
  id:         string
  external_id: string
  name:       string | null
  email:      string | null
  phone:      string | null
  rfc:        string | null
  type:       string | null
  [key: string]: unknown
}

export async function syncAccounts(
  supabase: SupabaseClient,
  extDb: ExtDb,
  cfg: ExtDbConfig,
  fieldMaps: EntityFieldMaps,
  refMaps: ReferenceMaps,
): Promise<SyncResult> {
  const entityMaps = fieldMaps['account'] ?? []
  if (entityMaps.length === 0) {
    return { count: 0, errors: [] }
  }

  // 1. Obtener todos los registros de la BD externa
  let extRows: Record<string, unknown>[] = []
  try {
    extRows = await extDb`SELECT * FROM ${extDb(cfg.accountsTable)}` as Record<string, unknown>[]
  } catch (err) {
    throw new Error(`No se pudo consultar la tabla "${cfg.accountsTable}" de la BD externa: ${(err as Error).message}`)
  }

  if (extRows.length === 0) return { count: 0, errors: [] }

  // 2. Mapear todas las filas
  const allErrors: SyncErrorRecord[] = []
  const mappedRows: { mapped: Record<string, unknown>; extId: string }[] = []

  for (const row of extRows) {
    const { mapped, extId, warnings } = mapRow(row, entityMaps, refMaps, 'account')
    allErrors.push(...warnings)

    if (!extId) {
      allErrors.push({
        entity_type:   'account',
        external_id:   null,
        error_type:    'validation',
        error_message: 'Fila sin external_id — revisa el mapeo del campo ID externo',
        raw_data:      row,
      })
      continue
    }
    mappedRows.push({ mapped, extId })
  }

  if (mappedRows.length === 0) return { count: 0, errors: allErrors }

  // 3a. Deduplicar por extId (tabla única: múltiples pólizas por contratante)
  const seenExtIds = new Set<string>()
  const dedupedRows = mappedRows.filter(r => {
    if (seenExtIds.has(r.extId)) return false
    seenExtIds.add(r.extId)
    return true
  })

  // 3b. Consultar cuáles external_ids ya existen en Supabase
  const extIds = dedupedRows.map(r => r.extId)
  const { data: existing, error: fetchErr } = await supabase
    .from('accounts')
    .select('id, external_id, name, email, phone, rfc, type')
    .in('external_id', extIds)

  if (fetchErr) throw new Error(`Error consultando accounts existentes: ${fetchErr.message}`)

  const existingByExtId: Record<string, ExistingAccount> = {}
  for (const acc of (existing ?? [])) {
    existingByExtId[acc.external_id] = acc
  }

  // 3c. Fallback: vincular cuentas creadas manualmente (sin external_id) por RFC o nombre
  const needFallback = dedupedRows.filter(r => !existingByExtId[r.extId])
  if (needFallback.length > 0) {
    for (const { mapped, extId } of needFallback) {
      const rfc  = mapped['rfc']  ? String(mapped['rfc']).trim()  : null
      const name = mapped['name'] ? String(mapped['name']).trim() : null
      if (!rfc && !name) continue

      const filters: string[] = []
      if (rfc)  filters.push(`rfc.eq.${rfc}`)
      if (name) filters.push(`name.ilike.${name}`)

      const { data: found } = await supabase
        .from('accounts')
        .select('id, external_id, name, email, phone, rfc, type')
        .or(filters.join(','))
        .is('external_id', null)   // solo cuentas sin external_id (creadas manualmente)
        .limit(1)
        .maybeSingle()

      if (found) {
        // Vincular: tratarla como existente con este extId → el bloque de updates la actualizará
        // e incluirá external_id en updateData, enlazándola definitivamente al sync
        existingByExtId[extId] = { ...found, external_id: extId }
      }
    }
  }

  // 4. Split en inserts y updates
  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; data: Record<string, unknown> }[] = []

  for (const { mapped, extId } of dedupedRows) {
    const existing = existingByExtId[extId]

    // Siempre asegurar sync metadata
    const syncMeta = {
      sync_source:    'external',
      last_synced_at: new Date().toISOString(),
    }

    if (!existing) {
      toInsert.push({ ...mapped, ...syncMeta })
    } else {
      // Aplicar allow_override campo por campo
      const updateData: Record<string, unknown> = { ...syncMeta }
      // Si la cuenta fue vinculada por fallback (rfc/nombre), asignar external_id ahora
      if (!existing.external_id || existing.external_id !== extId) {
        updateData['external_id'] = extId
      }
      for (const fm of entityMaps) {
        if (fm.localField === 'external_id') continue // ya manejado arriba
        const newVal = mapped[fm.localField]
        if (newVal === undefined) continue
        const oldVal = existing[fm.localField as keyof ExistingAccount]
        // COALESCE logic
        if (fm.allowOverride) {
          updateData[fm.localField] = newVal
        } else if (oldVal === null || oldVal === undefined || oldVal === '') {
          updateData[fm.localField] = newVal
        }
        // Si already has value and allowOverride=false → skip (preserve local)
      }
      if (Object.keys(updateData).length > 1) { // más que solo syncMeta
        toUpdate.push({ id: existing.id, data: updateData })
      }
    }
  }

  // 5. Ejecutar inserts en batch
  let insertedCount = 0
  if (toInsert.length > 0) {
    const BATCH = 100
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH)
      const { error } = await supabase.from('accounts').insert(batch)
      if (error) {
        allErrors.push({
          entity_type:   'account',
          external_id:   null,
          error_type:    'upsert_failed',
          error_message: `Error en insert batch [${i}–${i + batch.length}]: ${error.message}`,
        })
      } else {
        insertedCount += batch.length
      }
    }
  }

  // 6. Ejecutar updates uno por uno (con aislamiento de errores)
  let updatedCount = 0
  for (const { id, data } of toUpdate) {
    const { error } = await supabase
      .from('accounts')
      .update(data)
      .eq('id', id)
    if (error) {
      allErrors.push({
        entity_type:   'account',
        external_id:   null,
        error_type:    'upsert_failed',
        error_message: `Error actualizando account id=${id}: ${error.message}`,
      })
    } else {
      updatedCount++
    }
  }

  return {
    count:  insertedCount + updatedCount,
    errors: allErrors,
  }
}
