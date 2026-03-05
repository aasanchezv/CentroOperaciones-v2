import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getSyncRuns, getLastSyncRun, getSyncFieldMappings,
  getUnresolvedReferences, getSyncReferenceMaps, getConnectionConfig,
} from '@/app/actions/sync-actions'
import { SyncClient }  from './sync-client'
import { DatabaseZap } from 'lucide-react'

export default async function AdminSyncPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'ops'].includes(profile?.role ?? '')) redirect('/dashboard')

  // Cargar todo en paralelo
  const [runs, lastRun, mappings, unresolvedErrors, refMaps, connectionConfig, profilesResult] = await Promise.all([
    getSyncRuns(30),
    getLastSyncRun(),
    getSyncFieldMappings(),
    getUnresolvedReferences(),
    getSyncReferenceMaps(),
    getConnectionConfig(),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'agent')
      .order('full_name', { ascending: true }),
  ])

  const profiles = (profilesResult.data ?? []) as { id: string; full_name: string | null; email: string | null }[]

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-5 w-5 text-slate-600" />
          <h1 className="text-lg font-semibold text-gray-900">Sincronización de Datos Externos</h1>
        </div>
        <p className="text-sm text-gray-500">
          Importa cuentas, contactos, pólizas y recibos desde la BD central. Los datos locales (notas, etapas, VIP) nunca se sobreescriben.
        </p>
      </div>

      {/* Status banner — último run */}
      {lastRun && (
        <div className={[
          'rounded-xl border px-4 py-3 flex items-center gap-3',
          lastRun.status === 'success' ? 'bg-emerald-50 border-emerald-200' :
          lastRun.status === 'partial' ? 'bg-amber-50 border-amber-200'  :
          lastRun.status === 'failed'  ? 'bg-red-50 border-red-200'      :
          'bg-blue-50 border-blue-200',
        ].join(' ')}>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              Último sync:{' '}
              <span className={
                lastRun.status === 'success' ? 'text-emerald-700' :
                lastRun.status === 'partial' ? 'text-amber-700'   :
                lastRun.status === 'failed'  ? 'text-red-700'     :
                'text-blue-700'
              }>
                {lastRun.status === 'success' ? 'Exitoso' :
                 lastRun.status === 'partial' ? 'Parcial (con errores)' :
                 lastRun.status === 'failed'  ? 'Fallido' :
                 'En proceso…'}
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date(lastRun.started_at).toLocaleString('es-MX', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              {lastRun.status !== 'running' && (
                <> · {lastRun.policies_upserted} pólizas · {lastRun.accounts_upserted} cuentas
                {lastRun.policies_cancelled > 0 && <> · {lastRun.policies_cancelled} canceladas</>}
                {lastRun.renewals_created > 0 && <> · {lastRun.renewals_created} renovaciones iniciadas</>}
                {lastRun.error_count > 0 && <span className="text-red-500"> · {lastRun.error_count} errores</span>}</>
              )}
            </p>
          </div>
        </div>
      )}

      {!lastRun && (
        <div className="rounded-xl border bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-500">
            Aún no se ha ejecutado ningún sync. Configura la <strong>Conexión</strong>, luego los <strong>Mapeos</strong> y ejecuta el primero.
          </p>
        </div>
      )}

      {/* Client: tabs + trigger + polling */}
      <SyncClient
        initialRuns={runs}
        lastRunId={lastRun?.id ?? null}
        initialMappings={mappings}
        initialErrors={unresolvedErrors}
        initialRefMaps={refMaps}
        profiles={profiles}
        initialConnection={connectionConfig}
      />
    </div>
  )
}
