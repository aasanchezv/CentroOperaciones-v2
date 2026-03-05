'use client'

import type { CobranzaKpis } from '@/app/actions/cobranza-receipt-actions'

interface Props {
  kpis: CobranzaKpis
}

function formatMXN(amount: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  }).format(amount)
}

const semaforoConfig = {
  green:  { dot: 'bg-emerald-500', label: 'Al corriente',        card: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  yellow: { dot: 'bg-amber-400',   label: 'Requiere atención',   card: 'bg-amber-50 border-amber-200 text-amber-700'       },
  red:    { dot: 'bg-red-500',     label: 'Atención urgente',     card: 'bg-red-50 border-red-200 text-red-700'             },
}

export function CobranzaKpis({ kpis }: Props) {
  const semaforo = semaforoConfig[kpis.semaforo]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* KPI 1 — Semáforo */}
      <div className={`rounded-xl border p-4 ${semaforo.card}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${semaforo.dot}`} />
          <p className="text-xs font-medium">{semaforo.label}</p>
        </div>
        <p className="text-3xl font-bold">{kpis.urgentCount}</p>
        <p className="text-xs mt-0.5 opacity-80">vencidos + vencen en ≤ 3 días</p>
      </div>

      {/* KPI 2 — Esta semana */}
      <div className="rounded-xl border bg-blue-50 border-blue-200 p-4">
        <p className="text-xs font-medium text-blue-600 mb-1">Cobrar en 15 días</p>
        <p className="text-3xl font-bold text-blue-700">{kpis.weekCount}</p>
        <p className="text-xs text-blue-500 mt-0.5">recibos pendientes</p>
      </div>

      {/* KPI 3 — Prima pendiente de cobro */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs font-medium text-gray-500 mb-1">Prima Pendiente de Cobro</p>
        <p className="text-2xl font-bold text-gray-900">{formatMXN(kpis.pendingPrima)}</p>
        <p className="text-xs text-gray-400 mt-0.5">recibos vencidos + pendientes</p>
      </div>

      {/* KPI 4 — Cumplimiento */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-xs font-medium text-gray-500 mb-1">Cumplimiento del mes</p>
        <p className="text-3xl font-bold text-gray-900">{kpis.cumplimientoPct}%</p>
        <div className="mt-2 h-1.5 rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all ${
              kpis.cumplimientoPct >= 80 ? 'bg-emerald-500' :
              kpis.cumplimientoPct >= 50 ? 'bg-amber-400'   : 'bg-red-400'
            }`}
            style={{ width: `${Math.min(kpis.cumplimientoPct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">prima cobrada vs pendiente este mes</p>
      </div>
    </div>
  )
}
