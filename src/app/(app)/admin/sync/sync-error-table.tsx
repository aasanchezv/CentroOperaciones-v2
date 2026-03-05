'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import type { SyncRun, SyncError } from '@/types/database.types'
import { getSyncErrors } from '@/app/actions/sync-actions'

interface Props {
  runs: SyncRun[]
}

const errorTypeLabels: Record<string, string> = {
  upsert_failed:       'Error de guardado',
  unresolved_reference:'Referencia sin resolver',
  validation:          'Validación',
}

const entityTypeLabels: Record<string, string> = {
  account: 'Cuenta',
  contact: 'Contacto',
  policy:  'Póliza',
  receipt: 'Recibo',
}

export function SyncErrorTable({ runs }: Props) {
  const [selectedRunId, setSelectedRunId] = useState<string>(
    runs.find(r => r.error_count > 0)?.id ?? runs[0]?.id ?? ''
  )
  const [errors, setErrors]   = useState<SyncError[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function loadErrors(runId: string) {
    if (!runId) return
    setSelectedRunId(runId)
    setLoading(true)
    try {
      const data = await getSyncErrors(runId)
      setErrors(data)
    } finally {
      setLoading(false)
    }
  }

  const runsWithErrors = runs.filter(r => r.error_count > 0)

  if (runsWithErrors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-300">
        <AlertTriangle className="h-10 w-10 mb-3" />
        <p className="text-sm text-gray-400">Sin errores registrados</p>
        <p className="text-xs mt-0.5">Los errores del sync aparecen aquí para diagnóstico</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Selector de run */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 shrink-0">Run con errores:</span>
        <select
          value={selectedRunId}
          onChange={e => loadErrors(e.target.value)}
          className="text-sm border rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          <option value="">— Selecciona un run —</option>
          {runsWithErrors.map(run => (
            <option key={run.id} value={run.id}>
              {new Date(run.started_at).toLocaleString('es-MX', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })} — {run.error_count} error{run.error_count !== 1 ? 'es' : ''}
            </option>
          ))}
        </select>
        {!selectedRunId && (
          <button
            onClick={() => loadErrors(runsWithErrors[0]?.id ?? '')}
            className="text-xs text-blue-600 hover:underline"
          >
            Ver último con errores
          </button>
        )}
      </div>

      {/* Tabla de errores */}
      {loading ? (
        <div className="text-center py-8 text-sm text-gray-400">Cargando errores…</div>
      ) : errors.length === 0 && selectedRunId ? (
        <div className="text-center py-8 text-sm text-gray-400">Sin errores para este run</div>
      ) : errors.length > 0 ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Tipo</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Entidad</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">ID Externo</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Mensaje</th>
                <th className="px-4 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {errors.map(err => (
                <>
                  <tr
                    key={err.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === err.id ? null : err.id)}
                  >
                    <td className="px-4 py-2.5">
                      <span className={[
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                        err.error_type === 'unresolved_reference'
                          ? 'text-amber-600 bg-amber-50 border-amber-200'
                          : err.error_type === 'validation'
                          ? 'text-blue-600 bg-blue-50 border-blue-200'
                          : 'text-red-600 bg-red-50 border-red-200',
                      ].join(' ')}>
                        {errorTypeLabels[err.error_type ?? ''] ?? err.error_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">
                      {entityTypeLabels[err.entity_type ?? ''] ?? err.entity_type}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">
                      {err.external_id ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs max-w-xs truncate">
                      {err.error_message}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {expanded === err.id
                        ? <ChevronDown className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                  </tr>
                  {expanded === err.id && err.raw_data && (
                    <tr key={`${err.id}-detail`} className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3">
                        <pre className="text-xs text-gray-600 font-mono bg-gray-100 rounded-md p-3 overflow-x-auto max-h-40">
                          {JSON.stringify(err.raw_data, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
