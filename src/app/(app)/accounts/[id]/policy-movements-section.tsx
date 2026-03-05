'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, ArrowLeftRight, CheckCircle2, XCircle, Clock, Send, Plus } from 'lucide-react'
import { NewMovementSheet } from './new-movement-sheet'
import type { MovementType, PolicyMovement } from '@/types/database.types'

// ─── Status helpers ───────────────────────────────────────────

const STATUS_INFO: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  draft:     { label: 'Borrador',   cls: 'bg-gray-100 text-gray-500',   Icon: Clock       },
  sent:      { label: 'Enviado',    cls: 'bg-blue-100 text-blue-700',   Icon: Send        },
  confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  rejected:  { label: 'Rechazado', cls: 'bg-red-100 text-red-700',     Icon: XCircle     },
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────

interface PolicyInfo {
  id:           string
  policy_number: string | null
  branch:       string
  insurer:      string
  account_type: string   // 'empresa' | 'persona_fisica'
}

interface Props {
  policy:        PolicyInfo
  movementTypes: MovementType[]
  movements:     PolicyMovement[]
  isReadonly:    boolean
}

export function PolicyMovementsSection({ policy, movementTypes, movements, isReadonly }: Props) {
  // Auto-expand if any movement was created in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const hasRecent = movements.some(m => new Date(m.created_at) > thirtyDaysAgo)

  const [expanded, setExpanded] = useState(hasRecent)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      {/* Section header row */}
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <ArrowLeftRight className="h-3 w-3 text-orange-400" />
          <span className="font-medium">
            Movimientos{movements.length > 0 ? ` (${movements.length})` : ''}
          </span>
        </button>

        {!isReadonly && movementTypes.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setSheetOpen(true) }}
            className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Movimiento
          </button>
        )}
      </div>

      {/* Expanded history */}
      {expanded && (
        <div className="mt-2 space-y-1 pl-5">
          {movements.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">Sin movimientos registrados</p>
          ) : (
            movements.map(mv => {
              const info = STATUS_INFO[mv.status] ?? STATUS_INFO.draft
              const StatusIcon = info.Icon
              return (
                <div key={mv.id} className="flex items-center gap-2 py-0.5">
                  <div className={`shrink-0 rounded-full p-0.5 ${info.cls}`}>
                    <StatusIcon className="h-2.5 w-2.5" />
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                    {formatDateShort(mv.created_at)}
                  </span>
                  <span className="text-xs font-medium text-gray-700 truncate flex-1">
                    {mv.movement_type_name}
                  </span>
                  <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${info.cls}`}>
                    {info.label}
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* New movement sheet */}
      <NewMovementSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        policy={policy}
        movementTypes={movementTypes}
      />
    </>
  )
}
