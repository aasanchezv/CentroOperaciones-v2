'use server'

import { createAdminClient }   from '@/lib/supabase/admin'
import { createClient }         from '@/lib/supabase/server'
import { randomUUID }           from 'crypto'

// ── Tipos públicos del portal ────────────────────────────────────────────────

export interface PortalPolicy {
  id:                string
  policy_number:     string | null
  branch:            string
  insurer:           string
  status:            string
  premium:           number | null
  start_date:        string | null
  end_date:          string | null
  payment_frequency: string | null
  concepto:          string | null
  subramo:           string | null
  policy_url:        string | null
  tomador_name:      string | null
}

export interface PortalReceipt {
  due_date:         string
  amount:           number | null
  status:           string
  paid_at:          string | null
  policy_number:    string | null
  branch:           string | null
  insurer:          string | null
}

export interface PortalMovement {
  id:                 string
  movement_type_name: string
  status:             string
  created_at:         string
  policy_number:      string | null
  insurer:            string
}

export interface PortalClaim {
  id:             string
  loss_date:      string | null
  claim_type:     string | null
  description:    string | null
  amount_claimed: number | null
  amount_approved: number | null
  amount_paid:    number | null
  status_insurer: string | null
  insurer_name:   string | null
}

export interface PortalData {
  account: {
    id:           string
    name:         string
    account_code: string
    type:         string
    client_since: string   // created_at formatted
    portal_last_accessed_at: string | null
  }
  agent: {
    full_name: string
    email:     string
  } | null
  policies:  PortalPolicy[]
  receipts:  PortalReceipt[]
  movements: PortalMovement[]
  claims:    PortalClaim[]
}

// ── Consulta pública (sin auth) ──────────────────────────────────────────────

export async function getPortalData(token: string): Promise<PortalData | null> {
  if (!token || token.length < 20) return null

  const admin = createAdminClient()

  // 1. Validate token + fetch account + agent
  const { data: account } = await admin
    .from('accounts')
    .select('id, name, account_code, type, created_at, portal_last_accessed_at, profiles!assigned_to(full_name, email)')
    .eq('portal_token', token)
    .eq('portal_enabled', true)
    .single()

  if (!account) return null

  // 2. Update last accessed (fire-and-forget)
  admin
    .from('accounts')
    .update({ portal_last_accessed_at: new Date().toISOString() })
    .eq('id', account.id)
    .then(() => {})

  const accountId = account.id

  // 3. Date windows
  const now        = new Date()
  const ago13      = new Date(now); ago13.setMonth(ago13.getMonth() - 13)
  const ahead12    = new Date(now); ahead12.setMonth(ahead12.getMonth() + 12)

  // 4. Parallel fetch — all data for the account
  const [
    { data: policiesRawFull, error: policiesError },
    { data: receiptsRaw },
    { data: movementsRaw },
    { data: claimsRaw },
  ] = await Promise.all([
    admin
      .from('policies')
      .select('id, policy_number, branch, insurer, status, premium, start_date, end_date, payment_frequency, concepto, subramo, policy_url')
      .eq('account_id', accountId)
      .order('end_date', { ascending: false }),

    admin
      .from('policy_receipts')
      .select('due_date, amount, status, paid_at, policies!inner(policy_number, branch, insurer)')
      .eq('account_id', accountId)
      .gte('due_date', ago13.toISOString().slice(0, 10))
      .lte('due_date', ahead12.toISOString().slice(0, 10))
      .order('due_date'),

    admin
      .from('policy_movements')
      .select('id, movement_type_name, status, created_at, policy_number, insurer')
      .eq('account_id', accountId)
      .in('status', ['sent', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(50),

    admin
      .from('account_claims')
      .select('id, loss_date, claim_type, description, amount_claimed, amount_approved, amount_paid, status_insurer, insurers!inner(name, short_name)')
      .eq('account_id', accountId)
      .eq('is_matched', true)
      .order('loss_date', { ascending: false })
      .limit(200),
  ])

  // Log for debugging (visible in Vercel function logs)
  console.log('[Portal] accountId:', accountId, '| policies:', policiesRawFull?.length ?? 'ERROR', policiesError?.message ?? 'ok')

  // Fallback: if full query fails (some columns may not exist in DB), retry with base columns only
  let policiesRaw = policiesRawFull
  if (policiesError) {
    console.error('[Portal] Full policies query failed, trying fallback:', policiesError.message)
    const { data: fallback, error: fallbackErr } = await admin
      .from('policies')
      .select('id, policy_number, branch, insurer, status, premium, start_date, end_date')
      .eq('account_id', accountId)
      .order('end_date', { ascending: false })
    console.log('[Portal] Fallback result:', fallback?.length ?? 'ERROR', fallbackErr?.message ?? 'ok')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    policiesRaw = (fallback ?? []) as any[]
  }

  // 5. Shape data (exclude sensitive fields)
  const agentRaw = account.profiles as unknown as { full_name: string; email: string } | null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const policies: PortalPolicy[] = (policiesRaw ?? []).map((p: any) => ({
    id:                p.id,
    policy_number:     p.policy_number ?? null,
    branch:            p.branch,
    insurer:           p.insurer,
    status:            p.status,
    premium:           p.premium ?? null,
    start_date:        p.start_date ?? null,
    end_date:          p.end_date ?? null,
    payment_frequency: p.payment_frequency ?? null,
    concepto:          p.concepto ?? null,
    subramo:           p.subramo ?? null,
    policy_url:        p.policy_url ?? null,
    tomador_name:      null,
  }))

  const receipts: PortalReceipt[] = (receiptsRaw ?? []).map(r => {
    const pol = r.policies as unknown as { policy_number: string | null; branch: string; insurer: string } | null
    return {
      due_date:      r.due_date,
      amount:        r.amount,
      status:        r.status,
      paid_at:       r.paid_at,
      policy_number: pol?.policy_number ?? null,
      branch:        pol?.branch ?? null,
      insurer:       pol?.insurer ?? null,
    }
  })

  const movements: PortalMovement[] = (movementsRaw ?? []).map(m => ({
    id:                 m.id,
    movement_type_name: m.movement_type_name,
    status:             m.status,
    created_at:         m.created_at,
    policy_number:      m.policy_number,
    insurer:            m.insurer,
  }))

  const claims: PortalClaim[] = (claimsRaw ?? []).map(c => {
    const ins = c.insurers as unknown as { name: string; short_name: string | null } | null
    return {
      id:              c.id,
      loss_date:       c.loss_date,
      claim_type:      c.claim_type,
      description:     c.description,
      amount_claimed:  c.amount_claimed,
      amount_approved: c.amount_approved,
      amount_paid:     c.amount_paid,
      status_insurer:  c.status_insurer,
      insurer_name:    ins?.short_name ?? ins?.name ?? null,
    }
  })

  return {
    account: {
      id:           account.id,
      name:         account.name,
      account_code: account.account_code,
      type:         account.type,
      client_since: account.created_at,
      portal_last_accessed_at: account.portal_last_accessed_at,
    },
    agent:     agentRaw ? { full_name: agentRaw.full_name, email: agentRaw.email } : null,
    policies,
    receipts,
    movements,
    claims,
  }
}

// ── Gestión del portal (requieren auth) ─────────────────────────────────────

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  return { supabase, user }
}

export async function generatePortalToken(accountId: string): Promise<{ token?: string; error?: string }> {
  try {
    await requireAuth()
    const admin = createAdminClient()
    const token = randomUUID()
    const { error } = await admin
      .from('accounts')
      .update({ portal_token: token, portal_enabled: true })
      .eq('id', accountId)
    if (error) return { error: error.message }
    return { token }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error' }
  }
}

export async function togglePortalEnabled(accountId: string, enabled: boolean): Promise<{ error?: string }> {
  try {
    await requireAuth()
    const admin = createAdminClient()
    const { error } = await admin
      .from('accounts')
      .update({ portal_enabled: enabled })
      .eq('id', accountId)
    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error' }
  }
}

export async function revokeAndRegeneratePortalToken(accountId: string): Promise<{ token?: string; error?: string }> {
  try {
    await requireAuth()
    const admin = createAdminClient()
    const token = randomUUID()
    const { error } = await admin
      .from('accounts')
      .update({ portal_token: token, portal_enabled: true })
      .eq('id', accountId)
    if (error) return { error: error.message }
    return { token }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error' }
  }
}
