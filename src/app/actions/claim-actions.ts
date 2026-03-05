'use server'

import { revalidatePath }         from 'next/cache'
import { createClient }           from '@/lib/supabase/server'
import { createAdminClient }      from '@/lib/supabase/admin'
import { normalizePolicyNumber }  from '@/lib/claims-utils'
import type {
  ClaimImportRun,
  ClaimColumnMapping,
  AccountClaim,
  ParsedClaimRow,
} from '@/types/database.types'

// ── Helpers de auth ────────────────────────────────────────────────────────────

async function requireAdminOps() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'ops'].includes(profile.role)) {
    throw new Error('Se requiere rol admin u ops')
  }
  return { user }
}

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  return { user }
}

// ── Consultas ──────────────────────────────────────────────────────────────────

export async function getClaimImportRuns(): Promise<(ClaimImportRun & {
  insurer: { name: string; short_name: string | null } | null
  importer: { full_name: string } | null
})[]> {
  await requireAuth()
  const admin = createAdminClient()
  const { data } = await admin
    .from('claim_import_runs')
    .select(`
      *,
      insurer:insurers!claim_import_runs_insurer_id_fkey(name, short_name),
      importer:profiles!claim_import_runs_imported_by_fkey(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []) as unknown as (ClaimImportRun & {
    insurer: { name: string; short_name: string | null } | null
    importer: { full_name: string } | null
  })[]
}

export async function getClaimColumnMappings(
  insurerId: string
): Promise<ClaimColumnMapping[]> {
  await requireAuth()
  const admin = createAdminClient()
  const { data } = await admin
    .from('claim_column_mappings')
    .select('*')
    .eq('insurer_id', insurerId)
    .eq('is_active', true)
    .order('target_field')
  return (data ?? []) as ClaimColumnMapping[]
}

export async function getClaimsForAccount(accountId: string): Promise<(AccountClaim & {
  insurer: { name: string; short_name: string | null } | null
})[]> {
  await requireAuth()
  const admin = createAdminClient()
  const { data } = await admin
    .from('account_claims')
    .select(`
      *,
      insurer:insurers!account_claims_insurer_id_fkey(name, short_name)
    `)
    .eq('account_id', accountId)
    .order('loss_date', { ascending: false })
    .limit(200)
  return (data ?? []) as unknown as (AccountClaim & {
    insurer: { name: string; short_name: string | null } | null
  })[]
}

export async function getUnmatchedClaims(insurerId?: string): Promise<(AccountClaim & {
  insurer: { name: string; short_name: string | null } | null
  run: { period_label: string | null } | null
})[]> {
  await requireAdminOps()
  const admin = createAdminClient()
  let q = admin
    .from('account_claims')
    .select(`
      *,
      insurer:insurers!account_claims_insurer_id_fkey(name, short_name),
      run:claim_import_runs!account_claims_import_run_id_fkey(period_label)
    `)
    .eq('is_matched', false)
    .order('created_at', { ascending: false })
    .limit(300)

  if (insurerId) {
    q = q.eq('insurer_id', insurerId)
  }

  const { data } = await q
  return (data ?? []) as unknown as (AccountClaim & {
    insurer: { name: string; short_name: string | null } | null
    run: { period_label: string | null } | null
  })[]
}

// ── Mutaciones ────────────────────────────────────────────────────────────────

export async function saveClaimColumnMappings(
  insurerId: string,
  mappings: { source_column: string; target_field: string }[]
): Promise<{ error?: string }> {
  await requireAdminOps()
  const admin = createAdminClient()

  const { error: delError } = await admin
    .from('claim_column_mappings')
    .delete()
    .eq('insurer_id', insurerId)

  if (delError) return { error: delError.message }

  if (mappings.length === 0) {
    revalidatePath('/admin/siniestros')
    return {}
  }

  const { error: insError } = await admin
    .from('claim_column_mappings')
    .insert(mappings.map(m => ({
      insurer_id:    insurerId,
      source_column: m.source_column,
      target_field:  m.target_field,
    })))

  if (insError) return { error: insError.message }
  revalidatePath('/admin/siniestros')
  return {}
}

export async function importClaims(
  run: { insurer_id: string; file_name: string; period_label: string },
  rows: ParsedClaimRow[]
): Promise<{ run_id?: string; total: number; matched: number; unmatched: number; error?: string }> {
  const { user } = await requireAdminOps()
  const admin = createAdminClient()

  if (rows.length === 0) return { total: 0, matched: 0, unmatched: 0, error: 'El archivo está vacío' }

  // Batch: traer todas las pólizas para match
  const { data: policies } = await admin
    .from('policies')
    .select('id, policy_number, account_id')
    .not('policy_number', 'is', null)

  // Mapa: policy_number normalizado → { id, account_id }
  const policyMap = new Map<string, { id: string; account_id: string | null }>()
  for (const p of policies ?? []) {
    if (p.policy_number) {
      policyMap.set(normalizePolicyNumber(p.policy_number), {
        id:         p.id,
        account_id: p.account_id,
      })
    }
  }

  // Crear el run con contadores provisionales
  const { data: importRun, error: runError } = await admin
    .from('claim_import_runs')
    .insert({
      insurer_id:     run.insurer_id,
      file_name:      run.file_name,
      period_label:   run.period_label || null,
      total_rows:     rows.length,
      matched_rows:   0,
      unmatched_rows: 0,
      imported_by:    user.id,
    })
    .select('id')
    .single()

  if (runError || !importRun) {
    return { total: rows.length, matched: 0, unmatched: rows.length, error: runError?.message ?? 'Error al crear run' }
  }

  // Preparar filas con resultado del match
  let matched = 0
  const claims = rows.map(row => {
    const normKey = row.policy_number_raw ? normalizePolicyNumber(row.policy_number_raw) : ''
    const match   = normKey ? policyMap.get(normKey) : undefined
    if (match) matched++

    return {
      import_run_id:     importRun.id,
      insurer_id:        run.insurer_id,
      account_id:        match?.account_id ?? null,
      policy_id:         match?.id         ?? null,
      is_matched:        !!match,
      claim_number:      row.claim_number,
      policy_number_raw: row.policy_number_raw,
      loss_date:         row.loss_date,
      report_date:       row.report_date,
      claim_type:        row.claim_type,
      description:       row.description,
      amount_claimed:    row.amount_claimed,
      amount_approved:   row.amount_approved,
      amount_paid:       row.amount_paid,
      status_insurer:    row.status_insurer,
      extra_fields:      Object.keys(row.extra_fields).length > 0 ? row.extra_fields : null,
    }
  })

  // Insertar en lotes de 200
  const BATCH = 200
  for (let i = 0; i < claims.length; i += BATCH) {
    const { error: insertError } = await admin
      .from('account_claims')
      .insert(claims.slice(i, i + BATCH))
    if (insertError) {
      await admin.from('claim_import_runs').delete().eq('id', importRun.id)
      return { total: rows.length, matched, unmatched: rows.length - matched, error: insertError.message }
    }
  }

  // Actualizar contadores del run
  const unmatched = rows.length - matched
  await admin
    .from('claim_import_runs')
    .update({ matched_rows: matched, unmatched_rows: unmatched })
    .eq('id', importRun.id)

  revalidatePath('/admin/siniestros')
  return { run_id: importRun.id, total: rows.length, matched, unmatched }
}

export async function deleteClaimImportRun(runId: string): Promise<{ error?: string }> {
  await requireAdminOps()
  const admin = createAdminClient()

  await admin.from('account_claims').delete().eq('import_run_id', runId)
  const { error } = await admin.from('claim_import_runs').delete().eq('id', runId)

  if (error) return { error: error.message }
  revalidatePath('/admin/siniestros')
  return {}
}
