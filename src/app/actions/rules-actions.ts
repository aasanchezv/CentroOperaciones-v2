'use server'

import { revalidatePath } from 'next/cache'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PolicyBusinessRule {
  id:             string
  name:           string
  description:    string | null
  entity_type:    'policy' | 'receipt'
  trigger_days:   number
  action_type:    'create_renewal' | 'set_cobranza_stage' | 'create_task'
  action_config:  Record<string, unknown>
  is_active:      boolean
  sort_order:     number
  filter_team_id: string | null   // null = global (todos los equipos)
  created_by:     string | null
  created_at:     string
  updated_at:     string
}

export interface EvaluateResult {
  applied: number
  skipped: number
  errors:  string[]
  details: { ruleName: string; items: string[] }[]
}

// ─── Guards ───────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'ops'].includes(profile.role ?? '')) {
    throw new Error('Solo admin/ops pueden gestionar las reglas')
  }
  return { user }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getRules(): Promise<PolicyBusinessRule[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('policy_business_rules')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as PolicyBusinessRule[]
}

export interface SaveRuleInput {
  id?:            string
  name:           string
  description?:   string
  entity_type:    'policy' | 'receipt'
  trigger_days:   number
  action_type:    'create_renewal' | 'set_cobranza_stage' | 'create_task'
  action_config:  Record<string, unknown>
  is_active:      boolean
  sort_order?:    number
  filter_team_id?: string | null
}

export async function saveRule(input: SaveRuleInput): Promise<void> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()

  const payload = {
    name:           input.name.trim(),
    description:    input.description?.trim() || null,
    entity_type:    input.entity_type,
    trigger_days:   input.trigger_days,
    action_type:    input.action_type,
    action_config:  input.action_config,
    is_active:      input.is_active,
    sort_order:     input.sort_order ?? 0,
    filter_team_id: input.filter_team_id ?? null,
    created_by:     user.id,
  }

  if (input.id) {
    const { error } = await admin
      .from('policy_business_rules')
      .update(payload)
      .eq('id', input.id)
    if (error) throw new Error(error.message)
    void admin.from('audit_events').insert({
      actor_id:    user.id,
      action:      'config.update',
      entity_type: 'policy_business_rules',
      payload:     { area: 'polizas', rule_id: input.id, name: input.name, team_id: input.filter_team_id ?? null },
    })
  } else {
    const { error } = await admin
      .from('policy_business_rules')
      .insert(payload)
    if (error) throw new Error(error.message)
    void admin.from('audit_events').insert({
      actor_id:    user.id,
      action:      'config.create',
      entity_type: 'policy_business_rules',
      payload:     { area: 'polizas', name: input.name, team_id: input.filter_team_id ?? null },
    })
  }

  revalidatePath('/admin/polizas')
}

export async function deleteRule(id: string): Promise<void> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from('policy_business_rules')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.delete',
    entity_type: 'policy_business_rules',
    payload:     { area: 'polizas', rule_id: id },
  })
  revalidatePath('/admin/polizas')
}

export async function toggleRule(id: string, isActive: boolean): Promise<void> {
  const { user } = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from('policy_business_rules')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) throw new Error(error.message)
  void admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'config.update',
    entity_type: 'policy_business_rules',
    payload:     { area: 'polizas', rule_id: id, is_active: isActive },
  })
  revalidatePath('/admin/polizas')
}

export async function getCobranzaStageNames(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('cobranza_stages')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data ?? []) as { id: string; name: string }[]
}

export async function getTeams(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('teams')
    .select('id, name')
    .order('name', { ascending: true })
  return (data ?? []) as { id: string; name: string }[]
}

// ─── Rule Evaluation Engine ───────────────────────────────────────────────────

export async function evaluateRules(): Promise<EvaluateResult> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: rules, error: rulesError } = await admin
    .from('policy_business_rules')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (rulesError) throw new Error(rulesError.message)

  let applied = 0
  let skipped = 0
  const errors:  string[] = []
  const details: { ruleName: string; items: string[] }[] = []

  for (const rule of (rules ?? []) as PolicyBusinessRule[]) {
    try {
      if (rule.entity_type === 'policy' && rule.action_type === 'create_renewal') {
        const r = await applyRenewalRule(admin, rule)
        applied += r.applied
        skipped += r.skipped
        if (r.items.length > 0) details.push({ ruleName: rule.name, items: r.items })
      } else if (rule.entity_type === 'receipt' && rule.action_type === 'set_cobranza_stage') {
        const r = await applyCobranzaRule(admin, rule)
        applied += r.applied
        skipped += r.skipped
        if (r.items.length > 0) details.push({ ruleName: rule.name, items: r.items })
      } else {
        skipped++
      }
    } catch (e) {
      errors.push(`"${rule.name}": ${(e as Error).message}`)
    }
  }

  revalidatePath('/renovaciones')
  revalidatePath('/cobranza')

  return { applied, skipped, errors, details }
}

// ─── Renewal rule ─────────────────────────────────────────────────────────────

async function applyRenewalRule(admin: ReturnType<typeof createAdminClient>, rule: PolicyBusinessRule) {
  const today   = new Date()
  const cutoff  = new Date(today)
  cutoff.setDate(cutoff.getDate() + rule.trigger_days)

  const todayStr  = today.toISOString().split('T')[0]
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Si la regla tiene filtro de equipo, obtenemos las cuentas de ese equipo primero
  let accountIds: string[] | null = null
  if (rule.filter_team_id) {
    const { data: teamAccounts } = await admin
      .from('accounts')
      .select('id')
      .eq('team_id', rule.filter_team_id)
    accountIds = (teamAccounts ?? []).map((a: { id: string }) => a.id)
    if (accountIds.length === 0) return { applied: 0, skipped: 0, items: [] }
  }

  // Pólizas activas que vencen dentro del umbral
  let query = admin
    .from('policies')
    .select('id, account_id, created_by, policy_number, end_date, accounts!inner(name)')
    .eq('status', 'active')
    .gte('end_date', todayStr)
    .lte('end_date', cutoffStr)

  if (accountIds) query = query.in('account_id', accountIds)

  const { data: policies, error } = await query
  if (error) throw new Error(error.message)

  // Primer stage activo de renovaciones
  const { data: firstStage } = await admin
    .from('renewal_stages')
    .select('id')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  let applied = 0
  let skipped = 0
  const items: string[] = []

  for (const policy of (policies ?? []) as unknown as Array<{
    id: string
    account_id: string
    created_by: string
    policy_number: string | null
    end_date: string | null
    accounts: { name: string } | { name: string }[]
  }>) {
    // Verificar si ya existe una renovación no-cancelada
    const { data: existing } = await admin
      .from('renewals')
      .select('id')
      .eq('policy_id', policy.id)
      .not('status', 'in', '("cancelled")')
      .maybeSingle()

    if (existing) { skipped++; continue }

    const { error: insertError } = await admin
      .from('renewals')
      .insert({
        policy_id:        policy.id,
        account_id:       policy.account_id,
        assigned_to:      policy.created_by,
        current_stage_id: firstStage?.id ?? null,
        status:           'in_progress',
        created_by:       policy.created_by,
      })

    if (insertError) throw new Error(`Póliza ${policy.id}: ${insertError.message}`)

    const acct  = Array.isArray(policy.accounts) ? policy.accounts[0] : policy.accounts
    const polNo = policy.policy_number ? `#${policy.policy_number}` : '(sin número)'
    const vence = policy.end_date ? fmtDate(policy.end_date) : '?'
    items.push(`Póliza ${polNo} — ${acct?.name ?? ''} (vence ${vence})`)
    applied++
  }

  return { applied, skipped, items }
}

// ─── Cobranza rule ────────────────────────────────────────────────────────────

async function applyCobranzaRule(admin: ReturnType<typeof createAdminClient>, rule: PolicyBusinessRule) {
  const stageName = rule.action_config?.stage_name as string | undefined
  if (!stageName) throw new Error('action_config.stage_name es requerido')

  const { data: targetStage, error: stageError } = await admin
    .from('cobranza_stages')
    .select('id, sort_order')
    .ilike('name', stageName)
    .eq('is_active', true)
    .maybeSingle()

  if (stageError) throw new Error(stageError.message)
  if (!targetStage) throw new Error(`Etapa de cobranza "${stageName}" no encontrada`)

  const today   = new Date()
  const cutoff  = new Date(today)
  cutoff.setDate(cutoff.getDate() + rule.trigger_days)

  const todayStr  = today.toISOString().split('T')[0]
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Si la regla tiene filtro de equipo, obtenemos las cuentas de ese equipo primero
  let accountIds: string[] | null = null
  if (rule.filter_team_id) {
    const { data: teamAccounts } = await admin
      .from('accounts')
      .select('id')
      .eq('team_id', rule.filter_team_id)
    accountIds = (teamAccounts ?? []).map((a: { id: string }) => a.id)
    if (accountIds.length === 0) return { applied: 0, skipped: 0, items: [] }
  }

  // Recibos pendientes que vencen dentro del umbral
  let query = admin
    .from('policy_receipts')
    .select('id, current_stage_id, receipt_number, due_date, policy_id, policies!inner(conducto_cobro, account_id, policy_number, accounts!inner(name))')
    .eq('status', 'pending')
    .gte('due_date', todayStr)
    .lte('due_date', cutoffStr)

  if (accountIds) query = query.in('policies.account_id', accountIds)

  const { data: receipts, error: receiptsError } = await query
  if (receiptsError) throw new Error(receiptsError.message)

  let applied = 0
  let skipped = 0
  const items: string[] = []

  for (const receipt of (receipts ?? []) as unknown as Array<{
    id: string
    current_stage_id: string | null
    receipt_number: string | null
    due_date: string
    policy_id: string
    policies: {
      conducto_cobro: string | null
      account_id: string
      policy_number: string | null
      accounts: { name: string } | { name: string }[]
    } | Array<{
      conducto_cobro: string | null
      account_id: string
      policy_number: string | null
      accounts: { name: string } | { name: string }[]
    }>
  }>) {
    const pol = Array.isArray(receipt.policies) ? receipt.policies[0] : receipt.policies

    // Excluir domiciliadas
    if (pol?.conducto_cobro === 'domiciliacion') { skipped++; continue }

    // No retroceder etapas
    if (receipt.current_stage_id) {
      const { data: currentStage } = await admin
        .from('cobranza_stages')
        .select('sort_order')
        .eq('id', receipt.current_stage_id)
        .maybeSingle()
      if (currentStage && currentStage.sort_order >= targetStage.sort_order) {
        skipped++
        continue
      }
    }

    const { error: updateError } = await admin
      .from('policy_receipts')
      .update({ current_stage_id: targetStage.id })
      .eq('id', receipt.id)

    if (updateError) throw new Error(`Recibo ${receipt.id}: ${updateError.message}`)

    await admin.from('receipt_events').insert({
      receipt_id: receipt.id,
      action:     'stage_advanced',
      stage_id:   targetStage.id,
      notes:      `Regla automática: ${rule.name}`,
    })

    const acct    = pol?.accounts ? (Array.isArray(pol.accounts) ? pol.accounts[0] : pol.accounts) : null
    const recNo   = receipt.receipt_number ? `#${receipt.receipt_number}` : '(sin número)'
    const polNo   = pol?.policy_number ? ` Póliza #${pol.policy_number}` : ''
    const vence   = fmtDate(receipt.due_date)
    items.push(`Recibo ${recNo}${polNo} — ${acct?.name ?? ''} (vence ${vence})`)
    applied++
  }

  return { applied, skipped, items }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}
