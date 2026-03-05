'use client'

import { useState, useTransition } from 'react'
import {
  CheckCircle2, AlertCircle, ExternalLink, Database,
  ShieldCheck, RefreshCw, Table2, Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveConnectionConfig } from '@/app/actions/sync-actions'
import type { ConnectionConfig } from '@/app/actions/sync-actions'

interface Props {
  initialConfig: ConnectionConfig
}

interface TestResult {
  ok:      boolean
  message: string
  details?: string
}

export function ConnectionConfigForm({ initialConfig }: Props) {
  const [cfg, setCfg]             = useState<ConnectionConfig>(initialConfig)
  const [isPending, startTransition] = useTransition()
  const [saveMsg, setSaveMsg]     = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [testing, setTesting]     = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  function update(field: keyof ConnectionConfig, value: string) {
    setCfg(prev => ({ ...prev, [field]: value }))
    setSaveMsg(null)
    setTestResult(null)
  }

  async function handleSave() {
    setSaveMsg(null)
    startTransition(async () => {
      try {
        await saveConnectionConfig(cfg)
        setSaveMsg({ type: 'success', text: 'Configuración guardada exitosamente.' })
      } catch (e) {
        setSaveMsg({ type: 'error', text: (e as Error).message })
      }
    })
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch('/api/admin/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true }),
      })
      const data = await res.json()

      if (!res.ok) {
        setTestResult({
          ok:      false,
          message: data.error ?? 'Error al conectar',
          details: res.status === 503
            ? 'La Edge Function aún no está desplegada. Despliégala con: supabase functions deploy sync-external-db --no-verify-jwt'
            : undefined,
        })
      } else if (data.dry_run) {
        const mapCount = Object.values(data.fieldMaps as Record<string, unknown[]>)
          .reduce((acc: number, arr) => acc + (arr as unknown[]).length, 0)
        setTestResult({
          ok:      true,
          message: `Conexión exitosa. ${mapCount} mapeo${mapCount !== 1 ? 's' : ''} de campos cargado${mapCount !== 1 ? 's' : ''}.`,
        })
      } else {
        setTestResult({ ok: true, message: 'Conexión OK.' })
      }
    } catch {
      setTestResult({ ok: false, message: 'No se pudo conectar. Verifica que la Edge Function esté desplegada.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Sección: Conexión a BD externa ─────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b">
          <Database className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-gray-700">Conexión a BD Externa (PostgreSQL)</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Host */}
          <div className="col-span-2 sm:col-span-1 space-y-1">
            <label className="text-xs font-medium text-gray-600">Host / IP</label>
            <input
              value={cfg.host}
              onChange={e => update('host', e.target.value)}
              placeholder="db.ejemplo.com  o  192.168.1.100"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {/* Puerto */}
          <div className="col-span-2 sm:col-span-1 space-y-1">
            <label className="text-xs font-medium text-gray-600">Puerto</label>
            <input
              value={cfg.port}
              onChange={e => update('port', e.target.value)}
              placeholder="5432"
              type="number"
              min="1"
              max="65535"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {/* Base de datos */}
          <div className="col-span-2 sm:col-span-1 space-y-1">
            <label className="text-xs font-medium text-gray-600">Nombre de la BD</label>
            <input
              value={cfg.database}
              onChange={e => update('database', e.target.value)}
              placeholder="murguia_central"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {/* Usuario */}
          <div className="col-span-2 sm:col-span-1 space-y-1">
            <label className="text-xs font-medium text-gray-600">Usuario</label>
            <input
              value={cfg.user}
              onChange={e => update('user', e.target.value)}
              placeholder="sync_reader"
              autoComplete="off"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {/* Contraseña — solo instrucciones */}
          <div className="col-span-2 space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <label className="text-xs font-medium text-gray-600">Contraseña</label>
            </div>
            <div className="flex items-start gap-3 rounded-lg border bg-emerald-50 border-emerald-200 px-3 py-2.5">
              <div className="flex-1">
                <p className="text-xs text-emerald-700">
                  La contraseña se guarda como <strong>Supabase Secret</strong> (no en base de datos).
                  Nunca aparece en el código ni en logs.
                </p>
                <p className="text-xs text-emerald-600 mt-1">
                  Para configurarla o actualizarla:
                </p>
                <ol className="text-xs text-emerald-600 mt-0.5 list-decimal list-inside space-y-0.5">
                  <li>
                    Supabase Dashboard → Edge Functions → Secrets
                    <a
                      href="https://supabase.com/dashboard/project/hocgbvfowkpufsiquozt/functions/sync-external-db/details"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 ml-1 text-emerald-700 hover:underline font-medium"
                    >
                      Abrir <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </li>
                  <li>Agregar secret: <code className="bg-emerald-100 px-1 rounded">SYNC_EXTERNAL_DB_PASSWORD</code></li>
                </ol>
                <p className="text-xs text-emerald-600 mt-1">
                  O por CLI: <code className="bg-emerald-100 px-1 rounded text-xs">supabase secrets set SYNC_EXTERNAL_DB_PASSWORD=&apos;tu-contraseña&apos;</code>
                </p>
              </div>
            </div>
          </div>

          {/* SSL */}
          <div className="col-span-2 flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.ssl === 'true'}
                onChange={e => update('ssl', e.target.checked ? 'true' : 'false')}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
            </label>
            <div>
              <p className="text-xs font-medium text-gray-600">Usar SSL / TLS</p>
              <p className="text-xs text-gray-400">Recomendado para conexiones remotas</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sección: Nombres de tablas ──────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b">
          <Table2 className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-gray-700">Tablas en la BD Externa</h3>
          <span className="text-xs text-gray-400">(nombres exactos tal como aparecen en la BD)</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {([
            { field: 'accountsTable' as const, label: 'Tabla de cuentas / clientes',    placeholder: 'clientes'  },
            { field: 'contactsTable' as const, label: 'Tabla de contactos',              placeholder: 'contactos' },
            { field: 'policiesTable' as const, label: 'Tabla de pólizas',               placeholder: 'polizas'   },
            { field: 'receiptsTable' as const, label: 'Tabla de recibos / cobranza',    placeholder: 'recibos'   },
          ]).map(({ field, label, placeholder }) => (
            <div key={field} className="space-y-1">
              <label className="text-xs font-medium text-gray-600">{label}</label>
              <input
                value={cfg[field]}
                onChange={e => update(field, e.target.value)}
                placeholder={placeholder}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Sección: Configuración del sync ────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b">
          <Settings className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-gray-700">Configuración del Sync</h3>
        </div>

        <div className="grid grid-cols-2 gap-4 items-start">
          {/* Sync habilitado */}
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.syncEnabled === 'true'}
                onChange={e => update('syncEnabled', e.target.checked ? 'true' : 'false')}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
            </label>
            <div>
              <p className="text-xs font-medium text-gray-600">Sync habilitado</p>
              <p className="text-xs text-gray-400">Deshabilitar para pausar el cron sin borrarlo</p>
            </div>
          </div>

          {/* Ventana de renovaciones */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">
              Ventana de renovaciones (días)
            </label>
            <div className="flex items-center gap-2">
              <input
                value={cfg.renewalWindow}
                onChange={e => update('renewalWindow', e.target.value)}
                type="number"
                min="1"
                max="365"
                className="w-20 border rounded-lg px-3 py-2 text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <p className="text-xs text-gray-400">
                Pólizas que vencen en este plazo sin renovación activa se auto-inician
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feedback + Botones ──────────────────────────────────────────── */}
      {saveMsg && (
        <div className={[
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          saveMsg.type === 'success'
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-red-700 bg-red-50 border-red-200',
        ].join(' ')}>
          {saveMsg.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertCircle  className="h-4 w-4 shrink-0 mt-0.5" />}
          {saveMsg.text}
        </div>
      )}

      {testResult && (
        <div className={[
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          testResult.ok
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-amber-700 bg-amber-50 border-amber-200',
        ].join(' ')}>
          {testResult.ok
            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertCircle  className="h-4 w-4 shrink-0 mt-0.5" />}
          <div>
            <p>{testResult.message}</p>
            {testResult.details && (
              <p className="mt-1 text-gray-500">{testResult.details}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button
          size="sm"
          className="gap-2"
          onClick={handleSave}
          disabled={isPending}
        >
          <CheckCircle2 className="h-4 w-4" />
          Guardar configuración
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleTest}
          disabled={testing || isPending}
          title="Intenta conectar a la BD externa usando la config guardada (dry run)"
        >
          {testing
            ? <RefreshCw className="h-4 w-4 animate-spin" />
            : <Database className="h-4 w-4" />}
          {testing ? 'Probando…' : 'Probar conexión'}
        </Button>
      </div>

      {/* Instrucciones de deploy */}
      <div className="rounded-lg border bg-slate-50 border-slate-200 px-4 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-slate-600">Pasos para activar el sync</p>
        <ol className="text-xs text-slate-500 list-decimal list-inside space-y-1">
          <li>Guarda esta configuración</li>
          <li>
            Configura el Secret de contraseña en Supabase Dashboard{' '}
            <a
              href="https://supabase.com/dashboard/project/hocgbvfowkpufsiquozt/functions/sync-external-db/details"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-700 hover:underline inline-flex items-center gap-0.5"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            Despliega la Edge Function:
            <code className="bg-slate-100 px-1.5 py-0.5 rounded ml-1 text-slate-700">
              supabase functions deploy sync-external-db --no-verify-jwt
            </code>
          </li>
          <li>Configura los mapeos de campos en la pestaña <strong>Mapeos</strong></li>
          <li>
            Prueba con &quot;Ejecutar ahora&quot;, después activa el cron nightly en Supabase
          </li>
        </ol>
      </div>
    </div>
  )
}
