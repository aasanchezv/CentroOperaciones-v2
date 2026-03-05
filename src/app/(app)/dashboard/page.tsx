import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { AdminDashboard }    from './admin-dashboard'
import { AgentDashboard }    from './agent-dashboard'

// ── helpers ───────────────────────────────────────────────────────────────────

function calcPeriodos() {
  const now = new Date()

  // Mes
  const mesStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),     1))
  const mesEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) // exclusive

  // Trimestre
  const q        = Math.floor(now.getUTCMonth() / 3)
  const triStart = new Date(Date.UTC(now.getUTCFullYear(), q * 3,         1))
  const triEnd   = new Date(Date.UTC(now.getUTCFullYear(), q * 3 + 3,     1)) // exclusive

  // Año
  const anoStart = new Date(Date.UTC(now.getUTCFullYear(),     0, 1))
  const anoEnd   = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)) // exclusive

  const toDate = (d: Date) => d.toISOString().split('T')[0]
  const lastDay = (excl: Date) => toDate(new Date(excl.getTime() - 86_400_000))

  return {
    mes: {
      startDate: toDate(mesStart),
      endDate:   lastDay(mesEnd),
      startISO:  mesStart.toISOString(),
      endISO:    mesEnd.toISOString(),
    },
    tri: {
      startDate: toDate(triStart),
      endDate:   lastDay(triEnd),
      startISO:  triStart.toISOString(),
      endISO:    triEnd.toISOString(),
    },
    ano: {
      startDate: toDate(anoStart),
      endDate:   lastDay(anoEnd),
      startISO:  anoStart.toISOString(),
      endISO:    anoEnd.toISOString(),
    },
  }
}

function sumPremium(data: { premium: number | null }[] | null | undefined): number {
  return (data ?? []).reduce((acc, r) => acc + (r.premium ?? 0), 0)
}

function sumRenewalPremium(data: unknown[] | null | undefined): number {
  return (data ?? []).reduce<number>((acc, r) => {
    const policy = (r as { new_policy: { premium: number | null } | null }).new_policy
    return acc + (policy?.premium ?? 0)
  }, 0)
}

// ── page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, team_id')
    .eq('id', user.id)
    .single()

  const role      = profile?.role ?? 'readonly'
  const firstName = profile?.full_name?.split(' ')[0] ?? null

  // ── Agente / Manager ─────────────────────────────────────────────────────
  if (['agent', 'manager'].includes(role)) {
    const admin = createAdminClient()
    const p     = calcPeriodos()

    // 1ª ronda: skills + cotizaciones + cuentas del agente
    const [
      teamSkillsRes,
      quotationsPendingRes,
      agentAccountsRes,
    ] = await Promise.all([
      profile?.team_id
        ? supabase
            .from('team_skills')
            .select('module_id')
            .eq('team_id', profile.team_id)
        : Promise.resolve({ data: [] as { module_id: string }[], error: null }),

      supabase
        .from('quotations')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .in('status', ['pendiente', 'enviada']),

      // Cuentas asignadas al agente → para calcular la meta por periodo
      admin
        .from('accounts')
        .select('id')
        .eq('assigned_to', user.id),
    ])

    const acctIds = (agentAccountsRes.data ?? []).map((a: { id: string }) => a.id)

    // Fechas para filtros
    const todayStr    = new Date().toISOString().split('T')[0]
    const in90Days    = new Date(Date.now() + 90 * 86_400_000)
    const in90DaysStr = in90Days.toISOString().split('T')[0]

    // Meta: suma de primas de pólizas que vencen en el rango
    const metaQ = (startDate: string, endDate: string) =>
      acctIds.length > 0
        ? admin
            .from('policies')
            .select('premium')
            .in('account_id', acctIds)
            .gte('end_date', startDate)
            .lte('end_date', endDate)
            .neq('status', 'cancelled')
        : Promise.resolve({ data: [] as { premium: number | null }[] })

    // Cobrado: suma de primas de renovaciones pagadas en el rango
    const cobradoQ = (startISO: string, endISO: string) =>
      admin
        .from('renewals')
        .select('new_policy:policies!renewals_new_policy_id_fkey(premium)')
        .eq('assigned_to', user.id)
        .eq('status', 'renewed_paid')
        .gte('updated_at', startISO)
        .lt('updated_at', endISO)

    // 2ª ronda: meta + cobrado + pólizas próximas a vencer + recibos pendientes
    const [
      metaMesRes, metaTriRes, metaAnoRes,
      cobradoMesRes, cobradoTriRes, cobradoAnoRes,
      nearPoliciesRes,
      pendingReceiptsRes,
    ] = await Promise.all([
      metaQ(p.mes.startDate, p.mes.endDate),
      metaQ(p.tri.startDate, p.tri.endDate),
      metaQ(p.ano.startDate, p.ano.endDate),
      cobradoQ(p.mes.startISO, p.mes.endISO),
      cobradoQ(p.tri.startISO, p.tri.endISO),
      cobradoQ(p.ano.startISO, p.ano.endISO),
      // Pólizas que vencen en los próximos 3 meses
      acctIds.length > 0
        ? admin
            .from('policies')
            .select('id')
            .in('account_id', acctIds)
            .gte('end_date', todayStr)
            .lte('end_date', in90DaysStr)
            .neq('status', 'cancelled')
        : Promise.resolve({ data: [] as { id: string }[] }),
      // Recibos pendientes/vencidos sin cobrar
      acctIds.length > 0
        ? admin
            .from('policy_receipts')
            .select('id', { count: 'exact', head: true })
            .in('account_id', acctIds)
            .in('status', ['pending', 'overdue'])
        : Promise.resolve({ count: 0, data: null, error: null }),
    ])

    const nearPolicyIds = ((nearPoliciesRes as { data: { id: string }[] | null }).data ?? []).map(pol => pol.id)

    // 3ª ronda: renovaciones activas para pólizas que vencen en los próximos 3 meses
    const renewalsPendingRes = nearPolicyIds.length > 0
      ? await admin
          .from('renewals')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .eq('status', 'in_progress')
          .in('policy_id', nearPolicyIds)
      : { count: 0 }

    const pendingReceiptsCount = (pendingReceiptsRes as { count: number | null }).count ?? 0

    return (
      <AgentDashboard
        firstName={firstName}
        teamSkills={(teamSkillsRes.data ?? []).map((r) => r.module_id)}
        renewalsPending={renewalsPendingRes.count ?? 0}
        pendingReceipts={pendingReceiptsCount}
        quotationsPending={quotationsPendingRes.count ?? 0}
        ingresosPorPeriodo={{
          mes:       { meta: sumPremium(metaMesRes.data), cobrado: sumRenewalPremium(cobradoMesRes.data) },
          trimestre: { meta: sumPremium(metaTriRes.data), cobrado: sumRenewalPremium(cobradoTriRes.data) },
          anio:      { meta: sumPremium(metaAnoRes.data), cobrado: sumRenewalPremium(cobradoAnoRes.data) },
        }}
      />
    )
  }

  // ── Admin / Ops (dashboard de sistema) ───────────────────────────────────
  const hour     = new Date().getHours()
  const greeting = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  const [
    { count: totalUsers },
    { count: activeUsers },
    { count: totalTeams },
    { count: totalAccounts },
    { data: recentActivity },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('teams').select('*',    { count: 'exact', head: true }),
    supabase.from('accounts').select('*', { count: 'exact', head: true }),
    createAdminClient()
      .from('audit_events')
      .select('id, action, entity_type, entity_id, payload, created_at, profiles!actor_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <AdminDashboard
        totalUsers={totalUsers ?? 0}
        activeUsers={activeUsers ?? 0}
        totalTeams={totalTeams ?? 0}
        totalAccounts={totalAccounts ?? 0}
        recentActivity={
          (recentActivity ?? []) as Parameters<typeof AdminDashboard>[0]['recentActivity']
        }
      />
    </div>
  )
}
