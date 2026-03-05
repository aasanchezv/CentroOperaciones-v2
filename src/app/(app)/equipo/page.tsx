import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UsersRound }        from 'lucide-react'
import { TeamPresence, type MemberRow } from './team-presence'

export default async function EquipoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, team_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  const admin = createAdminClient()

  // Build query: admin/ops see everyone; others see all active users
  const { data: rows } = await admin
    .from('profiles')
    .select(`
      id, full_name, email, role, status, status_updated_at,
      team:teams(name)
    `)
    .eq('is_active', true)
    .neq('role', 'readonly')
    .order('full_name')

  const members: MemberRow[] = (rows ?? []).map((r) => {
    const rawTeam = r.team
    const team = (Array.isArray(rawTeam) ? rawTeam[0] : rawTeam) as { name: string } | null
    return {
      id:                r.id,
      full_name:         r.full_name,
      email:             r.email,
      role:              r.role,
      status:            (r.status as string) ?? 'offline',
      status_updated_at: r.status_updated_at as string | null,
      team_name:         team?.name ?? null,
    }
  })

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <UsersRound className="h-5 w-5 text-gray-400" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Equipo en línea</h1>
            <p className="text-xs text-gray-500">Estado actual de los usuarios — actualización en tiempo real</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <TeamPresence initialMembers={members} />
      </div>
    </div>
  )
}
