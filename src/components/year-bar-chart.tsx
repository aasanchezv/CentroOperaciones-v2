'use client'

import { useState } from 'react'
import { cn }       from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────

export interface YearBarMonth {
  month:   string   // 'YYYY-MM'
  count:   number
  amount?: number   // optional — shown in tooltip for cobranza
}

interface Props {
  title:          string
  bars:           YearBarMonth[]
  selectedMonth?: string | null       // 'YYYY-MM' | null
  onMonthClick:   (month: string | null) => void
  showAmount?:    boolean
  emptyLabel?:    string
}

// ─── Month labels ─────────────────────────────────────────────

const MES: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

function formatMXN(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

// ─── YearBarChart ─────────────────────────────────────────────

export function YearBarChart({
  title, bars, selectedMonth, onMonthClick, showAmount = false, emptyLabel,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  const today        = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const maxCount     = Math.max(...bars.map(b => b.count), 1)

  return (
    <div className="rounded-xl border bg-white px-5 pt-4 pb-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
        {selectedMonth && (
          <button
            onClick={() => onMonthClick(null)}
            className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            {MES[selectedMonth.slice(5, 7)]} {selectedMonth.slice(0, 4)} ×
          </button>
        )}
      </div>

      {/* Bars */}
      <div className="flex items-end gap-1" style={{ height: '64px' }}>
        {bars.map(bar => {
          const pct         = bar.count > 0 ? Math.max((bar.count / maxCount) * 100, 8) : 0
          const isPast      = bar.month < currentMonth
          const isCurrent   = bar.month === currentMonth
          const isSelected  = bar.month === selectedMonth
          const isHovered   = bar.month === hovered
          const showLabel   = isHovered || isSelected

          const barClass = cn(
            'w-full rounded-t transition-all duration-150 cursor-pointer',
            isSelected  ? 'bg-indigo-500' :
            isCurrent   ? 'bg-blue-500' :
            isPast      ? 'bg-gray-300 hover:bg-gray-400' :
                          'bg-blue-300 hover:bg-blue-400',
            isSelected && 'ring-2 ring-indigo-400 ring-offset-1',
          )

          return (
            <div
              key={bar.month}
              className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer relative group"
              onClick={() => onMonthClick(isSelected ? null : bar.month)}
              onMouseEnter={() => setHovered(bar.month)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Tooltip */}
              {showLabel && bar.count > 0 && (
                <div className="absolute bottom-full mb-1 z-10 bg-gray-900 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap pointer-events-none">
                  {bar.count} {showAmount && bar.amount ? `· ${formatMXN(bar.amount)}` : ''}
                </div>
              )}
              {/* Bar */}
              <div
                className={barClass}
                style={{ height: `${pct}%`, minHeight: bar.count > 0 ? '4px' : '1px' }}
              />
            </div>
          )
        })}
      </div>

      {/* Month labels */}
      <div className="flex gap-1 mt-1.5">
        {bars.map(bar => (
          <div key={bar.month} className="flex-1 text-center">
            <span className={cn(
              'text-[9px] leading-none block cursor-pointer transition-colors',
              bar.month === selectedMonth ? 'text-indigo-700 font-bold' :
              bar.month === currentMonth  ? 'text-blue-600 font-semibold' :
                                            'text-gray-400',
            )}
            onClick={() => onMonthClick(bar.month === selectedMonth ? null : bar.month)}
            >
              {MES[bar.month.slice(5, 7)]}
            </span>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {bars.every(b => b.count === 0) && emptyLabel && (
        <p className="text-center text-xs text-gray-400 mt-2">{emptyLabel}</p>
      )}
    </div>
  )
}
