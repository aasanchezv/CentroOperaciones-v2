import { createClient }              from '@/lib/supabase/server'
import { redirect }                   from 'next/navigation'
import { getLogros, getAgentsList }   from '@/app/actions/logros-actions'
import { LogrosClient }               from './logros-client'

// ─── Period helpers ───────────────────────────────────────────

function getPeriodDates(period: string): { startDate: string; endDate: string } {
  const now  = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  if (period === 'today') {
    const end = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
    return { startDate: today.toISOString(), endDate: end.toISOString() }
  }

  if (period === 'week') {
    const day    = today.getUTCDay()                // 0=Dom, 1=Lun …
    const monday = new Date(today)
    monday.setUTCDate(today.getUTCDate() - (day === 0 ? 6 : day - 1))
    return { startDate: monday.toISOString(), endDate: now.toISOString() }
  }

  if (period === 'year') {
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    return { startDate: yearStart.toISOString(), endDate: now.toISOString() }
  }

  // default: month
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { startDate: monthStart.toISOString(), endDate: now.toISOString() }
}

// ─── Page ─────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ period?: string; userId?: string }>
}

export default async function MisLogrosPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const role    = profile?.role ?? 'readonly'
  const isAdmin = ['admin', 'ops', 'manager'].includes(role)

  const { period = 'month', userId } = await searchParams

  // Solo admin/manager puede ver logros de otro usuario
  const targetUserId = (userId && isAdmin) ? userId : user.id
  const { startDate, endDate } = getPeriodDates(period)

  const [data, agents] = await Promise.all([
    getLogros(targetUserId !== user.id ? targetUserId : null, startDate, endDate),
    isAdmin ? getAgentsList() : Promise.resolve([]),
  ])

  return (
    <LogrosClient
      data={data}
      agents={agents}
      isAdmin={isAdmin}
      currentUserId={user.id}
    />
  )
}
