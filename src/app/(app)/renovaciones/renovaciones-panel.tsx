'use client'

import { useState, useMemo } from 'react'
import { Search }            from 'lucide-react'
import { cn }                from '@/lib/utils'
import { RenewalKpis, type RenewalKpisProps } from './renewal-kpis'
import { RenewalKanban }     from './renewal-kanban'
import { YearBarChart, type YearBarMonth } from '@/components/year-bar-chart'
import type { RenewalListProps } from './renewal-list'

// ── Tipos ──────────────────────────────────────────────────────

export type RenewalPeriod = 'vencida' | 'hoy' | 'semana' | 'mes' | 'trimestre'

const PERIODS: RenewalPeriod[]                     = ['vencida', 'hoy', 'semana', 'mes', 'trimestre']
const PERIOD_LABELS: Record<RenewalPeriod, string> = {
  vencida:   'Vencida',
  hoy:       'Hoy',
  semana:    'Esta semana',
  mes:       'Este mes',
  trimestre: 'Este trimestre',
}

// ── Helpers de filtro ──────────────────────────────────────────

export function matchesPeriod(endDate: string | null, period: RenewalPeriod): boolean {
  if (!endDate) return false
  const exp   = new Date(endDate + 'T12:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  switch (period) {
    case 'vencida':
      return exp < today
    case 'hoy':
      return exp >= today && exp <= todayEnd
    case 'semana': {
      const weekEnd = new Date(today)
      weekEnd.setDate(weekEnd.getDate() + 7)
      return exp >= today && exp <= weekEnd
    }
    case 'mes':
      return exp.getFullYear() === today.getFullYear() && exp.getMonth() === today.getMonth()
    case 'trimestre': {
      const q      = Math.floor(today.getMonth() / 3)
      const qStart = new Date(today.getFullYear(), q * 3, 1)
      const qEnd   = new Date(today.getFullYear(), (q + 1) * 3, 0, 23, 59, 59)
      return exp >= qStart && exp <= qEnd
    }
  }
}

function matchesMonthFilter(endDate: string | null, selectedMonth: string): boolean {
  if (!endDate) return false
  return endDate.startsWith(selectedMonth)
}

function matchesQuery(name: string, polNum: string | null | undefined, q: string): boolean {
  if (!q) return true
  const ql = q.toLowerCase()
  return name.toLowerCase().includes(ql) || (polNum ?? '').toLowerCase().includes(ql)
}

// ── PipelineSummary ────────────────────────────────────────────

interface PipelineSummaryProps {
  stages:  { id: string; name: string }[]
  counts:  Record<string, number>
  period:  RenewalPeriod
  selectedMonth: string | null
  total:   number
}

const MES: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

function PipelineSummary({ stages, counts, period, selectedMonth, total }: PipelineSummaryProps) {
  const cols = [
    { id: '__candidates', label: 'Por iniciar' },
    ...stages.map(s => ({ id: s.id, label: s.name })),
  ]
  const max = Math.max(...cols.map(c => counts[c.id] ?? 0), 1)

  const periodLabel = selectedMonth
    ? `${MES[selectedMonth.slice(5, 7)]} ${selectedMonth.slice(0, 4)}`
    : PERIOD_LABELS[period]

  return (
    <div className="rounded-xl border bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Pipeline · {periodLabel}
        </p>
        <span className="text-xs text-gray-400">{total} total</span>
      </div>
      <div className="flex items-end gap-2 h-10">
        {cols.map(col => {
          const n   = counts[col.id] ?? 0
          const pct = n > 0 ? Math.max((n / max) * 100, 15) : 0
          return (
            <div key={col.id} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
              <span className="text-[10px] font-bold text-gray-600 leading-none">{n > 0 ? n : ''}</span>
              <div
                className={cn(
                  'w-full rounded-t transition-all',
                  col.id === '__candidates' ? 'bg-blue-300' : 'bg-indigo-300'
                )}
                style={{ height: `${pct}%`, minHeight: n > 0 ? '4px' : '0' }}
              />
            </div>
          )
        })}
      </div>
      {/* Labels */}
      <div className="flex gap-2 mt-1.5">
        {cols.map(col => (
          <div key={col.id} className="flex-1 min-w-0 text-center">
            <span className="text-[9px] text-gray-400 leading-none truncate block">{col.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── RenovacionesPanel ──────────────────────────────────────────

interface Props extends RenewalKpisProps {
  listProps: RenewalListProps
  yearData:  YearBarMonth[]
}

export function RenovacionesPanel({ listProps, yearData, ...kpisProps }: Props) {
  const [period,        setPeriod]        = useState<RenewalPeriod>('mes')
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [query,         setQuery]         = useState('')

  const q = query.trim()

  // When a period button is clicked, clear the month selection
  function handlePeriodChange(p: RenewalPeriod) {
    setPeriod(p)
    setSelectedMonth(null)
  }

  // When a chart bar is clicked, set the month and clear the period filter
  function handleMonthClick(month: string | null) {
    setSelectedMonth(month)
  }

  const inProgress = useMemo(
    () => listProps.renewals.filter(r => r.status === 'in_progress'),
    [listProps.renewals]
  )
  const completed = useMemo(
    () => listProps.renewals.filter(r => r.status !== 'in_progress'),
    [listProps.renewals]
  )

  const filteredCandidates = useMemo(() =>
    listProps.candidates.filter(c => {
      const endDate = c.end_date as string | null
      if (selectedMonth) {
        if (!matchesMonthFilter(endDate, selectedMonth)) return false
      } else {
        if (!matchesPeriod(endDate, period)) return false
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acct = Array.isArray(c.account) ? (c.account as any)[0] : c.account
      const name = (acct as { name?: string } | null)?.name ?? ''
      return matchesQuery(name, c.policy_number, q)
    }),
    [listProps.candidates, period, selectedMonth, q]
  )

  const filteredInProgress = useMemo(() =>
    inProgress.filter(r => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pol     = Array.isArray(r.policy) ? (r.policy as any)[0] : r.policy
      const endDate = (pol as { end_date?: string | null } | null)?.end_date ?? null
      if (selectedMonth) {
        if (!matchesMonthFilter(endDate, selectedMonth)) return false
      } else {
        if (!matchesPeriod(endDate, period)) return false
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acct   = Array.isArray(r.account) ? (r.account as any)[0] : r.account
      const name   = (acct as { name?: string } | null)?.name ?? ''
      const polNum = (pol as { policy_number?: string | null } | null)?.policy_number ?? null
      return matchesQuery(name, polNum, q)
    }),
    [inProgress, period, selectedMonth, q]
  )

  const countsByStage = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = { '__candidates': filteredCandidates.length }
    for (const stage of listProps.stages) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result[stage.id] = filteredInProgress.filter(r => (r as any).current_stage_id === stage.id).length
    }
    return result
  }, [filteredCandidates, filteredInProgress, listProps.stages])

  const total = filteredCandidates.length + filteredInProgress.length

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <RenewalKpis {...kpisProps} />

      {/* Year chart */}
      <YearBarChart
        title="Renovaciones del año"
        bars={yearData}
        selectedMonth={selectedMonth}
        onMonthClick={handleMonthClick}
        emptyLabel="Sin pólizas venciendo este año"
      />

      {/* Period filter + Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap',
                period === p && !selectedMonth
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar cliente o # póliza…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20 transition-colors"
          />
        </div>
      </div>

      {/* Pipeline summary chart */}
      <PipelineSummary
        stages={listProps.stages as { id: string; name: string }[]}
        counts={countsByStage}
        period={period}
        selectedMonth={selectedMonth}
        total={total}
      />

      {/* Kanban */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RenewalKanban
        candidates={filteredCandidates as any}
        inProgress={filteredInProgress as any}
        completed={completed           as any}
        stages={listProps.stages       as any}
        templates={listProps.templates as any}
        currentUserId={listProps.currentUserId}
        currentUserEmail={listProps.currentUserEmail}
      />
    </div>
  )
}
