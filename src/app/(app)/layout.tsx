import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sidebar }           from '@/components/shared/sidebar'
import { AgentProvider }     from '@/context/agent-context'
import { AgentBubble }       from '@/components/shared/agent-bubble'
import { OnlineTracker }     from '@/components/shared/online-tracker'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, role, team_id, status')
    .eq('id', user.id)
    .single()

  const displayEmail   = profile?.email ?? user.email ?? ''
  const displayInitial = (profile?.full_name ?? displayEmail).charAt(0).toUpperCase()
  const role           = (profile?.role ?? 'readonly') as string
  const userStatus     = (profile?.status as string | null) ?? 'offline'

  // Team skills — solo para agentes con equipo asignado
  let teamSkills: string[] = []
  if (role === 'agent' && profile?.team_id) {
    const { data: skills } = await supabase
      .from('team_skills')
      .select('module_id')
      .eq('team_id', profile.team_id)
    teamSkills = skills?.map(s => s.module_id) ?? []
  }

  const admin = createAdminClient()

  // Badge de mensajes no leídos en Contact Center
  let unreadCcCount = 0
  if (role !== 'readonly') {
    const isOps = ['admin','ops','manager'].includes(role)

    const query = admin
      .from('conversations')
      .select('unread_count')
      .neq('status', 'resolved')
      .gt('unread_count', 0)

    if (!isOps) {
      query.or(`assigned_to.eq.${user.id},assigned_to.is.null`)
    }

    const { data: unreadRows } = await query
    unreadCcCount = (unreadRows ?? []).reduce((acc, r) => acc + (r.unread_count ?? 0), 0)
  }

  // Copiloto IA — nombre del persona desde DB
  let personaName = 'Copiloto IA'
  if (role !== 'readonly') {
    const { data: agentConfig } = await admin
      .from('ai_tool_configs')
      .select('persona_name')
      .eq('tool_id', 'agente')
      .single()
    personaName = (agentConfig?.persona_name as string | null) ?? 'Copiloto IA'
  }

  return (
    <AgentProvider personaName={personaName}>
      <div className="flex h-screen bg-gray-50">
        <Sidebar
          userEmail={displayEmail}
          userInitial={displayInitial}
          userRole={role}
          userStatus={userStatus}
          unreadCcCount={unreadCcCount}
          teamSkills={teamSkills}
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      {role !== 'readonly' && <AgentBubble />}
      {role !== 'readonly' && <OnlineTracker />}
    </AgentProvider>
  )
}
