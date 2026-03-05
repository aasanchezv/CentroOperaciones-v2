/**
 * _sync-receipts.ts — Sincroniza recibos de cobranza desde la BD externa
 *
 * Deduplicación por receipt_number (ya existe en la tabla policy_receipts).
 * Solo aplica a recibos con conducto_cobro='directo' — los de 'domiciliacion'
 * los cobra la aseguradora y no los gestionamos nosotros.
 *
 * Campos locales protegidos: notes, current_stage_id, paid_at, collected_by
 */
import { EntityFieldMaps, ReferenceMaps, SyncResult, SyncErrorRecord, mapRow } from './_mapping.ts'
import type { ExtDb, ExtDbConfig } from './_connector.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

interface ExistingReceipt {
  id:               string
  receipt_number:   string
  policy_id:        string
  amount:           number | null
  due_date:         string | null
  status:           string | null
  current_stage_id: string | null
  paid_at:          string | null
  collected_by:     string | null
  notes:            string | null
  [key: string]:    unknown
}

export async function syncReceipts(
  supabase: SupabaseClient,
  extDb: ExtDb,
  cfg: ExtDbConfig,
  fieldMaps: EntityFieldMaps,
  refMaps: ReferenceMaps,
): Promise<SyncResult> {
  const entityMaps = fieldMaps['receipt'] ?? []
  if (entityMaps.length === 0) {
    return { count: 0, errors: [] }
  }

  // 1. Obtener recibos de BD externa
  let extRows: Record<string, unknown>[] = []
  try {
    extRows = await extDb`SELECT * FROM ${extDb(cfg.receiptsTable)}` as Record<string, unknown>[]
  } catch (err) {
    throw new Error(`No se pudo consultar la tabla "${cfg.receiptsTable}" de la BD externa: ${(err as Error).message}`)
  }

  if (extRows.length === 0) return { count: 0, errors: [] }

  // 2. Cargar mapa de external_id de póliza → policy.id local
  const { data: policyRows } = await supabase
    .from('policies')
    .select('id, external_id, conducto_cobro')
    .not('external_id', 'is', null)

  const policyByExtId: Record<string, { id: string; conducto_cobro: string | null }> = {}
  for (const p of (policyRows ?? [])) {
    policyByExtId[p.external_id] = { id: p.id, conducto_cobro: p.conducto_cobro }
  }

  // 3. Mapear filas
  const allErrors: SyncErrorRecord[] = []
  const mappedRows: { mapped: Record<string, unknown>; receiptNumber: string }[] = []

  for (const row of extRows) {
    const { mapped, warnings } = mapRow(row, entityMaps, refMaps, 'receipt')
    allErrors.push(...warnings)

    // receipt_number es la clave de deduplicación
    const receiptNumber = mapped['receipt_number'] as string | undefined
    if (!receiptNumber) {
      allErrors.push({
        entity_type:   'receipt',
        external_id:   null,
        error_type:    'validation',
        error_message: 'Recibo sin receipt_number — revisa el mapeo del número de recibo',
        raw_data:      row,
      })
      continue
    }

    // Resolver policy_id
    if (mapped['_policy_external_id'] !== undefined) {
      const polExtId = String(mapped['_policy_external_id'])
      const policy   = policyByExtId[polExtId]

      if (!policy) {
        allErrors.push({
          entity_type:   'receipt',
          external_id:   receiptNumber,
          error_type:    'unresolved_reference',
          error_message: `No se encontró policy con external_id="${polExtId}" para el recibo`,
          raw_data:      row,
        })
        continue
      }

      // Omitir recibos de pólizas domiciliadas — la aseguradora los cobra directamente
      if (policy.conducto_cobro === 'domiciliacion') {
        continue
      }

      mapped['policy_id'] = policy.id
      delete mapped['_policy_external_id']
    }

    if (!mapped['policy_id']) {
      allErrors.push({
        entity_type:   'receipt',
        external_id:   receiptNumber,
        error_type:    'validation',
        error_message: 'Recibo sin policy_id — revisa el mapeo del ID de póliza',
        raw_data:      row,
      })
      continue
    }

    mappedRows.push({ mapped, receiptNumber })
  }

  if (mappedRows.length === 0) return { count: 0, errors: allErrors }

  // 4. Consultar existentes por receipt_number
  const receiptNumbers = mappedRows.map(r => r.receiptNumber)
  const { data: existing, error: fetchErr } = await supabase
    .from('policy_receipts')
    .select('id, receipt_number, policy_id, amount, due_date, status, current_stage_id, paid_at, collected_by, notes')
    .in('receipt_number', receiptNumbers)

  if (fetchErr) throw new Error(`Error consultando recibos existentes: ${fetchErr.message}`)

  const existingByReceiptNum: Record<string, ExistingReceipt> = {}
  for (const r of (existing ?? [])) {
    existingByReceiptNum[r.receipt_number] = r
  }

  const syncMeta = {
    sync_source:    'external',
    last_synced_at: new Date().toISOString(),
  }

  // Campos que solo se gestionan localmente
  const neverOverrideFields = new Set([
    'notes', 'current_stage_id', 'paid_at', 'collected_by',
  ])

  // 5. Split inserts / updates
  const toInsert: Record<string, unknown>[] = []
  const toUpdate: { id: string; data: Record<string, unknown> }[] = []

  for (const { mapped, receiptNumber } of mappedRows) {
    const existing = existingByReceiptNum[receiptNumber]

    if (!existing) {
      toInsert.push({ ...mapped, ...syncMeta })
    } else {
      const updateData: Record<string, unknown> = { ...syncMeta }
      for (const fm of entityMaps) {
        if (fm.localField === 'receipt_number') continue
        if (neverOverrideFields.has(fm.localField)) continue
        const newVal = mapped[fm.localField]
        if (newVal === undefined) continue
        const oldVal = existing[fm.localField as keyof ExistingReceipt]
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
      const { error } = await supabase.from('policy_receipts').insert(batch)
      if (error) {
        allErrors.push({
          entity_type:   'receipt',
          external_id:   null,
          error_type:    'upsert_failed',
          error_message: `Error en insert batch de recibos [${i}–${i + batch.length}]: ${error.message}`,
        })
      } else {
        insertedCount += batch.length
      }
    }
  }

  // 7. Updates
  let updatedCount = 0
  for (const { id, data } of toUpdate) {
    const { error } = await supabase.from('policy_receipts').update(data).eq('id', id)
    if (error) {
      allErrors.push({
        entity_type:   'receipt',
        external_id:   null,
        error_type:    'upsert_failed',
        error_message: `Error actualizando recibo id=${id}: ${error.message}`,
      })
    } else {
      updatedCount++
    }
  }

  return { count: insertedCount + updatedCount, errors: allErrors }
}
