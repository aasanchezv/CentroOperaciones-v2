'use client'

import { useState, useMemo } from 'react'
import { Activity, Search } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface ChangeEvent {
  id:          string
  actor_id:    string | null
  action:      string
  entity_type: string
  payload:     Record<string, unknown> | null
  created_at:  string
  actor:       { id: string; full_name: string | null; role: string | null } | null | undefined
}

interface Team   { id: string; name: string }
interface Actor  { id: string; full_name: string | null }

interface Props {
  events: ChangeEvent[]
  teams:  Team[]
  actors: Actor[]
}

// ─── Categorías y labels ──────────────────────────────────────

const AREA_BY_PREFIX: Record<string, string> = {
  'user':          'Usuarios',
  'team':          'Equipos',
  'account':       'Cuentas',
  'contact':       'Contactos',
  'policy':        'Pólizas',
  'quotation':     'Cotizaciones',
  'renewal':       'Renovaciones',
  'collection':    'Cobranza',
  'task':          'Tareas',
  'movement':      'Movimientos',
  'movement_type': 'Movimientos',
  'capture':       'Captura IA',
  'ai_config':     'Config IA',
  'api_key':       'Config IA',
  'config':        'Configuración',
}

function getArea(action: string, payload: Record<string, unknown> | null): string {
  // config.* actions have an 'area' in payload
  if (action.startsWith('config.') && payload?.area) {
    const areaMap: Record<string, string> = {
      renovaciones: 'Renovaciones · Config',
      cobranza:     'Cobranza · Config',
      cotizaciones: 'Cotizaciones · Config',
      polizas:      'Pólizas · Config',
      plantillas:   'Plantillas',
    }
    return areaMap[payload.area as string] ?? String(payload.area)
  }
  const prefix = action.split('.')[0]
  return AREA_BY_PREFIX[prefix] ?? action
}

const AREA_COLORS: Record<string, string> = {
  'Usuarios':              'bg-violet-50 text-violet-700',
  'Equipos':               'bg-violet-50 text-violet-700',
  'Cuentas':               'bg-blue-50 text-blue-700',
  'Contactos':             'bg-blue-50 text-blue-700',
  'Pólizas':               'bg-indigo-50 text-indigo-700',
  'Cotizaciones':          'bg-cyan-50 text-cyan-700',
  'Renovaciones':          'bg-emerald-50 text-emerald-700',
  'Cobranza':              'bg-orange-50 text-orange-700',
  'Tareas':                'bg-yellow-50 text-yellow-700',
  'Movimientos':           'bg-slate-100 text-slate-700',
  'Captura IA':            'bg-purple-50 text-purple-700',
  'Config IA':             'bg-purple-50 text-purple-700',
  'Configuración':         'bg-gray-100 text-gray-700',
}

function getActionLabel(action: string, payload: Record<string, unknown> | null): string {
  const labels: Record<string, string> = {
    // Usuarios / equipos
    'user.invited':              `Invitó a ${payload?.email ?? 'usuario'}`,
    'user.name_changed':         'Cambió nombre',
    'user.role_changed':         `Cambió rol → ${payload?.new_role ?? ''}`,
    'user.activated':            'Activó usuario',
    'user.deactivated':          'Desactivó usuario',
    'user.team_changed':         'Cambió equipo',
    'team.created':              `Creó equipo "${payload?.name ?? ''}"`,
    'team.deleted':              'Eliminó equipo',
    // Cuentas
    'account.created':           `Creó cuenta "${payload?.name ?? ''}"`,
    'account.updated':           `Actualizó cuenta "${payload?.name ?? ''}"`,
    'account.deleted':           'Eliminó cuenta',
    'account.merge':             'Fusionó cuentas',
    'account.bulk_deleted':      `Eliminó ${payload?.count ?? ''} cuentas`,
    // Contactos
    'contact.created':           `Agregó contacto "${payload?.full_name ?? ''}"`,
    'contact.updated':           'Actualizó contacto',
    'contact.deleted':           'Eliminó contacto',
    // Pólizas
    'policy.created':            `Creó póliza · ${payload?.insurer ?? ''} ${payload?.branch ?? ''}`,
    'policy.deleted':            'Eliminó póliza',
    // Cotizaciones
    'quotation.created':              `Creó cotización · ${payload?.insurer ?? ''}`,
    'quotation.updated':              'Actualizó cotización',
    'quotation.deleted':              'Eliminó cotización',
    'quotation.status_changed':       `Cambió estatus cotización → ${payload?.new_status ?? ''}`,
    'quotation.stage_changed':        'Avanzó etapa de cotización',
    'quotation.converted_to_policy':  'Convirtió cotización a póliza',
    // Renovaciones
    'renewal.started':           'Inició renovación',
    'renewal.call_attempted':    `Registró llamada #${payload?.attempt ?? ''}`,
    'renewal.policy_linked':     'Vinculó póliza a renovación',
    'renewal.closed':            `Cerró renovación → ${payload?.status ?? ''}`,
    // Cobranza
    'collection.sent':           'Envió recordatorio de cobranza',
    // Tareas
    'task.created':              `Creó tarea "${payload?.title ?? ''}"`,
    'task.status_changed':       `Cambió tarea → ${payload?.new_status ?? ''}`,
    'task.deleted':              'Eliminó tarea',
    // Movimientos
    'movement.created':          'Creó movimiento en póliza',
    'movement_type.created':     `Creó tipo movimiento "${payload?.name ?? ''}"`,
    'movement_type.updated':     'Actualizó tipo movimiento',
    'movement_type.deleted':     'Eliminó tipo movimiento',
    // Captura / IA / Config
    'capture.run_saved':         'Guardó captura OCR',
    'ai_config.updated':         'Actualizó config IA',
    'api_key.updated':           'Actualizó clave API',
    'config.create':             `Creó · ${payload?.name ?? payload?.area ?? ''}`,
    'config.update':             `Actualizó · ${payload?.name ?? payload?.area ?? ''}`,
    'config.delete':             `Eliminó configuración`,
  }
  return labels[action] ?? action
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

const ALL_AREAS = Array.from(new Set(Object.values(AREA_BY_PREFIX))).sort()

// ─── ChangeLogClient ──────────────────────────────────────────

export function ChangeLogClient({ events, teams, actors }: Props) {
  const [filterArea,   setFilterArea]   = useState('all')
  const [filterActor,  setFilterActor]  = useState('all')
  const [filterTeamId, setFilterTeamId] = useState('all')
  const [query,        setQuery]        = useState('')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)

  const q = query.trim().toLowerCase()

  const filtered = useMemo(() =>
    events.filter(e => {
      const area   = getArea(e.action, e.payload)
      const teamId = (e.payload?.team_id as string | null) ?? null
      if (filterArea   !== 'all' && !area.startsWith(filterArea)) return false
      if (filterActor  !== 'all' && (e.actor_id ?? '') !== filterActor) return false
      if (filterTeamId !== 'all') {
        if (filterTeamId === '__global__') { if (teamId !== null) return false }
        else { if (teamId !== filterTeamId) return false }
      }
      if (q) {
        const actorName = e.actor?.full_name?.toLowerCase() ?? ''
        const label     = getActionLabel(e.action, e.payload).toLowerCase()
        if (!actorName.includes(q) && !label.includes(q) && !e.action.includes(q)) return false
      }
      return true
    }),
    [events, filterArea, filterActor, filterTeamId, q]
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar usuario o acción…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20 w-56"
          />
        </div>

        {/* Area */}
        <select
          value={filterArea}
          onChange={e => setFilterArea(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          <option value="all">Todas las áreas</option>
          {ALL_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {/* Actor (user) */}
        <select
          value={filterActor}
          onChange={e => setFilterActor(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          <option value="all">Todos los usuarios</option>
          {actors.map(a => (
            <option key={a.id} value={a.id}>{a.full_name ?? a.id.slice(0, 8)}</option>
          ))}
        </select>

        {/* Team */}
        <select
          value={filterTeamId}
          onChange={e => setFilterTeamId(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          <option value="all">Todos los equipos</option>
          <option value="__global__">Global</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <span className="text-xs text-gray-400 ml-auto">
          {filtered.length} {filtered.length === 1 ? 'evento' : 'eventos'}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center">
          <Activity className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Sin actividad para los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Usuario</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Área</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Acción</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(event => {
                const area       = getArea(event.action, event.payload)
                const areaColor  = AREA_COLORS[area.split(' · ')[0]] ?? 'bg-gray-100 text-gray-600'
                const label      = getActionLabel(event.action, event.payload)
                const isExpanded = expandedId === event.id

                return (
                  <>
                    <tr
                      key={event.id}
                      className="hover:bg-gray-50/60 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    >
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDate(event.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">
                          {event.actor?.full_name ?? '—'}
                        </span>
                        {event.actor?.role && (
                          <span className="ml-1 text-xs text-gray-400">({event.actor.role})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${areaColor}`}>
                          {area}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                        {label}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs">
                        {isExpanded ? '▲' : '▼'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${event.id}-detail`} className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-3">
                          <pre className="text-xs text-gray-600 bg-white rounded border p-3 overflow-x-auto max-h-40">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
