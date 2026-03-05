'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Play, RefreshCw, Clock, CheckCircle2, AlertTriangle, XCircle,
  Activity, AlertOctagon, Settings2, Link2, Wifi, Zap,
} from 'lucide-react'
import { SyncErrorTable }        from './sync-error-table'
import { FieldMappingEditor }    from './field-mapping-editor'
import { ReferenceResolver }     from './reference-resolver'
import { ConnectionConfigForm }  from './connection-config'
import { seedDefaultFieldMappings } from '@/app/actions/sync-actions'
import type {
  SyncRun, SyncError, SyncFieldMapping, SyncReferenceMap,
} from '@/types/database.types'
import type { ConnectionConfig } from '@/app/actions/sync-actions'

interface Profile {
  id:        string
  full_name: string | null
  email:     string | null
}

interface Props {
  initialRuns:       SyncRun[]
  lastRunId:         string | null
  initialMappings:   SyncFieldMapping[]
  initialErrors:     SyncError[]
  initialRefMaps:    SyncReferenceMap[]
  profiles:          Profile[]
  initialConnection: ConnectionConfig
}

type Tab = 'historial' | 'errores' | 'conexion' | 'mapeos' | 'referencias'

const TAB_CONFIG: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'historial',   label: 'Historial',   icon: Activity    },
  { key: 'errores',     label: 'Errores',      icon: AlertOctagon },
  { key: 'conexion',    label: 'Conexión',     icon: Wifi        },
  { key: 'mapeos',      label: 'Mapeos',       icon: Settings2   },
  { key: 'referencias', label: 'Referencias',  icon: Link2       },
]

const statusConfig = {
  success: { label: 'Exitoso',  icon: CheckCircle2,  className: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  partial: { label: 'Parcial',  icon: AlertTriangle, className: 'text-amber-600 bg-amber-50 border-amber-200'       },
  failed:  { label: 'Fallido',  icon: XCircle,       className: 'text-red-600 bg-red-50 border-red-200'             },
  running: { label: 'En curso', icon: RefreshCw,     className: 'text-blue-600 bg-blue-50 border-blue-200'          },
}

export function SyncClient({
  initialRuns,
  lastRunId,
  initialMappings,
  initialErrors,
  initialRefMaps,
  profiles,
  initialConnection,
}: Props) {
  const router = useRouter()
  const [triggering, setTriggering]       = useState(false)
  const [triggerError, setTriggerError]   = useState<string | null>(null)
  const [activeTab, setActiveTab]         = useState<Tab>('historial')
  const [pollingRunId, setPollingRunId]   = useState<string | null>(null)
  const [liveRun, setLiveRun]             = useState<Partial<SyncRun> | null>(null)
  const [hasMappings, setHasMappings]     = useState(initialMappings.length > 0)
  const [seedError, setSeedError]         = useState<string | null>(null)
  const [seedOk, setSeedOk]               = useState(false)
  const [isPendingSeed, startSeedTransition] = useTransition()
  const isConnectionConfigured            = Boolean(initialConnection.host && initialConnection.database && initialConnection.user)

  // ── Polling: actualiza el run activo cada 5 s ──────────────────────────────
  const pollStatus = useCallback(async (runId: string) => {
    try {
      const res  = await fetch(`/api/admin/sync/status?runId=${runId}`)
      if (!res.ok) return
      const data = await res.json() as Partial<SyncRun>
      setLiveRun(data)
      if (data.status !== 'running') {
        setPollingRunId(null)
        setLiveRun(null)
        router.refresh()
      }
    } catch {
      // Silencioso — seguir intentando
    }
  }, [router])

  useEffect(() => {
    if (!pollingRunId) return
    const interval = setInterval(() => pollStatus(pollingRunId), 5000)
    return () => clearInterval(interval)
  }, [pollingRunId, pollStatus])

  // ── Trigger manual ─────────────────────────────────────────────────────────
  async function handleTrigger() {
    setTriggering(true)
    setTriggerError(null)
    try {
      const res  = await fetch('/api/admin/sync/trigger', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al iniciar sync')

      // Si retornó un runId, comenzar polling
      if (json.runId) {
        setPollingRunId(json.runId)
        setLiveRun({ id: json.runId, status: 'running' })
      } else {
        router.refresh()
      }
    } catch (e) {
      setTriggerError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setTriggering(false)
    }
  }

  function handleSeedMappings() {
    setSeedError(null)
    setSeedOk(false)
    startSeedTransition(async () => {
      const result = await seedDefaultFieldMappings()
      if (result.error) {
        setSeedError(result.error)
      } else {
        setSeedOk(true)
        setHasMappings(true)
        router.refresh()
      }
    })
  }

  const isRunning = pollingRunId !== null || liveRun?.status === 'running'
  const unresolvedErrorCount = initialErrors.filter(e => e.error_type === 'unresolved_reference').length

  return (
    <div className="space-y-4">
      {/* Live progress banner */}
      {isRunning && liveRun && (
        <div className="rounded-xl border bg-blue-50 border-blue-200 px-4 py-3 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">Sync en curso…</p>
            <p className="text-xs text-blue-500 mt-0.5">
              Actualizando cada 5 segundos. No cierres esta página.
              {liveRun.accounts_upserted !== undefined && (
                <> · {liveRun.accounts_upserted} cuentas · {liveRun.policies_upserted} pólizas</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Alerta si la conexión no está configurada */}
      {!isConnectionConfigured && (
        <div className="rounded-xl border bg-amber-50 border-amber-200 px-4 py-3 flex items-center gap-3 cursor-pointer"
             onClick={() => setActiveTab('conexion')}>
          <Wifi className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Conexión a BD externa sin configurar</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Ve a <strong>Conexión</strong> para ingresar host, base de datos y usuario antes de ejecutar el sync.
            </p>
          </div>
        </div>
      )}

      {/* Alerta si no hay mapeos configurados */}
      {isConnectionConfigured && !hasMappings && (
        <div className="rounded-xl border bg-amber-50 border-amber-200 px-4 py-3 flex items-center gap-3 cursor-pointer"
             onClick={() => setActiveTab('mapeos')}>
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Sin mapeos de campos configurados</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Ve a <strong>Mapeos</strong> para configurar las columnas de la BD externa antes de ejecutar el sync.
            </p>
          </div>
        </div>
      )}

      {/* Tabs + botón ejecutar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {TAB_CONFIG.map(tab => {
            const Icon = tab.icon
            const badge =
              tab.key === 'errores'     ? initialRuns.filter(r => r.error_count > 0).length :
              tab.key === 'referencias' ? unresolvedErrorCount :
              null
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all',
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 font-medium shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {badge !== null && badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-semibold rounded-full px-1.5 leading-4 min-w-[18px] text-center">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <Button
          size="sm"
          className="gap-2 shrink-0"
          onClick={handleTrigger}
          disabled={triggering || isRunning}
        >
          {triggering || isRunning
            ? <RefreshCw className="h-4 w-4 animate-spin" />
            : <Play className="h-4 w-4" />}
          {triggering ? 'Iniciando…' : isRunning ? 'En curso…' : 'Ejecutar ahora'}
        </Button>
      </div>

      {triggerError && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {triggerError}
        </p>
      )}

      {/* ── Tab: Historial ───────────────────────────────────────────────── */}
      {activeTab === 'historial' && (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          {initialRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <Clock className="h-10 w-10 mb-3" />
              <p className="text-sm text-gray-400">Sin ejecuciones aún</p>
              <p className="text-xs mt-0.5">Configura los mapeos y usa &quot;Ejecutar ahora&quot; para iniciar</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Fecha</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Estado</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Cuentas</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Pólizas</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Canceladas</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Renovac.</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Errores</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {initialRuns.map(run => {
                  const cfg  = statusConfig[run.status as keyof typeof statusConfig] ?? statusConfig.running
                  const Icon = cfg.icon
                  const duration = run.finished_at
                    ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                    : null
                  return (
                    <tr key={run.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700">
                        <div>
                          {new Date(run.started_at).toLocaleString('es-MX', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                        <div className="text-xs text-gray-400">
                          {run.triggered_by === 'cron' ? 'Automático' : 'Manual'}
                          {duration !== null && ` · ${duration}s`}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                          <Icon className={`h-3 w-3 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{run.accounts_upserted}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{run.policies_upserted}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={run.policies_cancelled > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}>
                          {run.policies_cancelled}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={run.renewals_created > 0 ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                          {run.renewals_created}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          className={run.error_count > 0
                            ? 'text-red-500 font-medium hover:underline'
                            : 'text-gray-400'}
                          onClick={() => run.error_count > 0 && setActiveTab('errores')}
                        >
                          {run.error_count}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Errores ─────────────────────────────────────────────────── */}
      {activeTab === 'errores' && (
        <SyncErrorTable runs={initialRuns} />
      )}

      {/* ── Tab: Conexión ────────────────────────────────────────────────── */}
      {activeTab === 'conexion' && (
        <div className="rounded-xl border bg-white shadow-sm p-6">
          <ConnectionConfigForm initialConfig={initialConnection} />
        </div>
      )}

      {/* ── Tab: Mapeos ──────────────────────────────────────────────────── */}
      {activeTab === 'mapeos' && (
        <div className="space-y-4">
          {/* Banner configuración rápida */}
          {!hasMappings ? (
            <div className="rounded-xl border bg-violet-50 border-violet-200 px-4 py-3 flex items-center gap-3">
              <Zap className="h-4 w-4 text-violet-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-violet-800">Sin mapeos configurados</p>
                <p className="text-xs text-violet-600 mt-0.5">
                  Carga los mapeos predeterminados para una BD de tabla única (Contratante, Documento, RFC, etc.)
                </p>
              </div>
              <Button
                size="sm"
                className="gap-2 shrink-0 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleSeedMappings}
                disabled={isPendingSeed}
              >
                {isPendingSeed
                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  : <Zap className="h-3.5 w-3.5" />}
                Cargar predeterminados
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="gap-2 text-xs text-gray-400 hover:text-violet-600 hover:bg-violet-50"
                onClick={handleSeedMappings}
                disabled={isPendingSeed}
              >
                {isPendingSeed
                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : <Zap className="h-3 w-3" />}
                Restaurar predeterminados
              </Button>
            </div>
          )}
          {seedError && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {seedError}
            </p>
          )}
          {seedOk && (
            <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Mapeos predeterminados cargados correctamente.
            </p>
          )}
          <FieldMappingEditor initialMappings={initialMappings} />
        </div>
      )}

      {/* ── Tab: Referencias ─────────────────────────────────────────────── */}
      {activeTab === 'referencias' && (
        <ReferenceResolver
          unresolvedErrors={initialErrors}
          referenceMaps={initialRefMaps}
          profiles={profiles}
        />
      )}
    </div>
  )
}
