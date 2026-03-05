'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import type { SyncRun, SyncError, SyncFieldMapping, SyncReferenceMap } from '@/types/database.types'

// ─── Guard ───────────────────────────────────────────────────────────────────

async function requireAdminOps() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'ops'].includes(profile?.role ?? '')) redirect('/dashboard')
  return supabase
}

// ─── Sync Runs ────────────────────────────────────────────────────────────────

export async function getSyncRuns(limit = 20): Promise<SyncRun[]> {
  const supabase = await requireAdminOps()
  const { data } = await supabase
    .from('sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as SyncRun[]
}

export async function getLastSyncRun(): Promise<SyncRun | null> {
  const supabase = await requireAdminOps()
  const { data } = await supabase
    .from('sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as SyncRun | null
}

// ─── Sync Errors ──────────────────────────────────────────────────────────────

export async function getSyncErrors(runId: string): Promise<SyncError[]> {
  const supabase = await requireAdminOps()
  const { data } = await supabase
    .from('sync_errors')
    .select('*')
    .eq('sync_run_id', runId)
    .order('created_at', { ascending: true })
  return (data ?? []) as SyncError[]
}

export async function getUnresolvedReferences(): Promise<SyncError[]> {
  const supabase = await requireAdminOps()

  // Obtiene errores tipo 'unresolved_reference' del último run
  const { data: lastRun } = await supabase
    .from('sync_runs')
    .select('id')
    .in('status', ['success', 'partial'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lastRun) return []

  const { data } = await supabase
    .from('sync_errors')
    .select('*')
    .eq('sync_run_id', lastRun.id)
    .eq('error_type', 'unresolved_reference')
    .order('entity_type', { ascending: true })
  return (data ?? []) as SyncError[]
}

// ─── Field Mappings ───────────────────────────────────────────────────────────

export async function getSyncFieldMappings(): Promise<SyncFieldMapping[]> {
  const supabase = await requireAdminOps()
  const { data } = await supabase
    .from('sync_field_mappings')
    .select('*')
    .order('entity_type', { ascending: true })
  return (data ?? []) as SyncFieldMapping[]
}

export async function saveSyncFieldMapping(
  id: string | null,
  payload: Omit<SyncFieldMapping, 'id' | 'created_at'>
): Promise<void> {
  const supabase = await requireAdminOps()

  if (id) {
    const { error } = await supabase
      .from('sync_field_mappings')
      .update(payload)
      .eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('sync_field_mappings')
      .insert(payload)
    if (error) throw new Error(error.message)
  }
}

export async function deleteSyncFieldMapping(id: string): Promise<void> {
  const supabase = await requireAdminOps()
  const { error } = await supabase
    .from('sync_field_mappings')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Connection Config ────────────────────────────────────────────────────────

export interface ConnectionConfig {
  host:           string
  port:           string
  database:       string
  user:           string
  ssl:            string   // 'true' | 'false'
  accountsTable:  string
  contactsTable:  string
  policiesTable:  string
  receiptsTable:  string
  syncEnabled:    string   // 'true' | 'false'
  renewalWindow:  string   // días, ej '60'
}

const CONNECTION_KEYS: Record<keyof ConnectionConfig, string> = {
  host:          'sync_external_db_host',
  port:          'sync_external_db_port',
  database:      'sync_external_db_name',
  user:          'sync_external_db_user',
  ssl:           'sync_external_db_ssl',
  accountsTable: 'sync_external_accounts_table',
  contactsTable: 'sync_external_contacts_table',
  policiesTable: 'sync_external_policies_table',
  receiptsTable: 'sync_external_receipts_table',
  syncEnabled:   'sync_enabled',
  renewalWindow: 'sync_renewal_window_days',
}

const CONNECTION_DEFAULTS: ConnectionConfig = {
  host:          '',
  port:          '5432',
  database:      '',
  user:          '',
  ssl:           'true',
  accountsTable: 'clientes',
  contactsTable: 'contactos',
  policiesTable: 'polizas',
  receiptsTable: 'recibos',
  syncEnabled:   'true',
  renewalWindow: '60',
}

export async function getConnectionConfig(): Promise<ConnectionConfig> {
  const supabase = await requireAdminOps()
  const keys = Object.values(CONNECTION_KEYS)
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', keys)

  const s: Record<string, string> = {}
  for (const row of (data ?? [])) s[row.key] = row.value ?? ''

  const result = { ...CONNECTION_DEFAULTS }
  for (const [field, appKey] of Object.entries(CONNECTION_KEYS) as [keyof ConnectionConfig, string][]) {
    if (s[appKey] !== undefined && s[appKey] !== '') result[field] = s[appKey]
  }
  return result
}

export async function saveConnectionConfig(config: Partial<ConnectionConfig>): Promise<void> {
  const supabase = await requireAdminOps()

  const upserts = (Object.entries(config) as [keyof ConnectionConfig, string | undefined][])
    .filter(([, v]) => v !== undefined)
    .map(([field, value]) => ({
      key:   CONNECTION_KEYS[field],
      value: String(value),
    }))
    .filter(({ key }) => Boolean(key))

  if (upserts.length === 0) return

  const { error } = await supabase
    .from('app_settings')
    .upsert(upserts, { onConflict: 'key' })

  if (error) throw new Error(error.message)
}

// ─── Reference Maps ───────────────────────────────────────────────────────────

export async function getSyncReferenceMaps(): Promise<SyncReferenceMap[]> {
  const supabase = await requireAdminOps()
  const { data } = await supabase
    .from('sync_reference_maps')
    .select('*')
    .order('map_type', { ascending: true })
  return (data ?? []) as SyncReferenceMap[]
}

export async function saveSyncReferenceMap(
  id: string | null,
  payload: Omit<SyncReferenceMap, 'id' | 'created_at'>
): Promise<void> {
  const supabase = await requireAdminOps()

  if (id) {
    const { error } = await supabase
      .from('sync_reference_maps')
      .update(payload)
      .eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('sync_reference_maps')
      .insert(payload)
    if (error) throw new Error(error.message)
  }
}

export async function resolveReference(
  externalValue: string,
  mapType: string,
  localValue: string
): Promise<void> {
  const supabase = await requireAdminOps()
  const { error } = await supabase
    .from('sync_reference_maps')
    .upsert(
      { map_type: mapType, external_value: externalValue, local_value: localValue, auto_detected: false, is_active: true },
      { onConflict: 'map_type,external_value' }
    )
  if (error) throw new Error(error.message)
}

// ─── Seed: mapeos predeterminados ─────────────────────────────────────────────

/**
 * Inserta los mapeos de campos y referencias predeterminados para una BD externa
 * de tabla única (una fila = una póliza).
 * Usa ON CONFLICT DO NOTHING → no sobreescribe configuración existente.
 * Admin only.
 */
export async function seedDefaultFieldMappings(): Promise<{ error?: string }> {
  await requireAdminOps()
  const admin = createAdminClient()

  // ── Mapeos de campos para cuentas (entity_type = 'account') ──
  const accountMappings = [
    { external_field: 'Contratante', local_field: 'external_id',   allow_override: false, transform: { '__normalize': true } },
    { external_field: 'Contratante', local_field: 'name',          allow_override: false, transform: null },
    { external_field: 'RFC',         local_field: 'rfc',           allow_override: false, transform: null },
    { external_field: 'Email',       local_field: 'email',         allow_override: false, transform: null },
    { external_field: 'Teléfono',    local_field: 'phone',         allow_override: false, transform: null },
  ]

  // ── Mapeos de campos para pólizas (entity_type = 'policy') ──
  const policyMappings = [
    { external_field: 'Documento',    local_field: 'external_id',           allow_override: false, transform: null },
    { external_field: 'Documento',    local_field: 'policy_number',         allow_override: true,  transform: null },
    { external_field: 'Contratante',  local_field: '_account_external_id',  allow_override: false, transform: { '__normalize': true } },
    { external_field: 'FDesdePoliza', local_field: 'start_date',            allow_override: true,  transform: null },
    { external_field: 'FHastaPoliza', local_field: 'end_date',              allow_override: true,  transform: null },
    { external_field: 'STATUS_DOCTO', local_field: 'status',                allow_override: true,  transform: { '__ref': 'status' } },
    { external_field: 'PRITOT',       local_field: 'total_premium',         allow_override: true,  transform: null },
    { external_field: 'COM TOT',      local_field: 'comision_total',        allow_override: true,  transform: null },
    { external_field: 'FPago',        local_field: 'payment_frequency',     allow_override: true,  transform: { '__ref': 'payment_frequency' } },
    { external_field: 'Concepto',     local_field: 'concepto',              allow_override: true,  transform: null },
    { external_field: 'Subrmo',       local_field: 'subramo',               allow_override: true,  transform: null },
    { external_field: 'CCobro_TXT',   local_field: 'conducto_cobro',        allow_override: true,  transform: null },
    { external_field: 'Ejecutivo',    local_field: 'assigned_to',           allow_override: false, transform: { '__ref': 'agent' } },
    { external_field: 'Anterior',     local_field: 'previous_policy_number', allow_override: false, transform: null },
    { external_field: 'Moneda',       local_field: 'currency',              allow_override: true,  transform: null },
  ]

  const fieldRows = [
    ...accountMappings.map(m => ({ ...m, entity_type: 'account', is_active: true })),
    ...policyMappings.map(m => ({ ...m, entity_type: 'policy',  is_active: true })),
  ]

  const { error: fmErr } = await admin
    .from('sync_field_mappings')
    .upsert(fieldRows, { onConflict: 'entity_type,external_field,local_field', ignoreDuplicates: true })
  if (fmErr) return { error: `Error en mapeos de campos: ${fmErr.message}` }

  // ── Reference maps ──
  const refRows = [
    // Estatus de póliza
    { map_type: 'status', external_value: 'VIGENTE',      local_value: 'active' },
    { map_type: 'status', external_value: 'CANCELADO',    local_value: 'cancelled' },
    { map_type: 'status', external_value: 'CANCELADA',    local_value: 'cancelled' },
    { map_type: 'status', external_value: 'VENCIDO',      local_value: 'expired' },
    { map_type: 'status', external_value: 'VENCIDA',      local_value: 'expired' },
    { map_type: 'status', external_value: 'PENDIENTE',    local_value: 'pending_renewal' },
    { map_type: 'status', external_value: 'EN TRAMITE',   local_value: 'pending_renewal' },
    // Frecuencia de pago
    { map_type: 'payment_frequency', external_value: 'MENSUAL',     local_value: 'mensual' },
    { map_type: 'payment_frequency', external_value: 'BIMESTRAL',   local_value: 'bimestral' },
    { map_type: 'payment_frequency', external_value: 'TRIMESTRAL',  local_value: 'trimestral' },
    { map_type: 'payment_frequency', external_value: 'SEMESTRAL',   local_value: 'semestral' },
    { map_type: 'payment_frequency', external_value: 'ANUAL',       local_value: 'anual' },
    { map_type: 'payment_frequency', external_value: 'CONTADO',     local_value: 'contado' },
  ].map(r => ({ ...r, auto_detected: false, is_active: true }))

  const { error: rmErr } = await admin
    .from('sync_reference_maps')
    .upsert(refRows, { onConflict: 'map_type,external_value', ignoreDuplicates: true })
  if (rmErr) return { error: `Error en mapas de referencia: ${rmErr.message}` }

  return {}
}
