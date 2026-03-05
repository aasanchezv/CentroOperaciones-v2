import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TaskBoard }         from './task-board'

export default async function TareasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  const admin = createAdminClient()
  const isElevated = ['admin', 'ops', 'manager'].includes(profile.role)

  // Fetch tasks:
  //  - Admin/ops/manager → todos (via admin client, sin restricción de RLS)
  //  - Agent → sus propios (RLS del cliente normal también los filtra)
  const { data: tasks } = await admin
    .from('tasks')
    .select(`
      id, title, description, source_type, source_id,
      insurer, due_date, status,
      assigned_to, created_by, account_id,
      created_at, updated_at,
      account:accounts!tasks_account_id_fkey(id, name, account_code)
    `)
    .order('created_at', { ascending: false })

  // Para agentes, filtramos en memoria (la RLS ya filtraría, pero admin client no aplica RLS)
  const visibleTasks = isElevated
    ? (tasks ?? [])
    : (tasks ?? []).filter(t => t.assigned_to === user.id || t.created_by === user.id)

  // Profiles para vista de equipo (solo si tiene acceso)
  const profiles = isElevated
    ? (await admin.from('profiles').select('id, full_name, email').eq('is_active', true)).data ?? []
    : []

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Mis tareas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tablero personal de pendientes</p>
      </div>
      <TaskBoard
        tasks={visibleTasks as unknown as Parameters<typeof TaskBoard>[0]['tasks']}
        profiles={profiles as unknown as Parameters<typeof TaskBoard>[0]['profiles']}
        currentUserId={user.id}
        userRole={profile.role}
      />
    </div>
  )
}
