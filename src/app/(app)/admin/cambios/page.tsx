import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ChangeLogClient }   from './change-log-client'

export default async function AdminCambiosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'ops'].includes(profile.role ?? '')) redirect('/dashboard')

  const admin = createAdminClient()

  const [eventsRes, teamsRes, actorsRes] = await Promise.all([
    admin
      .from('audit_events')
      .select(`
        id,
        actor_id,
        action,
        entity_type,
        payload,
        created_at,
        actor:profiles!actor_id(id, full_name, role)
      `)
      .order('created_at', { ascending: false })
      .limit(500),
    admin.from('teams').select('id, name').order('name'),
    admin.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ])

  const events = (eventsRes.data ?? []).map(e => ({
    id:          e.id as string,
    actor_id:    e.actor_id as string | null,
    action:      e.action as string,
    entity_type: e.entity_type as string,
    payload:     e.payload as Record<string, unknown> | null,
    created_at:  e.created_at as string,
    actor:       Array.isArray(e.actor)
      ? (e.actor[0] as { id: string; full_name: string | null; role: string | null } | undefined)
      : (e.actor as { id: string; full_name: string | null; role: string | null } | null),
  }))

  const teams  = (teamsRes.data  ?? []) as { id: string; name: string }[]
  const actors = (actorsRes.data ?? []) as { id: string; full_name: string | null }[]

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Bitácora de actividad</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Registro de toda la actividad de los usuarios en el sistema.
        </p>
      </div>
      <ChangeLogClient events={events} teams={teams} actors={actors} />
    </div>
  )
}
