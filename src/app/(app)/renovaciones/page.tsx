import { createClient }         from '@/lib/supabase/server'
import { createAdminClient }    from '@/lib/supabase/admin'
import { redirect }             from 'next/navigation'
import { getSemaphoreSettings } from '@/app/actions/renewal-actions'
import { RenovacionesPanel }    from './renovaciones-panel'
import type { RenewalListProps } from './renewal-list'

export default async function RenovacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  const admin        = createAdminClient()
  const todayStr     = new Date().toISOString().split('T')[0]
  const currentYear  = new Date().getFullYear()

  // Ventana de candidates: -30 días (vencidas recientes) hasta +90 días
  const overdueStart = new Date()
  overdueStart.setDate(overdueStart.getDate() - 30)
  const overdueStartStr = overdueStart.toISOString().split('T')[0]

  const cutoff    = new Date()
  cutoff.setDate(cutoff.getDate() + 90)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Cargar todo en paralelo
  const [renewalsRes, candidatesRes, stagesRes, semaphore, templatesRes, yearPoliciesRes] = await Promise.all([
    admin
      .from('renewals')
      .select(`
        id, status, client_confirmed_at, call_attempts, created_at, updated_at,
        assigned_to,
        current_stage_id,
        policy:policies!renewals_policy_id_fkey(
          id, policy_number, insurer, branch, start_date, end_date, premium,
          tomador:contacts!policies_tomador_id_fkey(id, full_name, email, phone)
        ),
        account:accounts!renewals_account_id_fkey(
          id, name, account_code,
          contacts:contacts!contacts_account_id_fkey(id, full_name, email)
        ),
        assigned_profile:profiles!renewals_assigned_to_fkey(id, full_name, email),
        stage:renewal_stages!renewals_current_stage_id_fkey(id, name, sort_order, email_template_id)
      `)
      .order('updated_at', { ascending: false })
      .limit(500),

    admin
      .from('policies')
      .select(`
        id, policy_number, insurer, branch, end_date, premium, account_id,
        account:accounts!policies_account_id_fkey(id, name, account_code, type),
        tomador:contacts!policies_tomador_id_fkey(id, full_name)
      `)
      .eq('status', 'active')
      .lte('end_date', cutoffStr)
      .gte('end_date', overdueStartStr)
      .order('end_date', { ascending: true })
      .limit(500),

    admin
      .from('renewal_stages')
      .select('id, name, sort_order, send_email, send_whatsapp, email_template_id, whatsapp_template_id')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),

    getSemaphoreSettings(),

    admin
      .from('collection_templates')
      .select('id, name, subject_email, body_email, body_whatsapp')
      .eq('type', 'renovacion')
      .eq('is_active', true)
      .order('name'),

    // Year chart: all active policies expiring this year
    admin
      .from('policies')
      .select('end_date')
      .eq('status', 'active')
      .gte('end_date', `${currentYear}-01-01`)
      .lte('end_date', `${currentYear}-12-31`),
  ])

  const renewals = renewalsRes.data ?? []

  // Filtrar candidatos: solo persona_fisica sin renovación activa
  const activeRenewalPolicyIds = new Set(
    renewals
      .filter(r => r.status === 'in_progress')
      .map(r => {
        const pol = r.policy as unknown as { id: string } | { id: string }[] | null
        return Array.isArray(pol) ? pol[0]?.id : pol?.id
      })
      .filter(Boolean)
  )

  const candidates = (candidatesRes.data ?? []).filter(p => {
    const acct = Array.isArray(p.account) ? p.account[0] : p.account
    return acct?.type === 'persona_fisica' && !activeRenewalPolicyIds.has(p.id)
  })

  // ── KPI data ────────────────────────────────────────────────
  const now       = new Date()
  const thisYear  = now.getFullYear()
  const thisMonth = now.getMonth()

  function getEndDateStr(r: typeof renewals[number]): string | null {
    const pol = Array.isArray(r.policy)
      ? r.policy[0] as unknown as { end_date: string | null }
      : r.policy as unknown as { end_date: string | null } | null
    return pol?.end_date ?? null
  }

  const pendientesEsteMes = renewals.filter(r => {
    if (r.status !== 'in_progress') return false
    const end = new Date(getEndDateStr(r) ?? '')
    return end.getFullYear() === thisYear && end.getMonth() === thisMonth
  }).length

  const primaPendiente = renewals
    .filter(r => r.status === 'in_progress' || r.status === 'renewed_pending_payment')
    .reduce((sum, r) => {
      const pol = Array.isArray(r.policy)
        ? r.policy[0] as unknown as { premium: number | null }
        : r.policy as unknown as { premium: number | null } | null
      return sum + (pol?.premium ?? 0)
    }, 0)

  const in7Days    = new Date(now)
  in7Days.setDate(in7Days.getDate() + 7)
  const in7DaysStr = in7Days.toISOString().split('T')[0]

  const proximas7Dias = renewals.filter(r => {
    if (r.status !== 'in_progress') return false
    const end = getEndDateStr(r)
    return !!end && end >= todayStr && end <= in7DaysStr
  }).length

  const renovadasEsteMes = renewals.filter(r => {
    const end = new Date(getEndDateStr(r) ?? '')
    return (r.status === 'renewed_paid' || r.status === 'renewed_pending_payment')
      && end.getFullYear() === thisYear && end.getMonth() === thisMonth
  }).length

  const totalEsteMes = pendientesEsteMes + renovadasEsteMes
  const pctRenovado  = totalEsteMes > 0 ? (renovadasEsteMes / totalEsteMes) * 100 : 0

  // ── Year chart data ─────────────────────────────────────────
  const yearData = Array.from({ length: 12 }, (_, i) => {
    const monthStr = `${currentYear}-${String(i + 1).padStart(2, '0')}`
    const count    = (yearPoliciesRes.data ?? []).filter(p => (p.end_date as string).startsWith(monthStr)).length
    return { month: monthStr, count }
  })

  const listProps: RenewalListProps = {
    renewals:         renewals      as unknown as RenewalListProps['renewals'],
    candidates:       candidates    as unknown as RenewalListProps['candidates'],
    stages:           (stagesRes.data ?? []) as unknown as RenewalListProps['stages'],
    currentUserId:    user.id,
    currentUserEmail: user.email ?? null,
    templates:        (templatesRes.data ?? []) as unknown as RenewalListProps['templates'],
  }

  return (
    <div className="p-6 space-y-6 max-w-full">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Renovaciones</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Pipeline de renovación de pólizas individuales
        </p>
      </div>

      <RenovacionesPanel
        pendientesEsteMes={pendientesEsteMes}
        primaPendiente={primaPendiente}
        proximas7Dias={proximas7Dias}
        pctRenovado={pctRenovado}
        semaphore={semaphore}
        listProps={listProps}
        yearData={yearData}
      />
    </div>
  )
}
