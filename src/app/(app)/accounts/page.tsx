import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { NewAccountDialog } from './new-account-dialog'
import { AccountsSearch } from './accounts-search'
import { AccountsTypeTabs } from './accounts-type-tabs'
import { AccountsList } from './accounts-list'
import { Building2, Users, FileCheck } from 'lucide-react'

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>
}) {
  const { q, status, type } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Datos en paralelo (incluye rol del usuario para permisos de eliminación)
  const [
    { data: allAccounts },
    { data: teams },
    { data: agents },
    { count: activePoliciesCount },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, account_code, name, type, status, team_id, assigned_to, updated_at, teams(name), profiles!assigned_to(full_name, email)')
      .eq('is_merged', false)
      .order('created_at', { ascending: false }),
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name, email').eq('is_active', true)
      .in('role', ['admin', 'ops', 'manager', 'agent']).order('full_name'),
    supabase.from('policies').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ])

  // Solo admin/ops pueden eliminar cuentas; solo admin puede fusionar
  const canDelete = ['admin', 'ops'].includes(profile?.role ?? '')
  const canMerge  = profile?.role === 'admin'

  // Filtrado local
  const accounts = (allAccounts ?? []).filter(a => {
    const matchQ      = !q      || a.name.toLowerCase().includes(q.toLowerCase()) || a.account_code.toLowerCase().includes(q.toLowerCase())
    const matchStatus = !status || a.status === status
    const matchType   = !type   || a.type === type
    return matchQ && matchStatus && matchType
  })

  // Stats globales (no filtradas por tab de tipo)
  const all          = allAccounts ?? []
  const individuales = all.filter(a => a.type === 'persona_fisica').length
  const corporativas = all.filter(a => a.type === 'empresa').length
  const prospects    = all.filter(a => a.status === 'prospect').length
  const totalLabel   = individuales === 0 && corporativas === 0
    ? 'sin cuentas'
    : `${individuales} individual${individuales !== 1 ? 'es' : ''} · ${corporativas} corporativa${corporativas !== 1 ? 's' : ''}`

  const typeTitle = type === 'empresa' ? 'Clientes corporativos'
                  : type === 'persona_fisica' ? 'Clientes individuales'
                  : 'Clientes'

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{typeTitle}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{totalLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Suspense>
              <AccountsSearch defaultQ={q} defaultStatus={status} />
            </Suspense>
            <NewAccountDialog teams={teams ?? []} agents={agents ?? []} />
          </div>
        </div>
        {/* Tabs tipo */}
        <Suspense>
          <AccountsTypeTabs defaultType={type} />
        </Suspense>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {/* KPI 1: Total clientes (individuales + corporativos) */}
        <div className="rounded-xl border bg-white px-4 py-3 shadow-sm flex items-center gap-3">
          <div className="text-slate-500"><Building2 className="h-4 w-4" /></div>
          <div>
            <p className="text-xs text-gray-400">Total</p>
            <p className="text-lg font-semibold text-gray-900 leading-tight">{all.length}</p>
            <p className="text-xs text-gray-400 leading-tight">{individuales} ind. · {corporativas} corp.</p>
          </div>
        </div>

        {/* KPI 2: Pólizas activas (vigentes) */}
        <div className="rounded-xl border bg-white px-4 py-3 shadow-sm flex items-center gap-3">
          <div className="text-emerald-500"><FileCheck className="h-4 w-4" /></div>
          <div>
            <p className="text-xs text-gray-400">Pólizas activas</p>
            <p className="text-lg font-semibold text-gray-900 leading-tight">{activePoliciesCount ?? 0}</p>
            <p className="text-xs text-gray-400 leading-tight">con estatus vigente</p>
          </div>
        </div>

        {/* KPI 3: Prospectos */}
        <div className="rounded-xl border bg-white px-4 py-3 shadow-sm flex items-center gap-3">
          <div className="text-amber-500"><Users className="h-4 w-4" /></div>
          <div>
            <p className="text-xs text-gray-400">Prospectos</p>
            <p className="text-lg font-semibold text-gray-900 leading-tight">{prospects}</p>
            <p className="text-xs text-gray-400 leading-tight">cuentas en pipeline</p>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <AccountsList accounts={accounts} canDelete={canDelete} canMerge={canMerge} />
      </div>
    </div>
  )
}
