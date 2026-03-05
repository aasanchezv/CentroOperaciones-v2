/**
 * _sync-contacts.ts — Sincroniza contactos desde la BD externa
 *
 * Filosofía: contactos del externo solo traen email inicialmente.
 * Una vez que localmente tenemos teléfono, WhatsApp, cargo, VIP — es nuestro para siempre.
 * Por eso casi todos los campos tienen allow_override=false.
 *
 * Requiere que accounts ya estén sincronizadas (necesita account_id).
 * El join se hace via external_id de la cuenta.
 */
import { EntityFieldMaps, ReferenceMaps, SyncResult, SyncErrorRecord, mapRow } from './_mapping.ts'
import type { ExtDb, ExtDbConfig } from './_connector.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

interface ExistingContact {
  id:          string
  external_id: string
  email:       string | null
  full_name:   string | null
  account_id:  string
  [key: string]: unknown
}

export async function syncContacts(
  supabase: SupabaseClient,
  extDb: ExtDb,
  cfg: ExtDbConfig,
  fieldMaps: EntityFieldMaps,
  refMaps: ReferenceMaps,
): Promise<SyncResult> {
  const entityMaps = fieldMaps['contact'] ?? []
  if (entityMaps.length === 0) {
    return { count: 0, errors: [] }
  }

  // 1. Obtener contactos de la BD externa
  let extRows: Record<string, unknown>[] = []
  try {
    extRows = await extDb`SELECT * FROM ${extDb(cfg.contactsTable)}` as Record<string, unknown>[]
  } catch (err) {
    throw new Error(`No se pudo consultar la tabla "${cfg.contactsTable}" de la BD externa: ${(err as Error).message}`)
  }

  if (extRows.length === 0) return { count: 0, errors: [] }

  // 2. Cargar mapa de external_id → account.id para el join
  const { data: accountRows } = await supabase
    .from('accounts')
    .select('id, external_id')
    .not('external_id', 'is', null)

  const accountByExtId: Record<string, string> = {}
  for (const a of (accountRows ?? [])) {
    accountByExtId[a.external_id] = a.id
  }

  // 3. Mapear filas
  const allErrors: SyncErrorRecord[] = []
  const mappedRows: { mapped: Record<string, unknown>; extId: string }[] = []

  for (const row of extRows) {
    const { mapped, extId, warnings } = mapRow(row, entityMaps, refMaps, 'contact')
    allErrors.push(...warnings)

    if (!extId) {
      allErrors.push({
        entity_type:   'contact',
        external_id:   null,
        error_type:    'validation',
        error_message: 'Contacto sin external_id — revisa el mapeo del campo ID externo',
        raw_data:      row,
      })
      continue
    }

    // Resolver account_id si viene como external_id de la cuenta
    if (mapped['_account_external_id'] !== undefined) {
      const accountExtId = String(mapped['_account_external_id'])
      const accountId    = accountByExtId[accountExtId]
      if (!accountId) {
        allErrors.push({
          entity_type:   'contact',
          external_id:   extId,
          error_type:    'unresolved_reference',
          error_message: `No se encontró account con external_id="${accountExtId}" para el contacto`,
          raw_data:      row,
        })
        continue
      }
      mapped['account_id'] = accountId
      delete mapped['_account_external_id']
    }

    if (!mapped['account_id']) {
      allErrors.push({
        entity_type:   'contact',
        external_id:   extId,
        error_type:    'validation',
        error_message: 'Contacto sin account_id — revisa el mapeo del ID de cuenta',
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
    .from('contacts')
    .select('id, external_id, email, full_name, account_id')
    .in('external_id', extIds)

  if (fetchErr) throw new Error(`Error consultando contacts existentes: ${fetchErr.message}`)

  const existingByExtId: Record<string, ExistingContact> = {}
  for (const c of (existing ?? [])) {
    existingByExtId[c.external_id] = c
  }

  // 5. Split inserts / updates
  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; data: Record<string, unknown> }[] = []

  const syncMeta = {
    sync_source:    'external',
    last_synced_at: new Date().toISOString(),
  }

  for (const { mapped, extId } of mappedRows) {
    const existing = existingByExtId[extId]

    if (!existing) {
      toInsert.push({ ...mapped, ...syncMeta })
    } else {
      const updateData: Record<string, unknown> = { ...syncMeta }
      for (const fm of entityMaps) {
        if (fm.localField === 'external_id') continue
        const newVal = mapped[fm.localField]
        if (newVal === undefined) continue
        const oldVal = existing[fm.localField as keyof ExistingContact]
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
      const { error } = await supabase.from('contacts').insert(batch)
      if (error) {
        allErrors.push({
          entity_type:   'contact',
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
    const { error } = await supabase.from('contacts').update(data).eq('id', id)
    if (error) {
      allErrors.push({
        entity_type:   'contact',
        external_id:   null,
        error_type:    'upsert_failed',
        error_message: `Error actualizando contact id=${id}: ${error.message}`,
      })
    } else {
      updatedCount++
    }
  }

  return { count: insertedCount + updatedCount, errors: allErrors }
}
