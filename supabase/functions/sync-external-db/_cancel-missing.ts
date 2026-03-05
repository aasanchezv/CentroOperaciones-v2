/**
 * _cancel-missing.ts — Cancela pólizas que desaparecieron del feed externo
 *
 * Reglas:
 * - Solo afecta pólizas con sync_source = 'external' (nunca manuales/OCR)
 * - Solo cancela las que estaban 'active' o 'pending_renewal'
 * - Pólizas ya en 'cancelled', 'expired', 'quote' → no tocar
 * - El trigger existente trg_policy_syncs_account_status se encarga de ajustar account.status
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export interface CancelResult {
  count:  number
  errors: { external_id: string; message: string }[]
}

export async function cancelMissingPolicies(
  supabase: SupabaseClient,
  presentExternalIds: Set<string>,
): Promise<CancelResult> {
  // 1. Obtener todas las pólizas externas activas
  const { data: activePolicies, error: fetchErr } = await supabase
    .from('policies')
    .select('id, external_id, status')
    .eq('sync_source', 'external')
    .in('status', ['active', 'pending_renewal'])
    .not('external_id', 'is', null)

  if (fetchErr) throw new Error(`Error consultando pólizas activas externas: ${fetchErr.message}`)

  if (!activePolicies || activePolicies.length === 0) {
    return { count: 0, errors: [] }
  }

  // 2. Detectar las que no vinieron en el feed
  const missing = activePolicies.filter(
    (p: { id: string; external_id: string; status: string }) =>
      !presentExternalIds.has(p.external_id)
  )

  if (missing.length === 0) return { count: 0, errors: [] }

  // 3. Cancelar las ausentes
  const errors: { external_id: string; message: string }[] = []
  let cancelledCount = 0

  const BATCH = 50
  const missingIds = missing.map((p: { id: string }) => p.id)

  for (let i = 0; i < missingIds.length; i += BATCH) {
    const batch = missingIds.slice(i, i + BATCH)
    const { error } = await supabase
      .from('policies')
      .update({
        status:          'cancelled',
        last_synced_at:  new Date().toISOString(),
      })
      .in('id', batch)

    if (error) {
      for (const id of batch) {
        const pol = missing.find((p: { id: string }) => p.id === id)
        errors.push({
          external_id: pol?.external_id ?? id,
          message:     `Error cancelando póliza: ${error.message}`,
        })
      }
    } else {
      cancelledCount += batch.length
    }
  }

  return { count: cancelledCount, errors }
}
