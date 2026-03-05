'use client'

import { useState }            from 'react'
import { ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react'
import type { AccountClaim }   from '@/types/database.types'

interface ClaimWithInsurer extends AccountClaim {
  insurer: { name: string; short_name: string | null } | null
}

interface Props {
  claims: ClaimWithInsurer[]
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatAmount(n: number | null) {
  if (n === null || n === undefined) return null
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

export function AccountClaimsSection({ claims }: Props) {
  // Auto-expand si hay siniestros de los últimos 180 días
  const cutoff  = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
  const hasRecent = claims.some(c => c.loss_date && new Date(c.loss_date) > cutoff)

  const [expanded, setExpanded] = useState(hasRecent)

  if (claims.length === 0 && !expanded) {
    return (
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          <ShieldAlert className="h-3 w-3 text-gray-300" />
          <span className="font-medium">Siniestros</span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <ShieldAlert className="h-3 w-3 text-rose-400" />
          <span className="font-medium">
            Siniestros{claims.length > 0 ? ` (${claims.length})` : ''}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="mt-2 pl-5">
          {claims.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">Sin siniestros registrados</p>
          ) : (
            <div className="space-y-0.5">
              {claims.map(claim => {
                const ins = claim.insurer as { name: string; short_name: string | null } | null
                const insurerLabel = ins?.short_name ?? ins?.name ?? '—'

                // Determinar monto más relevante: pagado > aprobado > reclamado
                const amount = claim.amount_paid ?? claim.amount_approved ?? claim.amount_claimed

                return (
                  <div key={claim.id} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                    {/* Fecha */}
                    <span className="text-[11px] text-gray-400 shrink-0 tabular-nums w-24">
                      {formatDate(claim.loss_date)}
                    </span>

                    {/* Tipo + descripción */}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-gray-700 truncate block">
                        {claim.claim_type ?? 'Siniestro'}
                      </span>
                      {claim.description && (
                        <span className="text-[11px] text-gray-400 truncate block">
                          {claim.description}
                        </span>
                      )}
                    </div>

                    {/* Aseguradora */}
                    <span className="text-[10px] text-gray-400 shrink-0">{insurerLabel}</span>

                    {/* Monto */}
                    {amount !== null && (
                      <span className="text-[11px] font-medium text-gray-600 shrink-0 tabular-nums">
                        {formatAmount(amount)}
                      </span>
                    )}

                    {/* Estatus */}
                    {claim.status_insurer && (
                      <span className="text-[10px] text-gray-400 shrink-0 max-w-[80px] truncate">
                        {claim.status_insurer}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
