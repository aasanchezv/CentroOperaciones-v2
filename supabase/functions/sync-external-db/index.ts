/**
 * index.ts — Orquestador principal de sincronización con BD externa
 *
 * Flujo:
 * 1. Verificar autenticación (Bearer service_role_key o header cron)
 * 2. Crear sync_run (status='running')
 * 3. Cargar config (app_settings) + field maps + reference maps
 * 4. Conectar a BD externa
 * 5. Sincronizar en orden: accounts → contacts → policies → cancelar ausentes → receipts
 * 6. Auto-crear renovaciones pendientes
 * 7. Insertar errores en sync_errors
 * 8. Finalizar sync_run (success/partial/failed + stats)
 *
 * Deploy: supabase functions deploy sync-external-db --no-verify-jwt
 * Cron:   SELECT cron.schedule('sync-nightly', '0 9 * * *', ...)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { loadExtDbConfig, createExtDb }                    from './_connector.ts'
import { loadFieldMaps, loadRefMaps, validateMapsPresent } from './_mapping.ts'
import { syncAccounts }                                    from './_sync-accounts.ts'
import { syncContacts }                                    from './_sync-contacts.ts'
import { syncPolicies, extractExternalIds }                from './_sync-policies.ts'
import { cancelMissingPolicies }                           from './_cancel-missing.ts'
import { syncReceipts }                                    from './_sync-receipts.ts'
import { autoCreateRenewals }                              from './_auto-renewals.ts'
import type { SyncErrorRecord }                            from './_mapping.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Autenticación ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const cronHeader = req.headers.get('x-supabase-cron')

  const isAuthorized = cronHeader === 'true' ||
    authHeader === `Bearer ${serviceKey}` ||
    authHeader.replace('Bearer ', '') === serviceKey

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status:  401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: { triggered_by?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* body vacío está bien */ }

  const triggeredBy = body.triggered_by ?? (cronHeader ? 'cron' : 'manual')
  const dryRun      = body.dry_run ?? false

  // ── Supabase (service_role) ────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  // ── Verificar que sync esté habilitado ────────────────────────────────────
  const { data: syncEnabledRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'sync_enabled')
    .single()

  if (syncEnabledRow?.value !== 'true') {
    return new Response(JSON.stringify({ error: 'Sync deshabilitado en app_settings.sync_enabled' }), {
      status:  503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Crear sync_run ────────────────────────────────────────────────────────
  const { data: run, error: runCreateErr } = await supabase
    .from('sync_runs')
    .insert({ triggered_by: triggeredBy, status: 'running' })
    .select('id')
    .single()

  if (runCreateErr || !run) {
    return new Response(JSON.stringify({ error: `No se pudo crear sync_run: ${runCreateErr?.message}` }), {
      status:  500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const runId = run.id as string
  const allErrors: SyncErrorRecord[] = []

  let stats = {
    accounts_upserted:  0,
    contacts_upserted:  0,
    policies_upserted:  0,
    policies_cancelled: 0,
    receipts_upserted:  0,
    renewals_created:   0,
    error_count:        0,
  }

  try {
    // ── Cargar configuración ─────────────────────────────────────────────────
    const [extCfg, fieldMaps, refMaps] = await Promise.all([
      loadExtDbConfig(supabase),
      loadFieldMaps(supabase),
      loadRefMaps(supabase),
    ])

    // Validar que los mapeos mínimos estén presentes (accounts + policies)
    validateMapsPresent(fieldMaps, ['account', 'policy'])

    if (dryRun) {
      await finalizeSyncRun(supabase, runId, 'success', stats, allErrors, 'dry_run=true')
      return new Response(JSON.stringify({ runId, dry_run: true, fieldMaps, refMaps }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Conectar a BD externa ────────────────────────────────────────────────
    const extDb = createExtDb(extCfg)

    try {
      // ── 1. Sincronizar cuentas ─────────────────────────────────────────────
      const accountsResult = await syncAccounts(supabase, extDb, extCfg, fieldMaps, refMaps)
      stats.accounts_upserted = accountsResult.count
      allErrors.push(...accountsResult.errors)

      // ── 2. Sincronizar contactos ───────────────────────────────────────────
      const contactsResult = await syncContacts(supabase, extDb, extCfg, fieldMaps, refMaps)
      stats.contacts_upserted = contactsResult.count
      allErrors.push(...contactsResult.errors)

      // ── 3. Sincronizar pólizas ─────────────────────────────────────────────
      // Fetch una sola vez y reutilizar en syncPolicies + extractExternalIds
      let extPolicyRows: Record<string, unknown>[] = []
      try {
        extPolicyRows = await extDb`SELECT * FROM ${extDb(extCfg.policiesTable)}` as Record<string, unknown>[]
      } catch (err) {
        throw new Error(`No se pudo consultar pólizas externas: ${(err as Error).message}`)
      }

      const policiesResult = await syncPolicies(supabase, extDb, extCfg, fieldMaps, refMaps, extPolicyRows)
      stats.policies_upserted = policiesResult.count
      allErrors.push(...policiesResult.errors)

      // ── 4. Cancelar pólizas ausentes del feed ──────────────────────────────
      const presentExtIds = extractExternalIds(extPolicyRows, fieldMaps)
      const cancelResult  = await cancelMissingPolicies(supabase, presentExtIds)
      stats.policies_cancelled = cancelResult.count
      for (const e of cancelResult.errors) {
        allErrors.push({
          entity_type:   'policy',
          external_id:   e.external_id,
          error_type:    'upsert_failed',
          error_message: e.message,
        })
      }

      // ── 5. Sincronizar recibos ─────────────────────────────────────────────
      if (fieldMaps['receipt'] && fieldMaps['receipt'].length > 0) {
        const receiptsResult = await syncReceipts(supabase, extDb, extCfg, fieldMaps, refMaps)
        stats.receipts_upserted = receiptsResult.count
        allErrors.push(...receiptsResult.errors)
      }

    } finally {
      await extDb.end()
    }

    // ── 6. Auto-crear renovaciones ───────────────────────────────────────────
    const { data: windowRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'sync_renewal_window_days')
      .single()

    const windowDays    = parseInt(windowRow?.value ?? '60', 10)
    const renewalResult = await autoCreateRenewals(supabase, windowDays)
    stats.renewals_created = renewalResult.count
    for (const e of renewalResult.errors) {
      allErrors.push({
        entity_type:   'policy',
        external_id:   e.policy_id,
        error_type:    'upsert_failed',
        error_message: e.message,
      })
    }

    // ── 7. Guardar errores en sync_errors ─────────────────────────────────────
    stats.error_count = allErrors.length
    if (allErrors.length > 0) {
      const errorRows = allErrors.map(e => ({
        sync_run_id:   runId,
        entity_type:   e.entity_type,
        external_id:   e.external_id,
        error_type:    e.error_type,
        error_message: e.error_message,
        raw_data:      e.raw_data ?? null,
      }))
      await supabase.from('sync_errors').insert(errorRows)
    }

    // ── 8. Finalizar sync_run ─────────────────────────────────────────────────
    const status = allErrors.length === 0 ? 'success' : 'partial'
    await finalizeSyncRun(supabase, runId, status, stats)

    // Actualizar sync_last_run_id en app_settings
    await supabase
      .from('app_settings')
      .update({ value: runId })
      .eq('key', 'sync_last_run_id')

    return new Response(JSON.stringify({ runId, status, ...stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const errMsg = (err as Error).message
    stats.error_count = allErrors.length + 1

    // Guardar errores parciales antes de marcar como failed
    if (allErrors.length > 0) {
      const errorRows = allErrors.map(e => ({
        sync_run_id:   runId,
        entity_type:   e.entity_type,
        external_id:   e.external_id,
        error_type:    e.error_type,
        error_message: e.error_message,
        raw_data:      e.raw_data ?? null,
      }))
      await supabase.from('sync_errors').insert(errorRows)
    }

    await finalizeSyncRun(supabase, runId, 'failed', stats, [], errMsg)

    return new Response(JSON.stringify({ error: errMsg, runId }), {
      status:  500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ── Helper: finalizar sync_run ─────────────────────────────────────────────────

async function finalizeSyncRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  runId: string,
  status: 'success' | 'partial' | 'failed',
  stats: Record<string, number>,
  _errors?: SyncErrorRecord[],
  notes?: string,
): Promise<void> {
  await supabase
    .from('sync_runs')
    .update({
      status,
      finished_at:        new Date().toISOString(),
      accounts_upserted:  stats.accounts_upserted  ?? 0,
      contacts_upserted:  stats.contacts_upserted  ?? 0,
      policies_upserted:  stats.policies_upserted  ?? 0,
      policies_cancelled: stats.policies_cancelled ?? 0,
      receipts_upserted:  stats.receipts_upserted  ?? 0,
      renewals_created:   stats.renewals_created   ?? 0,
      error_count:        stats.error_count        ?? 0,
      notes:              notes ?? null,
    })
    .eq('id', runId)
}
