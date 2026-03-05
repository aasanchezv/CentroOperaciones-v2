'use client'

import Link     from 'next/link'
import { useState } from 'react'
import { RefreshCw, CreditCard, TrendingUp, BarChart3, ArrowRight, FileText, Target } from 'lucide-react'
import { MODULE_CATALOG, type ModuleId } from '@/lib/modules'

// ── helpers ───────────────────────────────────────────────────────────────────

const colorMap: Record<string, { bg: string; icon: string; ring: string }> = {
  blue:    { bg: 'bg-blue-50',    icon: 'text-blue-500',    ring: 'ring-blue-100' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-500',   ring: 'ring-amber-100' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', ring: 'ring-emerald-100' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-500',  ring: 'ring-violet-100' },
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000)     return `$${Math.round(amount / 1_000)}k`
  return `$${amount.toLocaleString('es-MX')}`
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon:  React.ReactNode
  label: string
  value: string | number
  sub:   string
  href:  string
  color: string
}

function KpiCard({ icon, label, value, sub, href, color }: KpiCardProps) {
  const c = colorMap[color] ?? colorMap.blue
  return (
    <Link
      href={href}
      className="group rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`${c.bg} ${c.icon} rounded-xl p-2.5 ring-4 ${c.ring}`}>{icon}</div>
        <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </Link>
  )
}

// ── IngresosPeriodCard ────────────────────────────────────────────────────────

type Periodo = 'mes' | 'trimestre' | 'anio'
interface PeriodData { meta: number; cobrado: number }

const periodoLabel: Record<Periodo, string> = {
  mes:       'Mes',
  trimestre: 'Trimestre',
  anio:      'Año',
}

function IngresosPeriodCard({ data }: { data: Record<Periodo, PeriodData> }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const { meta, cobrado } = data[periodo]

  const pct      = meta > 0 ? Math.min(Math.round((cobrado / meta) * 100), 100) : null
  const barColor = pct === null ? 'bg-emerald-500'
                 : pct >= 80   ? 'bg-emerald-500'
                 : pct >= 50   ? 'bg-amber-500'
                 : 'bg-red-500'
  const pctColor = pct === null ? 'text-emerald-600'
                 : pct >= 80   ? 'text-emerald-600'
                 : pct >= 50   ? 'text-amber-600'
                 : 'text-red-500'

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      {/* Header: icono + selector de periodo */}
      <div className="flex items-start justify-between mb-3">
        <div className="bg-emerald-50 text-emerald-500 rounded-xl p-2.5 ring-4 ring-emerald-100">
          <Target className="h-5 w-5" />
        </div>
        <div className="flex gap-1">
          {(['mes', 'trimestre', 'anio'] as Periodo[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                periodo === p
                  ? 'bg-emerald-100 text-emerald-700 font-semibold'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {periodoLabel[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Valor principal */}
      <p className="text-3xl font-bold text-gray-900 mt-1">
        {cobrado > 0 ? formatCurrency(cobrado) : '—'}
      </p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">Cobrado</p>

      {/* Barra de progreso vs meta */}
      {meta > 0 ? (
        <>
          <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1 flex items-center justify-between">
            <span>Meta: {formatCurrency(meta)} (pólizas venciendo)</span>
            {pct !== null && (
              <span className={`font-semibold ${pctColor}`}>{pct}%</span>
            )}
          </p>
        </>
      ) : (
        <p className="text-xs text-gray-400 mt-0.5">
          sin pólizas venciendo este {periodoLabel[periodo].toLowerCase()}
        </p>
      )}
    </div>
  )
}

// ── AgentDashboard ────────────────────────────────────────────────────────────

interface AgentDashboardProps {
  firstName:          string | null
  teamSkills:         string[]
  renewalsPending:    number
  pendingReceipts:    number
  quotationsPending:  number
  ingresosPorPeriodo: Record<Periodo, PeriodData>
}

export function AgentDashboard({
  firstName,
  teamSkills,
  renewalsPending,
  pendingReceipts,
  quotationsPending,
  ingresosPorPeriodo,
}: AgentDashboardProps) {
  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  })

  const visibleModules = teamSkills.length > 0
    ? MODULE_CATALOG.filter(m => teamSkills.includes(m.id as ModuleId))
    : MODULE_CATALOG

  return (
    <div className="p-6 space-y-7 max-w-5xl">

      {/* ── Saludo personalizado ─────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Hola{firstName ? `, ${firstName}` : ''} 👋
          </h1>
          <p className="text-sm text-gray-400 mt-0.5 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <TrendingUp className="h-4 w-4" />
          <span>Resumen operativo</span>
        </div>
      </div>

      {/* ── 4 KPIs ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<RefreshCw className="h-5 w-5" />}
          label="Pendientes de Renovar"
          value={renewalsPending}
          sub="pólizas vencen en ≤ 3 meses"
          href="/renovaciones"
          color="blue"
        />
        <KpiCard
          icon={<CreditCard className="h-5 w-5" />}
          label="Pendientes de Cobrar"
          value={pendingReceipts}
          sub="recibos vencidos o por vencer"
          href="/cobranza"
          color="amber"
        />
        <IngresosPeriodCard data={ingresosPorPeriodo} />
        <KpiCard
          icon={<FileText className="h-5 w-5" />}
          label="Cotizaciones Abiertas"
          value={quotationsPending}
          sub="pendientes + enviadas"
          href="/cotizaciones"
          color="violet"
        />
      </div>

      {/* ── Tus módulos ─────────────────────────────────── */}
      {visibleModules.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Tus módulos
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {visibleModules.map((mod) => {
              const Icon = mod.Icon
              return (
                <Link
                  key={mod.id}
                  href={mod.href}
                  className="group flex flex-col items-center gap-2 rounded-xl border bg-white p-4 text-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className={`${mod.bgClass} ${mod.iconClass} rounded-xl p-2.5`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium text-gray-700 group-hover:text-gray-900 leading-tight">
                    {mod.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Mis logros ───────────────────────────────────── */}
      <div className="flex justify-end pt-2">
        <Link
          href="/mis-logros"
          className="group inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-all"
        >
          <BarChart3 className="h-4 w-4" />
          Ver mis logros
          <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  )
}
