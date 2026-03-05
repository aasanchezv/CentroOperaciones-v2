import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { InviteDialog } from './invite-dialog'
import { UserRowActions } from './user-row-actions'
import type { UserRole } from '@/types/database.types'

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin', ops: 'Ops', manager: 'Manager', agent: 'Agente', readonly: 'Solo lectura',
}

const roleBadgeClass: Record<UserRole, string> = {
  admin:    'bg-violet-100 text-violet-700 border-violet-200',
  ops:      'bg-blue-100 text-blue-700 border-blue-200',
  manager:  'bg-cyan-100 text-cyan-700 border-cyan-200',
  agent:    'bg-gray-100 text-gray-600 border-gray-200',
  readonly: 'bg-gray-50 text-gray-400 border-gray-100',
}

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (currentProfile?.role !== 'admin') redirect('/dashboard')

  const [{ data: users }, { data: teams }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, role, team_id, is_active, created_at, teams(name)')
      .order('created_at', { ascending: false }),
    supabase.from('teams').select('id, name').order('name'),
  ])

  const active = users?.filter(u => u.is_active).length ?? 0
  const total = users?.length ?? 0

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active} activos · {total} total
          </p>
        </div>
        <InviteDialog />
      </div>

      {/* Tabla */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80">
              <TableHead className="pl-4">Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users && users.length > 0 ? (
              users.map((u) => {
                const teamName = (Array.isArray(u.teams) ? u.teams[0] : u.teams as { name: string } | null)?.name
                return (
                  <TableRow key={u.id} className="group">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0 select-none">
                          {(u.full_name ?? u.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm leading-tight">
                            {u.full_name ?? <span className="text-gray-400 font-normal italic">Sin nombre</span>}
                          </p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${roleBadgeClass[u.role as UserRole]}`}>
                        {roleLabels[u.role as UserRole]}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {teamName ?? <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={u.is_active
                          ? 'text-emerald-600 border-emerald-200 bg-emerald-50'
                          : 'text-gray-400 border-gray-200 bg-gray-50'
                        }
                      >
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-400">
                      {new Date(u.created_at).toLocaleDateString('es-MX', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="pr-2">
                      <UserRowActions
                        userId={u.id}
                        currentRole={u.role as UserRole}
                        currentTeamId={u.team_id ?? null}
                        currentName={u.full_name ?? null}
                        isActive={u.is_active}
                        isSelf={u.id === user.id}
                        teams={teams ?? []}
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <p className="text-sm">No hay usuarios aún</p>
                    <p className="text-xs">Invita al primer miembro del equipo</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
