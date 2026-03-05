import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { CreditCard }        from 'lucide-react'
import { CobranzaKpis }      from './cobranza-kpis'
import { ReceiptList }       from './receipt-list'
import {
  getCobranzaKpis,
  getReceiptsForPeriod,
  getReceiptsForMonth,
  getCobranzaStages,
  getCobranzaPeriodCounts,
  getCobranzaYearChart,
  type CobranzaPeriod,
} from '@/app/actions/cobranza-receipt-actions'

const VALID_PERIODS: CobranzaPeriod[] = ['vencido', 'today', 'week', 'month', 'quarter']

interface Props {
  searchParams: Promise<{ period?: string; month?: string }>
}

export default async function CobranzaPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  const params       = await searchParams
  const period       = (VALID_PERIODS.includes(params.period as CobranzaPeriod) ? params.period : 'vencido') as CobranzaPeriod
  const monthParam   = typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month) ? params.month : null

  // Fetch in parallel
  const [kpis, receiptsResult, stages, periodCounts, yearData] = await Promise.all([
    getCobranzaKpis(),
    monthParam ? getReceiptsForMonth(monthParam) : getReceiptsForPeriod(period),
    getCobranzaStages(),
    getCobranzaPeriodCounts(),
    getCobranzaYearChart(),
  ])

  const { pending, paid } = receiptsResult

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-gray-400" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Cobranza</h1>
            <p className="text-xs text-gray-500">
              {['admin', 'ops'].includes(profile.role)
                ? 'Vista de todos los recibos'
                : profile.role === 'manager'
                  ? 'Recibos de tu equipo'
                  : 'Tus recibos pendientes'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPIs */}
        <CobranzaKpis kpis={kpis} />

        {/* Receipt list */}
        <div className="bg-white rounded-xl border p-5">
          <ReceiptList
            key={monthParam ?? period}
            initialPending={pending}
            initialPaid={paid}
            stages={stages}
            period={period}
            periodCounts={periodCounts}
            yearData={yearData}
            selectedMonth={monthParam}
          />
        </div>
      </div>
    </div>
  )
}
