'use client'

import { useState }              from 'react'
import { Trash2, Upload, Clock, AlertTriangle } from 'lucide-react'
import { ImportWizard }          from './import-wizard'
import { deleteClaimImportRun }  from '@/app/actions/claim-actions'
import type { ClaimImportRun }   from '@/types/database.types'

interface Insurer { id: string; name: string; short_name: string | null }

type Tab = 'importar' | 'historial' | 'sinmatch'

interface UnmatchedClaim {
  id:               string
  policy_number_raw: string | null
  claim_number:     string | null
  loss_date:        string | null
  claim_type:       string | null
  insurer:          { name: string; short_name: string | null } | null
  run:              { period_label: string | null } | null
}

interface Props {
  insurers:       Insurer[]
  importRuns:     (ClaimImportRun & {
    insurer:  { name: string; short_name: string | null } | null
    importer: { full_name: string } | null
  })[]
  unmatchedClaims: UnmatchedClaim[]
}

const TAB_CONFIG: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'importar',  label: 'Importar',  icon: Upload        },
  { key: 'historial', label: 'Historial', icon: Clock         },
  { key: 'sinmatch',  label: 'Sin Match', icon: AlertTriangle },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SiniestrosAdminClient({ insurers, importRuns, unmatchedClaims }: Props) {
  const [activeTab,   setActiveTab]   = useState<Tab>('importar')
  const [runs,        setRuns]        = useState(importRuns)
  const [unmatched,   setUnmatched]   = useState(unmatchedClaims)
  const [deleting,    setDeleting]    = useState<string | null>(null)

  async function handleDeleteRun(runId: string) {
    if (!confirm('¿Eliminar esta importación y todos sus siniestros? Esta acción no se puede deshacer.')) return
    setDeleting(runId)
    const result = await deleteClaimImportRun(runId)
    if (result.error) { alert(result.error); setDeleting(null); return }
    setRuns(prev => prev.filter(r => r.id !== runId))
    setUnmatched(prev => prev.filter(c => {
      // We can't easily filter by run_id here since UnmatchedClaim has run: {period_label}
      // Just reload by removing the run — server revalidation will handle the rest
      return true
    }))
    setDeleting(null)
  }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {TAB_CONFIG.map(t => {
          const Icon = t.icon
          const isActive = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.key === 'sinmatch' && unmatched.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  {unmatched.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab: Importar */}
      {activeTab === 'importar' && (
        <ImportWizard insurers={insurers} />
      )}

      {/* Tab: Historial */}
      {activeTab === 'historial' && (
        <div className="rounded-lg border bg-white overflow-hidden">
          {runs.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              No hay importaciones aún. Usa la pestaña Importar para subir el primer reporte.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
                  <th className="px-4 py-2.5 text-left font-medium">Aseguradora</th>
                  <th className="px-4 py-2.5 text-left font-medium">Período</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium text-emerald-700">Match</th>
                  <th className="px-4 py-2.5 text-right font-medium text-amber-700">Sin Match</th>
                  <th className="px-4 py-2.5 text-left font-medium">Importado por</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map(run => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{formatDate(run.created_at)}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {(run.insurer as { name: string; short_name: string | null } | null)?.short_name ??
                       (run.insurer as { name: string; short_name: string | null } | null)?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{run.period_label ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{run.total_rows}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{run.matched_rows}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">
                      {run.unmatched_rows > 0 ? (
                        <button
                          className="hover:underline"
                          onClick={() => setActiveTab('sinmatch')}
                        >
                          {run.unmatched_rows}
                        </button>
                      ) : '0'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {(run.importer as { full_name: string } | null)?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleDeleteRun(run.id)}
                        disabled={deleting === run.id}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Eliminar importación"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Sin Match */}
      {activeTab === 'sinmatch' && (
        <div className="space-y-3">
          {unmatched.length === 0 ? (
            <div className="rounded-lg border bg-white px-6 py-10 text-center text-sm text-gray-400">
              No hay siniestros sin match. Todos los registros pudieron vincularse a una póliza.
            </div>
          ) : (
            <>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                Estos siniestros no pudieron vincularse a ninguna póliza porque el número de póliza
                del reporte no coincide con ninguna póliza en el sistema. Verifica si la póliza está
                registrada o si el número viene en un formato distinto.
              </p>
              <div className="rounded-lg border bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium">Aseguradora</th>
                      <th className="px-3 py-2.5 text-left font-medium">No. Póliza (reporte)</th>
                      <th className="px-3 py-2.5 text-left font-medium">No. Siniestro</th>
                      <th className="px-3 py-2.5 text-left font-medium">Fecha</th>
                      <th className="px-3 py-2.5 text-left font-medium">Tipo</th>
                      <th className="px-3 py-2.5 text-left font-medium">Período</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {unmatched.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          {(c.insurer as { name: string; short_name: string | null } | null)?.short_name ??
                           (c.insurer as { name: string; short_name: string | null } | null)?.name ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-gray-700">{c.policy_number_raw ?? '—'}</td>
                        <td className="px-3 py-2">{c.claim_number ?? '—'}</td>
                        <td className="px-3 py-2">{c.loss_date ?? '—'}</td>
                        <td className="px-3 py-2 max-w-[140px] truncate">{c.claim_type ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-400">
                          {(c.run as { period_label: string | null } | null)?.period_label ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
