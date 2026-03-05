'use server'

import { revalidatePath }    from 'next/cache'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, EMAIL_FROM } from '@/lib/resend'
import { sendWhatsApp }      from '@/lib/kapso'
import { getEmailCcList }    from '@/lib/email-cc'
import {
  renderTemplate,
  formatMXN,
  formatDate,
  calcDaysUntil,
  BRANCH_LABELS,
  type CollectionVars,
} from '@/lib/collection-vars'
import type { CobranzaStage, PolicyReceipt } from '@/types/database.types'

// ─── Types públicos ───────────────────────────────────────────

export interface ReceiptWithContext extends PolicyReceipt {
  // Joined policy data
  policy_number:   string | null
  insurer:         string | null
  branch:          string | null
  conducto_cobro:  string | null
  // Joined account data
  account_name:    string
  account_code:    string
  // Joined stage data
  stage_name:      string | null
  stage_sort:      number | null
  // Joined collected_by
  collector_name:  string | null
  // Computed
  days_until_due:  number   // negative = overdue
}

export interface CobranzaKpis {
  urgentCount:     number   // overdue OR pending due ≤3 days
  weekCount:       number   // pending due ≤15 days
  pendingPrima:    number   // sum ALL pending+overdue amounts
  cumplimientoPct: number   // cobrado_mes_amount / (cobrado_mes + pending_mes) * 100
  semaforo:        'green' | 'yellow' | 'red'
}

export interface BulkCobrarResult {
  sent:   number
  errors: string[]
}

// ─── Auth helper ──────────────────────────────────────────────

async function requireOperatorFull() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, team_id')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role === 'readonly') throw new Error('Acceso denegado')
  return { user, supabase, profile }
}

async function requireAdminOps() {
  const { profile } = await requireOperatorFull()
  if (!['admin', 'ops'].includes(profile.role)) throw new Error('Solo admin u ops')
  return profile
}

// ─── Date helpers ─────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function getPeriodEnd(period: 'today' | 'week' | 'month' | 'quarter'): string {
  const now = new Date()
  if (period === 'today') return toDateStr(now)
  if (period === 'week') {
    const end = new Date(now)
    end.setDate(end.getDate() + 7)
    return toDateStr(end)
  }
  if (period === 'month') {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return toDateStr(end)
  }
  // quarter
  const quarter = Math.floor(now.getMonth() / 3)
  const end = new Date(now.getFullYear(), (quarter + 1) * 3, 0)
  return toDateStr(end)
}

export type CobranzaPeriod = 'vencido' | 'today' | 'week' | 'month' | 'quarter'

// ─── Generate Receipts ────────────────────────────────────────

export async function generatePolicyReceipts(
  policyId: string,
): Promise<{ count: number; error?: string }> {
  try {
    const { user } = await requireOperatorFull()
    const admin = createAdminClient()

    // Load policy
    const { data: policy } = await admin
      .from('policies')
      .select('id, account_id, premium, start_date, end_date, payment_frequency')
      .eq('id', policyId)
      .single()

    if (!policy) return { count: 0, error: 'Póliza no encontrada' }

    if (!policy.start_date || !policy.end_date) {
      return { count: 0, error: 'La póliza requiere fecha de inicio y fin' }
    }

    const frequency = (policy.payment_frequency ?? 'anual') as string
    const intervalMonths: Record<string, number> = {
      mensual:    1,
      bimestral:  2,
      trimestral: 3,
      semestral:  6,
      anual:      12,
    }
    const interval = intervalMonths[frequency] ?? 12
    const paymentsPerYear = 12 / interval
    const amount = policy.premium != null
      ? Math.round((policy.premium / paymentsPerYear) * 100) / 100
      : null

    // Load first active stage
    const { data: firstStage } = await admin
      .from('cobranza_stages')
      .select('id')
      .eq('is_active', true)
      .order('sort_order')
      .limit(1)
      .single()

    const todayStr = toDateStr(new Date())

    // Delete existing PENDING receipts for this policy (keep paid/cancelled)
    await admin
      .from('policy_receipts')
      .delete()
      .eq('policy_id', policyId)
      .in('status', ['pending', 'overdue'])

    // Generate receipts
    const receipts: object[] = []
    let current = new Date(policy.start_date)
    const endDate = new Date(policy.end_date)

    while (current <= endDate) {
      const dueDateStr = toDateStr(current)
      receipts.push({
        policy_id:        policyId,
        account_id:       policy.account_id,
        due_date:         dueDateStr,
        amount,
        status:           dueDateStr < todayStr ? 'overdue' : 'pending',
        current_stage_id: firstStage?.id ?? null,
        created_by:       user.id,
      })
      current = addMonths(current, interval)
    }

    if (receipts.length === 0) {
      return { count: 0, error: 'No se generaron recibos — verifica fechas de la póliza' }
    }

    const { error } = await admin.from('policy_receipts').insert(receipts)
    if (error) return { count: 0, error: error.message }

    revalidatePath('/cobranza')
    return { count: receipts.length }
  } catch (e) {
    return { count: 0, error: (e as Error).message }
  }
}

// ─── KPIs ────────────────────────────────────────────────────

export async function getCobranzaKpis(): Promise<CobranzaKpis> {
  const { user, profile } = await requireOperatorFull()
  const admin = createAdminClient()
  const today = new Date()
  const todayStr = toDateStr(today)

  // Build account filter based on role
  let accountIds: string[] | null = null
  if (!['admin', 'ops'].includes(profile.role)) {
    let query = admin.from('accounts').select('id')
    if (profile.role === 'manager' && profile.team_id) {
      query = query.eq('team_id', profile.team_id)
    } else {
      query = query.eq('assigned_to', user.id)
    }
    const { data: accounts } = await query
    accountIds = (accounts ?? []).map((a: { id: string }) => a.id)
    if (accountIds.length === 0) {
      return { urgentCount: 0, weekCount: 0, pendingPrima: 0, cumplimientoPct: 0, semaforo: 'green' }
    }
  }

  // Load receipts relevant to the user — limitar a últimos 2 años para admin/ops
  // (evita full table scan de ~360k filas a escala)
  const kpiYearStart = `${today.getFullYear() - 1}-01-01`
  let receiptsQuery = admin
    .from('policy_receipts')
    .select('due_date, amount, status, paid_at')
    .gte('due_date', kpiYearStart)

  if (accountIds) receiptsQuery = receiptsQuery.in('account_id', accountIds)

  const { data: receipts } = await receiptsQuery
  const rows = (receipts ?? []) as Array<{
    due_date: string; amount: number | null; status: string; paid_at: string | null
  }>

  // Load semáforo thresholds
  const { data: settings } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', ['cobranza_semaforo_red', 'cobranza_semaforo_yellow'])

  const settingsMap = Object.fromEntries(
    (settings ?? []).map((s: { key: string; value: string | null }) => [s.key, s.value])
  )
  const redThreshold    = parseInt(settingsMap['cobranza_semaforo_red']    ?? '3', 10)
  const yellowThreshold = parseInt(settingsMap['cobranza_semaforo_yellow'] ?? '1', 10)

  // Calculations
  const in3DaysStr  = toDateStr(new Date(today.getTime() + 3  * 86400000))
  const in15DaysStr = toDateStr(new Date(today.getTime() + 15 * 86400000))

  // urgentCount: overdue (vencidos) + pending due within 3 days
  const urgentCount = rows.filter(r =>
    r.status === 'overdue' ||
    (r.status === 'pending' && r.due_date <= in3DaysStr)
  ).length

  const weekCount = rows.filter(r =>
    r.status === 'pending' && r.due_date >= todayStr && r.due_date <= in15DaysStr
  ).length

  // Prima Pendiente de Cobro: ALL pending + overdue amounts
  const pendingPrima = rows
    .filter(r => r.status === 'pending' || r.status === 'overdue')
    .reduce((s, r) => s + (r.amount ?? 0), 0)

  // Cumplimiento del mes: use amounts (prima), not count
  const monthStart = toDateStr(new Date(today.getFullYear(), today.getMonth(), 1))
  const monthEnd   = toDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0))

  const paidAmountThisMonth = rows
    .filter(r => {
      if (r.status !== 'paid' || !r.paid_at) return false
      const paidDate = r.paid_at.split('T')[0]
      return paidDate >= monthStart && paidDate <= monthEnd
    })
    .reduce((s, r) => s + (r.amount ?? 0), 0)

  const pendingAmountThisMonth = rows
    .filter(r =>
      (r.status === 'pending' || r.status === 'overdue') &&
      r.due_date >= monthStart && r.due_date <= monthEnd
    )
    .reduce((s, r) => s + (r.amount ?? 0), 0)

  const totalAmountThisMonth = paidAmountThisMonth + pendingAmountThisMonth
  const cumplimientoPct = totalAmountThisMonth > 0
    ? Math.round((paidAmountThisMonth / totalAmountThisMonth) * 100)
    : 0

  const semaforo: 'green' | 'yellow' | 'red' =
    urgentCount >= redThreshold    ? 'red'    :
    urgentCount >= yellowThreshold ? 'yellow' : 'green'

  return { urgentCount, weekCount, pendingPrima, cumplimientoPct, semaforo }
}

// ─── Period Counts ────────────────────────────────────────────

export async function getCobranzaPeriodCounts(): Promise<Record<CobranzaPeriod, number>> {
  const { user, profile } = await requireOperatorFull()
  const admin = createAdminClient()
  const todayStr = toDateStr(new Date())

  let accountIds: string[] | null = null
  if (!['admin', 'ops'].includes(profile.role)) {
    let q = admin.from('accounts').select('id')
    if (profile.role === 'manager' && profile.team_id) {
      q = q.eq('team_id', profile.team_id)
    } else {
      q = q.eq('assigned_to', user.id)
    }
    const { data: accounts } = await q
    accountIds = (accounts ?? []).map((a: { id: string }) => a.id)
    if (accountIds.length === 0) return { vencido: 0, today: 0, week: 0, month: 0, quarter: 0 }
  }

  const countYearStart = `${new Date().getFullYear() - 1}-01-01`
  let countQuery = admin
    .from('policy_receipts')
    .select('due_date, status')
    .or('status.eq.overdue,status.eq.pending')
    .gte('due_date', countYearStart)

  if (accountIds) countQuery = countQuery.in('account_id', accountIds)

  const { data: rows } = await countQuery
  const data = (rows ?? []) as Array<{ due_date: string; status: string }>

  const weekEnd    = getPeriodEnd('week')
  const monthEnd   = getPeriodEnd('month')
  const quarterEnd = getPeriodEnd('quarter')
  const overdue    = data.filter(r => r.status === 'overdue')
  const pending    = data.filter(r => r.status === 'pending')

  return {
    vencido: overdue.length,
    today:   pending.filter(r => r.due_date === todayStr).length,
    week:    pending.filter(r => r.due_date >= todayStr && r.due_date <= weekEnd).length,
    month:   pending.filter(r => r.due_date >= todayStr && r.due_date <= monthEnd).length,
    quarter: pending.filter(r => r.due_date >= todayStr && r.due_date <= quarterEnd).length,
  }
}

// ─── Receipt List ─────────────────────────────────────────────

export async function getReceiptsForPeriod(
  period: CobranzaPeriod,
): Promise<{ pending: ReceiptWithContext[]; paid: ReceiptWithContext[] }> {
  const { user, profile } = await requireOperatorFull()
  const admin = createAdminClient()
  const today = new Date()
  const todayStr = toDateStr(today)
  const periodEnd = period !== 'vencido' ? getPeriodEnd(period) : ''

  // Account filter
  let accountIds: string[] | null = null
  if (!['admin', 'ops'].includes(profile.role)) {
    let q = admin.from('accounts').select('id')
    if (profile.role === 'manager' && profile.team_id) {
      q = q.eq('team_id', profile.team_id)
    } else {
      q = q.eq('assigned_to', user.id)
    }
    const { data: accounts } = await q
    accountIds = (accounts ?? []).map((a: { id: string }) => a.id)
    if (accountIds.length === 0) return { pending: [], paid: [] }
  }

  // Base query — join policy, account, stage
  let baseQuery = admin
    .from('policy_receipts')
    .select(`
      id, policy_id, account_id, receipt_number, due_date, amount,
      status, current_stage_id, paid_at, collected_by, notes, created_by, created_at, updated_at,
      policies!policy_id (policy_number, insurer, branch, conducto_cobro),
      accounts!account_id (name, account_code),
      cobranza_stages!current_stage_id (name, sort_order),
      collector:profiles!collected_by (full_name)
    `)

  if (accountIds) baseQuery = baseQuery.in('account_id', accountIds)

  // Pending: vencido = solo overdue; otros = solo pending en su ventana exacta
  const pendingQuery = period === 'vencido'
    ? baseQuery.eq('status', 'overdue').order('due_date').limit(300)
    : baseQuery.eq('status', 'pending').gte('due_date', todayStr).lte('due_date', periodEnd).order('due_date')

  // Paid: within period
  const paidQuery = admin
    .from('policy_receipts')
    .select(`
      id, policy_id, account_id, receipt_number, due_date, amount,
      status, current_stage_id, paid_at, collected_by, notes, created_by, created_at, updated_at,
      policies!policy_id (policy_number, insurer, branch, conducto_cobro),
      accounts!account_id (name, account_code),
      cobranza_stages!current_stage_id (name, sort_order),
      collector:profiles!collected_by (full_name)
    `)
    .eq('status', 'paid')
    .gte('paid_at', `${toDateStr(new Date(today.getFullYear(), today.getMonth(), 1))}T00:00:00`)
    .order('paid_at', { ascending: false })
    .limit(50)

  if (accountIds) {
    // Can't reuse baseQuery ref, rebuild
  }

  const [pendingRes, paidRes] = await Promise.all([
    pendingQuery,
    paidQuery,
  ])

  function normalize(rows: Record<string, unknown>[]): ReceiptWithContext[] {
    return rows.map(r => {
      const policy  = (Array.isArray(r.policies) ? r.policies[0] : r.policies) as Record<string, unknown> | null
      const account = (Array.isArray(r.accounts) ? r.accounts[0] : r.accounts) as Record<string, unknown> | null
      const stage   = (Array.isArray(r.cobranza_stages) ? r.cobranza_stages[0] : r.cobranza_stages) as Record<string, unknown> | null
      const collector = (Array.isArray(r.collector) ? r.collector[0] : r.collector) as Record<string, unknown> | null
      const dueDate = new Date(r.due_date as string)
      const diffMs  = dueDate.getTime() - today.getTime()
      const daysDiff = Math.ceil(diffMs / 86400000)
      return {
        id:               r.id as string,
        policy_id:        r.policy_id as string,
        account_id:       r.account_id as string,
        receipt_number:   (r.receipt_number as string | null) ?? null,
        due_date:         r.due_date as string,
        amount:           (r.amount as number | null) ?? null,
        status:           r.status as PolicyReceipt['status'],
        current_stage_id: (r.current_stage_id as string | null) ?? null,
        paid_at:          (r.paid_at as string | null) ?? null,
        collected_by:     (r.collected_by as string | null) ?? null,
        notes:            (r.notes as string | null) ?? null,
        created_by:       r.created_by as string,
        created_at:       r.created_at as string,
        updated_at:       r.updated_at as string,
        policy_number:    (policy?.policy_number as string | null) ?? null,
        insurer:          (policy?.insurer as string | null) ?? null,
        branch:           (policy?.branch as string | null) ?? null,
        conducto_cobro:   (policy?.conducto_cobro as string | null) ?? null,
        account_name:     (account?.name as string) ?? '—',
        account_code:     (account?.account_code as string) ?? '',
        stage_name:       (stage?.name as string | null) ?? null,
        stage_sort:       (stage?.sort_order as number | null) ?? null,
        collector_name:   (collector?.full_name as string | null) ?? null,
        days_until_due:   daysDiff,
      }
    })
  }

  const pending = normalize((pendingRes.data ?? []) as Record<string, unknown>[])
  const paid    = normalize((paidRes.data   ?? []) as Record<string, unknown>[])

  return { pending, paid }
}

// ─── Bulk Cobrar ──────────────────────────────────────────────

export async function bulkCobrar(
  receiptIds: string[],
): Promise<BulkCobrarResult> {
  const { user, profile } = await requireOperatorFull()
  const admin = createAdminClient()
  let sent = 0
  const errors: string[] = []

  // Load all stages (for advancement logic)
  const { data: allStages } = await admin
    .from('cobranza_stages')
    .select('id, name, sort_order, send_email, send_whatsapp, email_template_id, whatsapp_template_id, is_active, days_before')
    .eq('is_active', true)
    .order('sort_order')

  const stages = (allStages ?? []) as CobranzaStage[]

  // ── Batch pre-fetch: receipts con datos anidados ──────────────
  const { data: allReceipts } = await admin
    .from('policy_receipts')
    .select(`
      id, policy_id, account_id, amount, current_stage_id, due_date,
      policies!policy_id (
        id, policy_number, insurer, branch, start_date, premium, end_date, conducto_cobro,
        contacts!tomador_id (id, full_name, email, phone)
      ),
      accounts!account_id (name, team_id)
    `)
    .in('id', receiptIds)
  const receiptMap = new Map((allReceipts ?? []).map(r => [r.id, r]))

  // ── Batch pre-fetch: envíos de hoy (detección de duplicados) ─
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { data: recentSendsAll } = await admin
    .from('collection_sends')
    .select('receipt_id')
    .in('receipt_id', receiptIds)
    .gte('created_at', todayStart.toISOString())
  const alreadySentToday = new Set((recentSendsAll ?? []).map(s => s.receipt_id as string))

  // ── Batch pre-fetch: plantillas de email/WA por etapa ────────
  const allTemplateIds = [
    ...stages.map(s => s.email_template_id),
    ...stages.map(s => s.whatsapp_template_id),
    ...stages.map(s => (s as unknown as Record<string, unknown>).email_template_domiciliado_id as string | null),
    ...stages.map(s => (s as unknown as Record<string, unknown>).whatsapp_template_domiciliado_id as string | null),
  ].filter((id): id is string => Boolean(id))

  const { data: allTemplatesData } = allTemplateIds.length > 0
    ? await admin
        .from('collection_templates')
        .select('id, subject_email, body_email, body_whatsapp')
        .in('id', [...new Set(allTemplateIds)])
    : { data: [] as { id: string; subject_email: string | null; body_email: string | null; body_whatsapp: string | null }[] }
  const templateMap = new Map((allTemplatesData ?? []).map(t => [t.id, t]))

  for (const receiptId of receiptIds) {
    try {
      // Lookup desde el mapa pre-cargado (sin query DB)
      const receipt = receiptMap.get(receiptId)
      if (!receipt) { errors.push(`Recibo ${receiptId} no encontrado`); continue }

      const policy  = (Array.isArray(receipt.policies) ? receipt.policies[0] : receipt.policies) as Record<string, unknown>
      const account = (Array.isArray(receipt.accounts) ? receipt.accounts[0] : receipt.accounts) as Record<string, unknown>
      const tomador = policy ? ((Array.isArray(policy.contacts) ? policy.contacts[0] : policy.contacts) as { id: string; full_name: string; email: string | null; phone: string | null } | null) : null

      // Find current stage
      const currentStage = stages.find(s => s.id === receipt.current_stage_id) ?? stages[0]
      if (!currentStage) { errors.push(`Sin etapas configuradas`); continue }

      // ── Validar ventana days_before ───────────────────────────
      if ((currentStage as CobranzaStage & { days_before: number | null }).days_before != null) {
        const daysBefore = (currentStage as CobranzaStage & { days_before: number | null }).days_before as number
        const dueDate = new Date(receipt.due_date + 'T12:00:00')
        const todayMidnight = new Date()
        todayMidnight.setHours(0, 0, 0, 0)
        const daysUntilDue = Math.ceil((dueDate.getTime() - todayMidnight.getTime()) / 86400000)
        if (daysUntilDue > daysBefore) {
          const acctName = (Array.isArray(receipt.accounts) ? receipt.accounts[0] : receipt.accounts) as Record<string, unknown> | null
          errors.push(
            `${(acctName?.name as string) ?? receiptId}: fuera del período de aviso ` +
            `(faltan ${daysUntilDue} días, el aviso se activa a ${daysBefore} días antes)`
          )
          continue
        }
      }

      // ── Evitar envíos duplicados en el mismo día (pre-fetched) ─
      if (alreadySentToday.has(receiptId)) {
        const acctName2 = (Array.isArray(receipt.accounts) ? receipt.accounts[0] : receipt.accounts) as Record<string, unknown> | null
        errors.push(`${(acctName2?.name as string) ?? receiptId}: aviso ya enviado hoy`)
        continue
      }

      // Find next stage
      const nextStage = stages.find(s => s.sort_order > currentStage.sort_order) ?? null
      const isLastStage = !nextStage

      // Build vars
      const vars: CollectionVars = {
        nombre:           tomador?.full_name ?? 'Cliente',
        monto:            formatMXN(receipt.amount ?? (policy?.premium as number | null)),
        numero_poliza:    (policy?.policy_number as string | null) ?? 'S/N',
        aseguradora:      (policy?.insurer as string) ?? '—',
        vencimiento:      formatDate(receipt.due_date),
        cuenta:           (account?.name as string) ?? '—',
        ejecutivo:        profile.full_name ?? 'Ejecutivo',
        fecha_hoy:        formatDate(new Date().toISOString()),
        // Campos extendidos
        ramo:             BRANCH_LABELS[(policy?.branch as string | null) ?? ''] ?? '',
        inicio_vigencia:  formatDate((policy?.start_date as string | null)),
        dias_vencimiento: calcDaysUntil(receipt.due_date),
        telefono_cliente: tomador?.phone ?? '',
        email_cliente:    tomador?.email ?? '',
        conducto:         (policy?.conducto_cobro as string | null) ?? '',
      }

      const channelsSent: string[] = []

      // ── Send email (plantilla del mapa pre-cargado) ───────────
      if (currentStage.send_email && currentStage.email_template_id && tomador?.email) {
        const tmpl = templateMap.get(currentStage.email_template_id)

        if (tmpl?.body_email) {
          try {
            const cc = await getEmailCcList(false, (account?.team_id as string | null) ?? undefined)
            await resend.emails.send({
              from:    EMAIL_FROM,
              to:      tomador.email,
              subject: tmpl.subject_email
                ? renderTemplate(tmpl.subject_email, vars)
                : `Aviso de cobranza — ${vars.numero_poliza}`,
              text: renderTemplate(tmpl.body_email, vars),
              ...(cc.length ? { cc } : {}),
            })
            channelsSent.push('email')
          } catch { /* email failure is non-blocking */ }
        }
      }

      // ── Send WhatsApp (plantilla del mapa pre-cargado) ────────
      if (currentStage.send_whatsapp && currentStage.whatsapp_template_id && tomador?.phone) {
        const tmpl = templateMap.get(currentStage.whatsapp_template_id)

        if (tmpl?.body_whatsapp) {
          const ok = await sendWhatsApp(tomador.phone, renderTemplate(tmpl.body_whatsapp, vars))
          if (ok) channelsSent.push('whatsapp')
        }
      }

      // ── Record collection_send ────────────────────────────────
      if (channelsSent.length > 0) {
        await admin.from('collection_sends').insert({
          policy_id:    receipt.policy_id,
          account_id:   receipt.account_id,
          template_id:  channelsSent.includes('email') ? currentStage.email_template_id : currentStage.whatsapp_template_id,
          template_name: currentStage.name,
          channel:      channelsSent.join('+'),
          sent_to_email: channelsSent.includes('email') ? tomador?.email ?? null : null,
          sent_to_phone: channelsSent.includes('whatsapp') ? tomador?.phone ?? null : null,
          sent_by:      user.id,
          receipt_id:   receiptId,
        })
      }

      // ── Record receipt_event ──────────────────────────────────
      await admin.from('receipt_events').insert({
        receipt_id: receiptId,
        action:     'notice_sent',
        stage_id:   currentStage.id,
        actor_id:   user.id,
        metadata:   { channels: channelsSent, stage_name: currentStage.name },
      })

      // ── Advance stage or mark paid ────────────────────────────
      if (isLastStage) {
        // Last stage — mark as paid
        await admin.from('policy_receipts')
          .update({
            status:           'paid',
            paid_at:          new Date().toISOString(),
            collected_by:     user.id,
            current_stage_id: currentStage.id,
          })
          .eq('id', receiptId)

        await admin.from('receipt_events').insert({
          receipt_id: receiptId,
          action:     'paid',
          stage_id:   currentStage.id,
          actor_id:   user.id,
        })
      } else {
        // Advance to next stage
        await admin.from('policy_receipts')
          .update({ current_stage_id: nextStage!.id })
          .eq('id', receiptId)

        await admin.from('receipt_events').insert({
          receipt_id: receiptId,
          action:     'stage_advanced',
          stage_id:   nextStage!.id,
          actor_id:   user.id,
          metadata:   { from_stage: currentStage.name, to_stage: nextStage!.name },
        })
      }

      sent++
    } catch (e) {
      errors.push(`Error en recibo ${receiptId}: ${(e as Error).message}`)
    }
  }

  revalidatePath('/cobranza')
  return { sent, errors }
}

// ─── Update Stage Manually ────────────────────────────────────

export async function updateReceiptStage(
  receiptId: string,
  stageId:   string,
): Promise<{ error?: string }> {
  try {
    const { user } = await requireOperatorFull()
    const admin = createAdminClient()

    const { error } = await admin
      .from('policy_receipts')
      .update({ current_stage_id: stageId })
      .eq('id', receiptId)

    if (error) return { error: error.message }

    await admin.from('receipt_events').insert({
      receipt_id: receiptId,
      action:     'stage_advanced',
      stage_id:   stageId,
      actor_id:   user.id,
    })

    revalidatePath('/cobranza')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── Advance Stage (Cobrar per-card button) ───────────────────

export async function advanceReceiptStage(
  receiptId: string,
): Promise<{ stageId: string; stageName: string } | { error: string }> {
  try {
    const { user } = await requireOperatorFull()
    const admin = createAdminClient()

    // Get receipt with its current stage sort_order + account team_id
    const { data: receipt } = await admin
      .from('policy_receipts')
      .select(`
        current_stage_id,
        accounts!account_id(team_id),
        cobranza_stages!current_stage_id(sort_order)
      `)
      .eq('id', receiptId)
      .single()

    if (!receipt) return { error: 'Recibo no encontrado' }

    const accountArr  = Array.isArray(receipt.accounts) ? receipt.accounts[0] : receipt.accounts
    const teamId      = (accountArr as { team_id: string | null } | null)?.team_id ?? null
    const stageArr    = Array.isArray(receipt.cobranza_stages) ? receipt.cobranza_stages[0] : receipt.cobranza_stages
    const currentSort = (stageArr as { sort_order: number } | null)?.sort_order ?? -1

    // Find next stage: prefer team-specific, fallback to global
    let nextStageId: string | null = null
    let nextStageName: string | null = null

    if (teamId) {
      const { data: ts } = await admin
        .from('cobranza_stages')
        .select('id, name')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .gt('sort_order', currentSort)
        .order('sort_order')
        .limit(1)
        .maybeSingle()
      if (ts) { nextStageId = ts.id; nextStageName = ts.name as string }
    }

    if (!nextStageId) {
      const { data: gs } = await admin
        .from('cobranza_stages')
        .select('id, name')
        .is('team_id', null)
        .eq('is_active', true)
        .gt('sort_order', currentSort)
        .order('sort_order')
        .limit(1)
        .maybeSingle()
      if (gs) { nextStageId = gs.id; nextStageName = gs.name as string }
    }

    if (!nextStageId) return { error: 'Ya está en la última etapa de cobranza' }

    await admin
      .from('policy_receipts')
      .update({ current_stage_id: nextStageId })
      .eq('id', receiptId)

    await admin.from('receipt_events').insert({
      receipt_id: receiptId,
      action:     'stage_advanced',
      stage_id:   nextStageId,
      actor_id:   user.id,
    })

    revalidatePath('/cobranza')
    return { stageId: nextStageId, stageName: nextStageName! }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── Mark Paid Manually ───────────────────────────────────────

export async function markReceiptPaid(
  receiptId: string,
  notes?:    string,
): Promise<{ error?: string }> {
  try {
    const { user } = await requireOperatorFull()
    const admin = createAdminClient()

    const { error } = await admin
      .from('policy_receipts')
      .update({
        status:       'paid',
        paid_at:      new Date().toISOString(),
        collected_by: user.id,
        ...(notes ? { notes } : {}),
      })
      .eq('id', receiptId)

    if (error) return { error: error.message }

    await admin.from('receipt_events').insert({
      receipt_id: receiptId,
      action:     'paid',
      actor_id:   user.id,
      notes:      notes ?? null,
    })

    revalidatePath('/cobranza')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── Cancel Receipt (admin/ops) ───────────────────────────────

export async function cancelReceipt(receiptId: string): Promise<{ error?: string }> {
  try {
    await requireAdminOps()
    const admin = createAdminClient()

    const { error } = await admin
      .from('policy_receipts')
      .update({ status: 'cancelled' })
      .eq('id', receiptId)

    if (error) return { error: error.message }
    revalidatePath('/cobranza')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/// ─── Admin: Stages CRUD ───────────────────────────────────────

export async function getCobranzaStages(teamId?: string | null): Promise<CobranzaStage[]> {
  const admin = createAdminClient()
  if (teamId) {
    const { data: teamStages } = await admin
      .from('cobranza_stages').select('*').eq('team_id', teamId).order('sort_order')
    if (teamStages && teamStages.length > 0) return teamStages as CobranzaStage[]
  }
  // Fallback a globales (o sin filtro cuando no se pasa teamId)
  const { data } = await admin
    .from('cobranza_stages').select('*').is('team_id', null).order('sort_order')
  return (data ?? []) as CobranzaStage[]
}

export async function getAllCobranzaStagesGrouped(): Promise<{
  global:  CobranzaStage[]
  byTeam:  Record<string, CobranzaStage[]>
}> {
  const admin = createAdminClient()
  const { data } = await admin.from('cobranza_stages').select('*').order('sort_order')
  const all = (data ?? []) as CobranzaStage[]
  const global = all.filter(s => s.team_id === null)
  const byTeam: Record<string, CobranzaStage[]> = {}
  for (const stage of all) {
    if (stage.team_id) {
      if (!byTeam[stage.team_id]) byTeam[stage.team_id] = []
      byTeam[stage.team_id].push(stage)
    }
  }
  return { global, byTeam }
}

export async function copyGlobalCobranzaStagesToTeam(teamId: string): Promise<{ error?: string }> {
  try {
    const ctx = await requireOperatorFull()
    if (ctx.profile.role !== 'admin') throw new Error('Solo admin')
    const admin = createAdminClient()

    const { data: globals } = await admin
      .from('cobranza_stages')
      .select('name, description, days_before, send_email, send_whatsapp, email_template_id, whatsapp_template_id, sort_order')
      .is('team_id', null)
      .order('sort_order')

    if (!globals || globals.length === 0) return {}

    await admin.from('cobranza_stages').delete().eq('team_id', teamId)
    await admin.from('cobranza_stages').insert(
      (globals as Record<string, unknown>[]).map(s => ({ ...s, team_id: teamId, is_active: true })),
    )

    void admin.from('audit_events').insert({
      actor_id:    ctx.user.id,
      action:      'config.create',
      entity_type: 'cobranza_stages',
      payload:     { area: 'cobranza', team_id: teamId, name: 'Personalizar: copiar stages globales al equipo' },
    })

    revalidatePath('/admin/cobranza')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function createCobranzaStage(
  teamId: string | null,
  input: {
    name:                 string
    description?:         string
    days_before?:         number | null
    send_email?:          boolean
    send_whatsapp?:       boolean
    email_template_id?:   string | null
    whatsapp_template_id?: string | null
    sort_order:           number
  },
): Promise<{ error?: string }> {
  try {
    const ctx = await requireOperatorFull()
    if (ctx.profile.role !== 'admin') throw new Error('Solo admin')
    const admin = createAdminClient()
    const { error } = await admin.from('cobranza_stages').insert({
      name:                 input.name,
      description:          input.description ?? null,
      days_before:          input.days_before ?? null,
      send_email:           input.send_email ?? false,
      send_whatsapp:        input.send_whatsapp ?? false,
      email_template_id:    input.email_template_id ?? null,
      whatsapp_template_id: input.whatsapp_template_id ?? null,
      sort_order:           input.sort_order,
      team_id:              teamId,
    })
    if (error) return { error: error.message }

    void admin.from('audit_events').insert({
      actor_id:    ctx.user.id,
      action:      'config.create',
      entity_type: 'cobranza_stages',
      payload:     { area: 'cobranza', team_id: teamId, name: input.name, data: input },
    })

    revalidatePath('/admin/cobranza')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateCobranzaStage(
  id:    string,
  input: Partial<{
    name:                              string
    description:                       string | null
    days_before:                       number | null
    send_email:                        boolean
    send_whatsapp:                     boolean
    email_template_id:                 string | null
    whatsapp_template_id:              string | null
    email_template_domiciliado_id:     string | null
    whatsapp_template_domiciliado_id:  string | null
    sort_order:                        number
    is_active:                         boolean
  }>,
): Promise<{ error?: string }> {
  try {
    const ctx = await requireOperatorFull()
    if (ctx.profile.role !== 'admin') throw new Error('Solo admin')
    const admin = createAdminClient()
    const { error } = await admin.from('cobranza_stages').update(input).eq('id', id)
    if (error) return { error: error.message }

    void admin.from('audit_events').insert({
      actor_id:    ctx.user.id,
      action:      'config.update',
      entity_type: 'cobranza_stages',
      payload:     { area: 'cobranza', stage_id: id, data: input },
    })

    revalidatePath('/admin/cobranza')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function deleteCobranzaStage(id: string): Promise<{ error?: string }> {
  try {
    const ctx = await requireOperatorFull()
    if (ctx.profile.role !== 'admin') throw new Error('Solo admin')
    const admin = createAdminClient()
    await admin.from('policy_receipts').update({ current_stage_id: null }).eq('current_stage_id', id)
    const { error } = await admin.from('cobranza_stages').delete().eq('id', id)
    if (error) return { error: error.message }

    void admin.from('audit_events').insert({
      actor_id:    ctx.user.id,
      action:      'config.delete',
      entity_type: 'cobranza_stages',
      payload:     { area: 'cobranza', stage_id: id },
    })

    revalidatePath('/admin/cobranza')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function reorderCobranzaStages(ids: string[]): Promise<{ error?: string }> {
  try {
    await requireAdminOps()
    const admin = createAdminClient()
    await Promise.all(
      ids.map((id, idx) =>
        admin.from('cobranza_stages').update({ sort_order: idx + 1 }).eq('id', id)
      )
    )
    revalidatePath('/admin/cobranza')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── Semáforo settings ────────────────────────────────────────

export async function getSemaforoSettings(): Promise<{ red: number; yellow: number }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['cobranza_semaforo_red', 'cobranza_semaforo_yellow'])

  const map = Object.fromEntries(
    (data ?? []).map((s: { key: string; value: string | null }) => [s.key, s.value])
  )
  return {
    red:    parseInt(map['cobranza_semaforo_red']    ?? '3', 10),
    yellow: parseInt(map['cobranza_semaforo_yellow'] ?? '1', 10),
  }
}

export async function saveSemaforoSettings(red: number, yellow: number): Promise<{ error?: string }> {
  try {
    await requireAdminOps()
    const admin = createAdminClient()
    await Promise.all([
      admin.from('app_settings').upsert({ key: 'cobranza_semaforo_red',    value: String(red)    }),
      admin.from('app_settings').upsert({ key: 'cobranza_semaforo_yellow', value: String(yellow) }),
    ])
    revalidatePath('/cobranza')
    revalidatePath('/admin/cobranza')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── Per-card Send Preview ─────────────────────────────────────

export interface ReceiptSendPreview {
  nextStageId:   string
  nextStageName: string
  hasEmail:      boolean
  hasWhatsApp:   boolean
  recipientName: string
  accountName:   string
  email?:    { to: string; subject: string; body: string }
  whatsapp?: { to: string; body: string }
}

/** Renders the next-stage template for a single receipt and returns preview data. */
export async function getReceiptNextStagePreview(
  receiptId: string,
): Promise<ReceiptSendPreview | { error: string }> {
  try {
    const { profile } = await requireOperatorFull()
    const admin = createAdminClient()

    // Load receipt + tomador contact + account team
    const { data: receipt } = await admin
      .from('policy_receipts')
      .select(`
        id, amount, due_date, current_stage_id,
        policies!policy_id (
          policy_number, insurer, branch, start_date, premium, end_date, conducto_cobro,
          contacts!tomador_id (full_name, email, phone)
        ),
        accounts!account_id (id, name, team_id),
        cobranza_stages!current_stage_id (sort_order)
      `)
      .eq('id', receiptId)
      .single()

    if (!receipt) return { error: 'Recibo no encontrado' }

    const policy  = (Array.isArray(receipt.policies)         ? receipt.policies[0]         : receipt.policies)  as Record<string, unknown> | null
    const account = (Array.isArray(receipt.accounts)         ? receipt.accounts[0]         : receipt.accounts)  as Record<string, unknown> | null
    const stageD  = (Array.isArray(receipt.cobranza_stages)  ? receipt.cobranza_stages[0]  : receipt.cobranza_stages) as { sort_order: number } | null
    const tomador = policy
      ? ((Array.isArray(policy.contacts) ? policy.contacts[0] : policy.contacts) as { full_name: string; email: string | null; phone: string | null } | null)
      : null

    const teamId      = (account?.team_id as string | null) ?? null
    const currentSort = stageD?.sort_order ?? -1

    type NextStage = {
      id: string; name: string
      send_email: boolean; send_whatsapp: boolean
      email_template_id: string | null; whatsapp_template_id: string | null
      email_template_domiciliado_id: string | null; whatsapp_template_domiciliado_id: string | null
    }

    let nextStage: NextStage | null = null

    const stageSelect = 'id, name, send_email, send_whatsapp, email_template_id, whatsapp_template_id, email_template_domiciliado_id, whatsapp_template_domiciliado_id'

    if (teamId) {
      const { data } = await admin
        .from('cobranza_stages')
        .select(stageSelect)
        .eq('team_id', teamId)
        .eq('is_active', true)
        .gt('sort_order', currentSort)
        .order('sort_order')
        .limit(1)
        .maybeSingle()
      nextStage = data as NextStage | null
    }

    if (!nextStage) {
      const { data } = await admin
        .from('cobranza_stages')
        .select(stageSelect)
        .is('team_id', null)
        .eq('is_active', true)
        .gt('sort_order', currentSort)
        .order('sort_order')
        .limit(1)
        .maybeSingle()
      nextStage = data as NextStage | null
    }

    if (!nextStage) return { error: 'Ya está en la última etapa de cobranza' }

    // Conducto-based template selection
    const conducto = (policy?.conducto_cobro as string | null) ?? ''
    const isDomiciliado = conducto.toUpperCase().includes('DOMICILIAD')
    const emailTplId = isDomiciliado && nextStage.email_template_domiciliado_id
      ? nextStage.email_template_domiciliado_id : nextStage.email_template_id
    const waTplId = isDomiciliado && nextStage.whatsapp_template_domiciliado_id
      ? nextStage.whatsapp_template_domiciliado_id : nextStage.whatsapp_template_id

    const vars: CollectionVars = {
      nombre:           tomador?.full_name ?? 'Cliente',
      monto:            formatMXN(receipt.amount ?? (policy?.premium as number | null)),
      numero_poliza:    (policy?.policy_number as string | null) ?? 'S/N',
      aseguradora:      (policy?.insurer as string) ?? '—',
      vencimiento:      formatDate(receipt.due_date),
      cuenta:           (account?.name as string) ?? '—',
      ejecutivo:        profile.full_name ?? 'Ejecutivo',
      fecha_hoy:        formatDate(new Date().toISOString()),
      // Campos extendidos
      ramo:             BRANCH_LABELS[(policy?.branch as string | null) ?? ''] ?? '',
      inicio_vigencia:  formatDate((policy?.start_date as string | null)),
      dias_vencimiento: calcDaysUntil(receipt.due_date),
      telefono_cliente: tomador?.phone ?? '',
      email_cliente:    tomador?.email ?? '',
      conducto:         conducto,
    }

    const preview: ReceiptSendPreview = {
      nextStageId:   nextStage.id,
      nextStageName: nextStage.name as string,
      hasEmail:      !!(nextStage.send_email && emailTplId && tomador?.email),
      hasWhatsApp:   !!(nextStage.send_whatsapp && waTplId && tomador?.phone),
      recipientName: tomador?.full_name ?? '—',
      accountName:   (account?.name as string) ?? '—',
    }

    if (preview.hasEmail && emailTplId) {
      const { data: tmpl } = await admin
        .from('collection_templates')
        .select('subject_email, body_email')
        .eq('id', emailTplId)
        .single()
      if (tmpl?.body_email) {
        preview.email = {
          to:      tomador!.email!,
          subject: tmpl.subject_email
            ? renderTemplate(tmpl.subject_email, vars)
            : `Aviso de cobranza — ${vars.numero_poliza}`,
          body: renderTemplate(tmpl.body_email, vars),
        }
      } else {
        preview.hasEmail = false
      }
    }

    if (preview.hasWhatsApp && waTplId) {
      const { data: tmpl } = await admin
        .from('collection_templates')
        .select('body_whatsapp')
        .eq('id', waTplId)
        .single()
      if (tmpl?.body_whatsapp) {
        preview.whatsapp = {
          to:   tomador!.phone!,
          body: renderTemplate(tmpl.body_whatsapp, vars),
        }
      } else {
        preview.hasWhatsApp = false
      }
    }

    return preview
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Sends email/WhatsApp with custom content and advances the receipt to the next stage. */
export async function sendAndAdvanceStage(
  receiptId: string,
  send: {
    email?:    { to: string; subject: string; body: string }
    whatsapp?: { to: string; body: string }
  },
): Promise<{ stageId: string; stageName: string } | { error: string }> {
  try {
    const { user } = await requireOperatorFull()
    const admin = createAdminClient()

    // Get receipt current stage + account team + policy conducto
    const { data: receipt } = await admin
      .from('policy_receipts')
      .select(`
        policy_id, account_id, current_stage_id,
        policies!policy_id (conducto_cobro),
        accounts!account_id (team_id),
        cobranza_stages!current_stage_id (sort_order)
      `)
      .eq('id', receiptId)
      .single()

    if (!receipt) return { error: 'Recibo no encontrado' }

    const accountArr  = Array.isArray(receipt.accounts)        ? receipt.accounts[0]        : receipt.accounts
    const stageArr    = Array.isArray(receipt.cobranza_stages) ? receipt.cobranza_stages[0] : receipt.cobranza_stages
    const policyArr   = Array.isArray(receipt.policies)        ? receipt.policies[0]        : receipt.policies
    const teamId      = (accountArr as { team_id: string | null } | null)?.team_id ?? null
    const currentSort = (stageArr as { sort_order: number } | null)?.sort_order ?? -1
    const conducto    = ((policyArr as { conducto_cobro: string | null } | null)?.conducto_cobro ?? '').toUpperCase()
    const isDomiciliado = conducto.includes('DOMICILIAD')

    // Find next stage (with domiciliado template IDs)
    const sndStageSelect = 'id, name, email_template_domiciliado_id, whatsapp_template_domiciliado_id'
    let nextStageId:   string | null = null
    let nextStageName: string | null = null
    let emailTplDomId: string | null = null
    let waTplDomId:    string | null = null

    if (teamId) {
      const { data: ts } = await admin
        .from('cobranza_stages').select(sndStageSelect)
        .eq('team_id', teamId).eq('is_active', true)
        .gt('sort_order', currentSort).order('sort_order').limit(1).maybeSingle()
      if (ts) {
        nextStageId = ts.id; nextStageName = ts.name as string
        emailTplDomId = (ts as Record<string, unknown>).email_template_domiciliado_id as string | null
        waTplDomId    = (ts as Record<string, unknown>).whatsapp_template_domiciliado_id as string | null
      }
    }

    if (!nextStageId) {
      const { data: gs } = await admin
        .from('cobranza_stages').select(sndStageSelect)
        .is('team_id', null).eq('is_active', true)
        .gt('sort_order', currentSort).order('sort_order').limit(1).maybeSingle()
      if (gs) {
        nextStageId = gs.id; nextStageName = gs.name as string
        emailTplDomId = (gs as Record<string, unknown>).email_template_domiciliado_id as string | null
        waTplDomId    = (gs as Record<string, unknown>).whatsapp_template_domiciliado_id as string | null
      }
    }

    if (!nextStageId) return { error: 'Ya está en la última etapa de cobranza' }

    // Pick domiciliado overrides if applicable (already resolved from client preview, no re-fetch needed)
    // Log which template variant was used via template_name suffix
    const templateNameSuffix = isDomiciliado && (emailTplDomId || waTplDomId) ? ' (domiciliado)' : ''
    void templateNameSuffix // used below in collection_sends

    const channelsSent: string[] = []

    // Send email
    if (send.email) {
      try {
        const cc = await getEmailCcList(false, teamId ?? undefined)
        await resend.emails.send({
          from:    EMAIL_FROM,
          to:      send.email.to,
          subject: send.email.subject,
          text:    send.email.body,
          ...(cc.length ? { cc } : {}),
        })
        channelsSent.push('email')
      } catch { /* non-blocking */ }
    }

    // Send WhatsApp
    if (send.whatsapp) {
      try {
        const ok = await sendWhatsApp(send.whatsapp.to, send.whatsapp.body)
        if (ok) channelsSent.push('whatsapp')
      } catch { /* non-blocking */ }
    }

    // Record collection_sends if something was sent
    if (channelsSent.length > 0) {
      await admin.from('collection_sends').insert({
        policy_id:     receipt.policy_id,
        account_id:    receipt.account_id,
        channel:       channelsSent.join('+'),
        sent_to_email: send.email?.to ?? null,
        sent_to_phone: send.whatsapp?.to ?? null,
        sent_by:       user.id,
        receipt_id:    receiptId,
        template_name: `${nextStageName ?? ''}${templateNameSuffix}`,
      })

      await admin.from('receipt_events').insert({
        receipt_id: receiptId,
        action:     'notice_sent',
        stage_id:   receipt.current_stage_id,
        actor_id:   user.id,
        metadata:   { channels: channelsSent },
      })
    }

    // Advance stage
    await admin
      .from('policy_receipts')
      .update({ current_stage_id: nextStageId })
      .eq('id', receiptId)

    await admin.from('receipt_events').insert({
      receipt_id: receiptId,
      action:     'stage_advanced',
      stage_id:   nextStageId,
      actor_id:   user.id,
    })

    revalidatePath('/cobranza')
    return { stageId: nextStageId, stageName: nextStageName! }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── Year Chart Data ──────────────────────────────────────────

export interface CobranzaYearMonth {
  month:  string  // 'YYYY-MM'
  count:  number
  amount: number
}

export async function getCobranzaYearChart(): Promise<CobranzaYearMonth[]> {
  const { user, profile } = await requireOperatorFull()
  const admin  = createAdminClient()
  const year   = new Date().getFullYear()

  let accountIds: string[] | null = null
  if (!['admin', 'ops'].includes(profile.role)) {
    let q = admin.from('accounts').select('id')
    if (profile.role === 'manager' && profile.team_id) {
      q = q.eq('team_id', profile.team_id)
    } else {
      q = q.eq('assigned_to', user.id)
    }
    const { data: accts } = await q
    accountIds = (accts ?? []).map((a: { id: string }) => a.id)
  }

  let query = admin
    .from('policy_receipts')
    .select('due_date, amount')
    .in('status', ['pending', 'overdue'])
    .gte('due_date', `${year}-01-01`)
    .lte('due_date', `${year}-12-31`)

  if (accountIds) query = query.in('account_id', accountIds)

  const { data } = await query

  return Array.from({ length: 12 }, (_, i) => {
    const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`
    const rows     = (data ?? []).filter(r => (r.due_date as string).startsWith(monthStr))
    return {
      month:  monthStr,
      count:  rows.length,
      amount: rows.reduce((s, r) => s + ((r.amount as number) ?? 0), 0),
    }
  })
}

// ─── Receipts for a specific month ───────────────────────────

export async function getReceiptsForMonth(
  yearMonth: string,
): Promise<{ pending: ReceiptWithContext[]; paid: ReceiptWithContext[] }> {
  const { user, profile } = await requireOperatorFull()
  const admin    = createAdminClient()
  const today    = new Date()
  const [y, mo]  = yearMonth.split('-').map(Number)
  const monthStart = `${yearMonth}-01`
  const monthEnd   = toDateStr(new Date(y, mo, 0))

  let accountIds: string[] | null = null
  if (!['admin', 'ops'].includes(profile.role)) {
    let q = admin.from('accounts').select('id')
    if (profile.role === 'manager' && profile.team_id) {
      q = q.eq('team_id', profile.team_id)
    } else {
      q = q.eq('assigned_to', user.id)
    }
    const { data: accts } = await q
    accountIds = (accts ?? []).map((a: { id: string }) => a.id)
    if (accountIds.length === 0) return { pending: [], paid: [] }
  }

  const SEL = `
    id, policy_id, account_id, receipt_number, due_date, amount,
    status, current_stage_id, paid_at, collected_by, notes, created_by, created_at, updated_at,
    policies!policy_id (policy_number, insurer, branch, conducto_cobro),
    accounts!account_id (name, account_code),
    cobranza_stages!current_stage_id (name, sort_order),
    collector:profiles!collected_by (full_name)
  `

  let pendQ = admin.from('policy_receipts').select(SEL)
    .in('status', ['pending', 'overdue'])
    .gte('due_date', monthStart).lte('due_date', monthEnd).order('due_date')

  let paidQ = admin.from('policy_receipts').select(SEL)
    .eq('status', 'paid')
    .gte('due_date', monthStart).lte('due_date', monthEnd)
    .order('paid_at', { ascending: false }).limit(50)

  if (accountIds) { pendQ = pendQ.in('account_id', accountIds); paidQ = paidQ.in('account_id', accountIds) }

  const [pendRes, pRes] = await Promise.all([pendQ, paidQ])

  function norm(rows: Record<string, unknown>[]): ReceiptWithContext[] {
    return rows.map(r => {
      const pol  = (Array.isArray(r.policies)        ? r.policies[0]        : r.policies)        as Record<string, unknown> | null
      const acct = (Array.isArray(r.accounts)        ? r.accounts[0]        : r.accounts)        as Record<string, unknown> | null
      const stg  = (Array.isArray(r.cobranza_stages) ? r.cobranza_stages[0] : r.cobranza_stages) as Record<string, unknown> | null
      const col  = (Array.isArray(r.collector)       ? r.collector[0]       : r.collector)       as Record<string, unknown> | null
      const due  = new Date(r.due_date as string)
      return {
        id: r.id as string, policy_id: r.policy_id as string, account_id: r.account_id as string,
        receipt_number: (r.receipt_number as string | null) ?? null,
        due_date: r.due_date as string, amount: (r.amount as number | null) ?? null,
        status: r.status as ReceiptWithContext['status'],
        current_stage_id: (r.current_stage_id as string | null) ?? null,
        paid_at: (r.paid_at as string | null) ?? null, collected_by: (r.collected_by as string | null) ?? null,
        notes: (r.notes as string | null) ?? null, created_by: r.created_by as string,
        created_at: r.created_at as string, updated_at: r.updated_at as string,
        policy_number: (pol?.policy_number  as string | null) ?? null,
        insurer:       (pol?.insurer        as string | null) ?? null,
        branch:        (pol?.branch         as string | null) ?? null,
        conducto_cobro:(pol?.conducto_cobro as string | null) ?? null,
        account_name:  (acct?.name          as string)        ?? '—',
        account_code:  (acct?.account_code  as string)        ?? '',
        stage_name:    (stg?.name           as string | null) ?? null,
        stage_sort:    (stg?.sort_order     as number | null) ?? null,
        collector_name:(col?.full_name      as string | null) ?? null,
        days_until_due: Math.ceil((due.getTime() - today.getTime()) / 86400000),
      }
    })
  }

  return {
    pending: norm((pendRes.data ?? []) as Record<string, unknown>[]),
    paid:    norm((pRes.data   ?? []) as Record<string, unknown>[]),
  }
}

// ─── Bulk Mark Paid ───────────────────────────────────────────

export async function bulkMarkPaid(
  receiptIds: string[],
): Promise<{ success: number; errors: string[] }> {
  if (receiptIds.length === 0) return { success: 0, errors: [] }
  const { user } = await requireOperatorFull()
  const admin    = createAdminClient()
  const now      = new Date().toISOString()

  const { error: updErr } = await admin
    .from('policy_receipts')
    .update({ status: 'paid', paid_at: now, collected_by: user.id })
    .in('id', receiptIds)

  if (updErr) return { success: 0, errors: [updErr.message] }

  await admin.from('receipt_events').insert(
    receiptIds.map(id => ({ receipt_id: id, action: 'paid', actor_id: user.id, notes: 'Cobro masivo' }))
  )

  revalidatePath('/cobranza')
  return { success: receiptIds.length, errors: [] }
}
