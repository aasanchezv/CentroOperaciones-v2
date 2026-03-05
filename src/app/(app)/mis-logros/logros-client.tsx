'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw, FileText, DollarSign, CheckCircle2, Download, User, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LogrosData } from '@/app/actions/logros-actions'

// ─── Types ──────────────────────────────────────────────────

interface AgentOption {
  id:        string
  full_name: string | null
  email:     string
  role:      string
}

interface LogrosClientProps {
  data:       LogrosData
  agents:     AgentOption[]  // solo para admin/manager
  isAdmin:    boolean
  currentUserId: string
}

// ─── Helpers ─────────────────────────────────────────────────

const PERIODS = [
  { id: 'today', label: 'Hoy'        },
  { id: 'week',  label: 'Esta semana' },
  { id: 'month', label: 'Este mes'   },
  { id: 'year',  label: 'Este año'   },
] as const

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000)     return `$${Math.round(amount / 1_000)}k`
  return new Intl.NumberFormat('es-MX', {
    style:                'currency',
    currency:             'MXN',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Type icon / color map ────────────────────────────────────

const TYPE_META = {
  renewal:    { icon: <RefreshCw    className="h-4 w-4" />, color: 'bg-blue-100 text-blue-600'    },
  quotation:  { icon: <FileText     className="h-4 w-4" />, color: 'bg-violet-100 text-violet-600' },
  collection: { icon: <DollarSign   className="h-4 w-4" />, color: 'bg-sky-100 text-sky-600'      },
  task:       { icon: <CheckCircle2 className="h-4 w-4" />, color: 'bg-amber-100 text-amber-600'  },
} as const

// ─── Export helpers ──────────────────────────────────────────

async function exportToExcel(data: LogrosData) {
  const XLSX = await import('xlsx')

  // Summary sheet
  const summaryData = [
    ['KPI',                         'Valor'],
    ['Renovaciones pagadas',         data.summary.renewalsDone],
    ['Prima renovada',               data.summary.renewalsPremiumSum],
    ['Cotizaciones enviadas',        data.summary.quotationsSent],
    ['Cotizaciones ganadas',         data.summary.quotationsWon],
    ['Prima cotizaciones ganadas',   data.summary.quotationsPremiumSum],
    ['Cobros enviados',              data.summary.collectionsSent],
    ['Tareas completadas',           data.summary.tasksDone],
  ]

  // Timeline sheet
  const timelineData = data.timeline.map(item => ({
    Fecha:      new Date(item.date).toLocaleDateString('es-MX'),
    Hora:       new Date(item.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    Tipo:       item.type,
    Título:     item.title,
    Detalle:    item.subtitle,
    Monto:      item.amount ?? '',
    Estado:     item.statusLabel,
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Resumen')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(timelineData), 'Actividad')
  XLSX.writeFile(wb, `mis-logros-${new Date().toISOString().split('T')[0]}.xlsx`)
}

// ─── Component ───────────────────────────────────────────────

export function LogrosClient({ data, agents, isAdmin, currentUserId }: LogrosClientProps) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const period       = searchParams.get('period') ?? 'month'
  const viewUserId   = searchParams.get('userId') ?? currentUserId

  function navigateTo(params: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([k, v]) => sp.set(k, v))
    router.push(`/mis-logros?${sp.toString()}`)
  }

  const { summary, timeline } = data

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            Mis logros
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Tu desempeño y actividad en el período seleccionado
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Agent selector (admin only) */}
          {isAdmin && agents.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-gray-400" />
              <select
                value={viewUserId}
                onChange={e => navigateTo({ userId: e.target.value, period })}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.full_name ?? a.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => exportToExcel(data)}
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* ── Period tabs ──────────────────────────────────── */}
      <div className="flex gap-1 border-b">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => navigateTo({ period: p.id })}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              period === p.id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600',
            ].join(' ')}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── KPI cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon:  <RefreshCw    className="h-5 w-5" />,
            label: 'Renovaciones pagadas',
            value: summary.renewalsDone,
            sub:   formatCurrency(summary.renewalsPremiumSum) + ' en primas',
            bg:    'bg-blue-50',    ic: 'text-blue-500',
          },
          {
            icon:  <FileText     className="h-5 w-5" />,
            label: 'Cotizaciones ganadas',
            value: summary.quotationsWon,
            sub:   `${summary.quotationsSent} enviadas · ${formatCurrency(summary.quotationsPremiumSum)}`,
            bg:    'bg-violet-50',  ic: 'text-violet-500',
          },
          {
            icon:  <DollarSign   className="h-5 w-5" />,
            label: 'Prima cobrada',
            value: formatCurrency(summary.renewalsPremiumSum + summary.quotationsPremiumSum),
            sub:   'renovaciones + cotizaciones',
            bg:    'bg-emerald-50', ic: 'text-emerald-500',
          },
          {
            icon:  <CheckCircle2 className="h-5 w-5" />,
            label: 'Tareas completadas',
            value: summary.tasksDone,
            sub:   `${summary.collectionsSent} cobros enviados`,
            bg:    'bg-amber-50',   ic: 'text-amber-500',
          },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className={`${card.bg} ${card.ic} rounded-xl p-2.5 w-fit mb-3`}>
              {card.icon}
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm font-medium text-gray-700 mt-0.5">{card.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Timeline ─────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="text-sm font-medium text-gray-700">Actividad</h2>
          <span className="text-xs text-gray-400">{timeline.length} eventos</span>
        </div>

        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14">
            <RefreshCcw className="h-8 w-8 text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">Sin actividad en este período</p>
            <p className="text-xs text-gray-300 mt-0.5">Prueba seleccionar un rango más amplio</p>
          </div>
        ) : (
          <ul className="divide-y">
            {timeline.map((item) => {
              const meta = TYPE_META[item.type]
              return (
                <li key={`${item.type}-${item.id}`} className="flex items-start gap-3 px-5 py-3.5">
                  <div className={`${meta.color} rounded-lg p-1.5 mt-0.5 shrink-0`}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    {item.amount != null && item.amount > 0 && (
                      <p className="text-sm font-semibold text-gray-800">
                        {formatCurrency(item.amount)}
                      </p>
                    )}
                    <p className={`text-xs font-medium ${item.statusClass}`}>{item.statusLabel}</p>
                    <p className="text-[11px] text-gray-300 mt-0.5">{formatDate(item.date)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
