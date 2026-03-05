import { Users, Building2, UserCheck, Activity, Briefcase } from 'lucide-react'

interface StatCardProps {
  label: string
  value: number | string
  icon:  React.ReactNode
  sub?:  string
}

function StatCard({ label, value, icon, sub }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className="rounded-lg bg-slate-50 p-2 text-slate-500">
          {icon}
        </div>
      </div>
    </div>
  )
}

interface AdminDashboardProps {
  totalUsers:     number
  activeUsers:    number
  totalTeams:     number
  totalAccounts:  number
  recentActivity: Array<{
    id:         string
    action:     string
    entity_type: string | null
    entity_id:   string | null
    payload:    Record<string, unknown> | null
    created_at: string
    profiles:   { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null
  }>
}

function actionLabel(action: string, payload: Record<string, unknown> | null): string {
  const map: Record<string, string> = {
    // Usuarios / equipos
    'user.invited':              `invitó a ${payload?.email ?? 'un usuario'}`,
    'user.name_changed':         'cambió nombre de usuario',
    'user.role_changed':         `cambió el rol a ${payload?.new_role ?? ''}`,
    'user.activated':            'activó un usuario',
    'user.deactivated':          'desactivó un usuario',
    'user.team_changed':         'cambió el equipo de un usuario',
    'team.created':              `creó el equipo "${payload?.name ?? ''}"`,
    'team.deleted':              'eliminó un equipo',
    // Cuentas / contactos
    'account.created':           `creó la cuenta "${payload?.name ?? ''}"`,
    'account.updated':           `actualizó la cuenta "${payload?.name ?? ''}"`,
    'account.deleted':           'eliminó una cuenta',
    'account.merge':             'fusionó cuentas',
    'account.bulk_deleted':      'eliminó cuentas en lote',
    'contact.created':           `agregó contacto "${payload?.full_name ?? ''}"`,
    'contact.updated':           'actualizó contacto',
    'contact.deleted':           'eliminó un contacto',
    // Pólizas
    'policy.created':            `creó póliza (${payload?.insurer ?? ''})`,
    'policy.deleted':            'eliminó una póliza',
    // Cotizaciones
    'quotation.created':              `creó cotización (${payload?.insurer ?? ''})`,
    'quotation.updated':              'actualizó cotización',
    'quotation.deleted':              'eliminó cotización',
    'quotation.status_changed':       `cambió estatus cotización`,
    'quotation.stage_changed':        'avanzó etapa de cotización',
    'quotation.converted_to_policy':  'convirtió cotización a póliza',
    // Renovaciones
    'renewal.started':           'inició proceso de renovación',
    'renewal.call_attempted':    'registró llamada de renovación',
    'renewal.policy_linked':     'vinculó nueva póliza a renovación',
    'renewal.closed':            `cerró renovación (${payload?.status ?? ''})`,
    // Cobranza
    'collection.sent':           'envió recordatorio de cobranza',
    // Tareas
    'task.created':              `creó tarea "${payload?.title ?? ''}"`,
    'task.status_changed':       'cambió estatus de tarea',
    'task.deleted':              'eliminó tarea',
    // Movimientos
    'movement.created':          'creó movimiento en póliza',
    'movement_type.created':     'creó tipo de movimiento',
    'movement_type.updated':     'actualizó tipo de movimiento',
    'movement_type.deleted':     'eliminó tipo de movimiento',
    // Captura / IA / Config
    'capture.run_saved':         'guardó captura de póliza (OCR)',
    'ai_config.updated':         'actualizó configuración de IA',
    'api_key.updated':           'actualizó clave de API',
    'config.create':             `creó configuración (${payload?.area ?? ''})`,
    'config.update':             `actualizó configuración (${payload?.area ?? ''})`,
    'config.delete':             `eliminó configuración (${payload?.area ?? ''})`,
  }
  return map[action] ?? action
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `hace ${days} día${days !== 1 ? 's' : ''}`
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export function AdminDashboard({
  totalUsers, activeUsers, totalTeams, totalAccounts, recentActivity,
}: AdminDashboardProps) {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Usuarios"
          value={totalUsers}
          icon={<Users className="h-5 w-5" />}
          sub={`${activeUsers} activos`}
        />
        <StatCard
          label="Activos"
          value={activeUsers}
          icon={<UserCheck className="h-5 w-5" />}
          sub={totalUsers ? `${Math.round((activeUsers / totalUsers) * 100)}% del total` : undefined}
        />
        <StatCard
          label="Equipos"
          value={totalTeams}
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatCard
          label="Cuentas"
          value={totalAccounts}
          icon={<Briefcase className="h-5 w-5" />}
        />
      </div>

      {/* Actividad reciente */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-700">Actividad reciente</h2>
        </div>
        {recentActivity.length > 0 ? (
          <ul className="space-y-3">
            {recentActivity.map((event) => {
              const actor = Array.isArray(event.profiles)
                ? event.profiles[0] as { full_name: string | null; email: string } | null
                : event.profiles as { full_name: string | null; email: string } | null
              const actorName = actor?.full_name ?? actor?.email ?? 'Sistema'
              const initial   = actorName.charAt(0).toUpperCase()
              const label     = actionLabel(event.action, event.payload)
              const timeAgo   = formatTimeAgo(new Date(event.created_at))

              return (
                <li key={event.id} className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0 mt-0.5 select-none">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{actorName}</span>
                      {' '}{label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-gray-300">
            <p className="text-sm">Sin actividad aún</p>
          </div>
        )}
      </div>
    </div>
  )
}
