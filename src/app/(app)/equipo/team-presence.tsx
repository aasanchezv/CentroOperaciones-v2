'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  return `hace ${days} día${days !== 1 ? 's' : ''}`
}

export interface MemberRow {
  id:                string
  full_name:         string | null
  email:             string
  role:              string
  status:            string
  status_updated_at: string | null
  team_name:         string | null
}

const statusDot: Record<string, string> = {
  online:  'bg-emerald-500',
  busy:    'bg-amber-400',
  offline: 'bg-gray-300',
}
const statusLabel: Record<string, string> = {
  online:  'En línea',
  busy:    'Ocupado',
  offline: 'Desconectado',
}
const roleLabel: Record<string, string> = {
  admin:    'Admin',
  ops:      'Operaciones',
  manager:  'Manager',
  agent:    'Agente',
  readonly: 'Solo lectura',
}

const statusOrder: Record<string, number> = { online: 0, busy: 1, offline: 2 }

interface Props {
  initialMembers: MemberRow[]
}

export function TeamPresence({ initialMembers }: Props) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers)
  const supabase = createClient()

  useEffect(() => {
    const ch = supabase
      .channel('team-presence')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updated = payload.new as Partial<MemberRow> & { id: string }
          setMembers(prev =>
            prev.map(m =>
              m.id === updated.id
                ? {
                    ...m,
                    status:            updated.status            ?? m.status,
                    status_updated_at: updated.status_updated_at ?? m.status_updated_at,
                  }
                : m
            )
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sorted = [...members].sort((a, b) => {
    const sDiff = (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2)
    if (sDiff !== 0) return sDiff
    return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'es')
  })

  const onlineCount = members.filter(m => m.status === 'online').length
  const busyCount   = members.filter(m => m.status === 'busy').length

  return (
    <div>
      {/* Summary chips */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-emerald-700">{onlineCount} en línea</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="text-xs font-medium text-amber-700">{busyCount} ocupado{busyCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-gray-50 border border-gray-200 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
          <span className="text-xs font-medium text-gray-500">{members.length - onlineCount - busyCount} desconectado{members.length - onlineCount - busyCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuario</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Equipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actualizado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(m => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                {/* Avatar + name */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-xs font-semibold text-white">
                        {(m.full_name ?? m.email).charAt(0).toUpperCase()}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${statusDot[m.status] ?? 'bg-gray-300'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{m.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </div>
                  </div>
                </td>

                {/* Role */}
                <td className="px-4 py-3 text-gray-600">
                  {roleLabel[m.role] ?? m.role}
                </td>

                {/* Team */}
                <td className="px-4 py-3 text-gray-500">
                  {m.team_name ?? <span className="text-gray-300">—</span>}
                </td>

                {/* Status badge */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    m.status === 'online'  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    m.status === 'busy'    ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                             'bg-gray-50 text-gray-500 border border-gray-200'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDot[m.status] ?? 'bg-gray-300'}`} />
                    {statusLabel[m.status] ?? m.status}
                  </span>
                </td>

                {/* Last updated */}
                <td className="px-4 py-3 text-xs text-gray-400">
                  {m.status_updated_at
                    ? timeAgo(m.status_updated_at)
                    : '—'
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
