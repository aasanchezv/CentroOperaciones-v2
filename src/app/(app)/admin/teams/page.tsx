import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createTeam, deleteTeam } from '@/app/actions/admin-actions'
import { Building2, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TeamSkillsDialog }    from './team-skills-dialog'
import { TeamSettingsDialog }  from './team-settings-dialog'

export default async function TeamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Equipos con conteo de miembros + team_skills en paralelo
  const [teamsResult, skillsResult] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, created_at, email_cc, vip_email_cc, profiles(count)')
      .order('created_at', { ascending: true }),
    supabase
      .from('team_skills')
      .select('team_id, module_id'),
  ])

  const teams = teamsResult.data

  // Agrupar skills por team_id
  const skillsByTeam = new Map<string, string[]>()
  for (const s of skillsResult.data ?? []) {
    const list = skillsByTeam.get(s.team_id) ?? []
    list.push(s.module_id)
    skillsByTeam.set(s.team_id, list)
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Equipos</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {teams?.length ?? 0} equipo{teams?.length !== 1 ? 's' : ''} configurados
        </p>
      </div>

      {/* Formulario crear equipo */}
      <form
        action={async (formData: FormData) => {
          'use server'
          const name = formData.get('name') as string
          if (name?.trim()) await createTeam(name)
        }}
        className="flex gap-2"
      >
        <Input name="name" placeholder="Nombre del equipo" required className="max-w-xs" />
        <Button type="submit" size="sm" className="gap-2 shrink-0">
          <Building2 className="h-4 w-4" />
          Crear equipo
        </Button>
      </form>

      {/* Lista de equipos */}
      <div className="space-y-2">
        {teams && teams.length > 0 ? (
          teams.map((team) => {
            const memberCount = Array.isArray(team.profiles)
              ? (team.profiles[0] as unknown as { count: number })?.count ?? 0
              : 0
            return (
              <div
                key={team.id}
                className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{team.name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {memberCount} miembro{memberCount !== 1 ? 's' : ''}
                      {(skillsByTeam.get(team.id) ?? []).length > 0 && (
                        <span className="ml-1 text-gray-300">·</span>
                      )}
                      {(skillsByTeam.get(team.id) ?? []).length > 0 && (
                        <span className="text-violet-500">
                          {(skillsByTeam.get(team.id) ?? []).length} módulos
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TeamSettingsDialog
                    teamId={team.id}
                    teamName={team.name}
                    emailCc={(team as Record<string, unknown>).email_cc as string | null ?? null}
                    vipEmailCc={(team as Record<string, unknown>).vip_email_cc as string | null ?? null}
                  />
                  <TeamSkillsDialog
                    teamId={team.id}
                    teamName={team.name}
                    skills={skillsByTeam.get(team.id) ?? []}
                  />
                  <form
                    action={async () => {
                      'use server'
                      await deleteTeam(team.id)
                    }}
                  >
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-dashed bg-gray-50 p-10 text-center">
            <Building2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No hay equipos aún</p>
            <p className="text-xs text-gray-300 mt-0.5">Crea el primero arriba</p>
          </div>
        )}
      </div>
    </div>
  )
}
