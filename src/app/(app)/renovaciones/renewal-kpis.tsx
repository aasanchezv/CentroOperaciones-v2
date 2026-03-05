'use client'

import { RefreshCw, AlertTriangle, DollarSign, Activity } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────

export interface SemaphoreSettings {
  green:  number
  yellow: number
}

export interface RenewalKpisProps {
  pendientesEsteMes: number
  primaPendiente:    number
  proximas7Dias:     number
  pctRenovado:       number
  semaphore:         SemaphoreSettings
}

// ─── Helpers ───────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000)     return `$${Math.round(amount / 1_000)}k`
  return `$${amount.toLocaleString('es-MX')}`
}

function getSemaphore(pct: number, green: number, yellow: number) {
  if (pct >= green)  return { color: 'emerald', label: 'Buen ritmo',        dot: '🟢' }
  if (pct >= yellow) return { color: 'amber',   label: 'Requiere atención', dot: '🟡' }
  return                    { color: 'red',     label: 'En riesgo',         dot: '🔴' }
}

const colorMap: Record<string, { bg: string; icon: string; ring: string }> = {
  blue:    { bg: 'bg-blue-50',    icon: 'text-blue-500',    ring: 'ring-blue-100'    },
  red:     { bg: 'bg-red-50',     icon: 'text-red-500',     ring: 'ring-red-100'     },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-500',   ring: 'ring-amber-100'   },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', ring: 'ring-emerald-100' },
}

function KpiCard({ icon, label, value, sub, color }: {
  icon:  React.ReactNode
  label: string
  value: string | number
  sub:   string
  color: string
}) {
  const c = colorMap[color] ?? colorMap.blue
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className={`${c.bg} ${c.icon} rounded-xl p-2.5 ring-4 ${c.ring}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────

export function RenewalKpis({
  pendientesEsteMes,
  primaPendiente,
  proximas7Dias,
  pctRenovado,
  semaphore,
}: RenewalKpisProps) {
  const sem = getSemaphore(pctRenovado, semaphore.green, semaphore.yellow)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        icon={<RefreshCw className="h-5 w-5" />}
        label="Pendientes este mes"
        value={pendientesEsteMes}
        sub="renovaciones activas"
        color="blue"
      />
      <KpiCard
        icon={<DollarSign className="h-5 w-5" />}
        label="Prima pendiente"
        value={primaPendiente > 0 ? formatCurrency(primaPendiente) : '$0'}
        sub="por renovar o cobrar"
        color="red"
      />
      <KpiCard
        icon={<AlertTriangle className="h-5 w-5" />}
        label="Próximas 7 días"
        value={proximas7Dias}
        sub="vencen esta semana"
        color="amber"
      />
      <KpiCard
        icon={<Activity className="h-5 w-5" />}
        label="Semáforo del mes"
        value={`${sem.dot} ${Math.round(pctRenovado)}%`}
        sub={sem.label}
        color={sem.color}
      />
    </div>
  )
}
