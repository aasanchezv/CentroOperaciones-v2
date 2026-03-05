'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface LogrosSummary {
  renewalsDone:         number
  renewalsPremiumSum:   number
  quotationsSent:       number
  quotationsWon:        number
  quotationsPremiumSum: number
  collectionsSent:      number
  tasksDone:            number
}

export type TimelineItemType = 'renewal' | 'quotation' | 'collection' | 'task'

export interface TimelineItem {
  id:          string
  type:        TimelineItemType
  title:       string
  subtitle:    string
  amount:      number | null
  date:        string
  statusLabel: string
  statusClass: string
}

export interface LogrosData {
  summary:  LogrosSummary
  timeline: TimelineItem[]
}

/**
 * Obtiene los logros del usuario en el rango de fechas indicado.
 * Solo admins pueden consultar por un userId diferente al propio.
 */
export async function getLogros(
  targetUserId: string | null,   // null → usa el usuario actual
  startDate:    string,           // ISO string inicio
  endDate:      string,           // ISO string fin
): Promise<LogrosData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const isAdmin = ['admin', 'ops', 'manager'].includes(profile?.role ?? '')
  const userId  = (targetUserId && isAdmin) ? targetUserId : user.id

  const admin = createAdminClient()

  const [renewalsResult, quotationsResult, collectionsResult, tasksResult] = await Promise.all([
    // Renovaciones en estado terminal dentro del período
    admin
      .from('renewals')
      .select(`
        id, status, updated_at,
        account:accounts!renewals_account_id_fkey(name),
        new_policy:policies!renewals_new_policy_id_fkey(premium)
      `)
      .eq('assigned_to', userId)
      .in('status', ['renewed_paid', 'renewed_pending_payment', 'changes_requested', 'cancelled'])
      .gte('updated_at', startDate)
      .lte('updated_at', endDate)
      .order('updated_at', { ascending: false }),

    // Cotizaciones creadas en el período
    admin
      .from('quotations')
      .select(`
        id, status, estimated_premium, created_at, updated_at,
        account:accounts!quotations_account_id_fkey(name),
        insurer, branch
      `)
      .eq('assigned_to', userId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false }),

    // Cobros enviados en el período
    admin
      .from('collection_sends')
      .select(`
        id, channel, template_name, created_at,
        account:accounts!collection_sends_account_id_fkey(name)
      `)
      .eq('sent_by', userId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false }),

    // Tareas completadas en el período
    admin
      .from('tasks')
      .select(`
        id, title, status, updated_at,
        account:accounts!tasks_account_id_fkey(name)
      `)
      .eq('assigned_to', userId)
      .eq('status', 'done')
      .gte('updated_at', startDate)
      .lte('updated_at', endDate)
      .order('updated_at', { ascending: false }),
  ])

  const renewals    = renewalsResult.data    ?? []
  const quotations  = quotationsResult.data  ?? []
  const collections = collectionsResult.data ?? []
  const tasks       = tasksResult.data       ?? []

  // ── KPIs ─────────────────────────────────────────────────
  const paidRenewals        = renewals.filter(r => r.status === 'renewed_paid')
  const renewalsPremiumSum  = paidRenewals.reduce((acc, r) => {
    const p = r.new_policy as unknown as { premium: number | null } | null
    return acc + (p?.premium ?? 0)
  }, 0)

  const quotationsWon       = quotations.filter(q => q.status === 'ganada')
  const quotationsSent      = quotations.filter(q => ['enviada', 'ganada', 'perdida'].includes(q.status)).length
  const quotationsPremiumSum = quotationsWon.reduce((acc, q) => acc + (q.estimated_premium ?? 0), 0)

  const summary: LogrosSummary = {
    renewalsDone:         paidRenewals.length,
    renewalsPremiumSum,
    quotationsSent,
    quotationsWon:        quotationsWon.length,
    quotationsPremiumSum,
    collectionsSent:      collections.length,
    tasksDone:            tasks.length,
  }

  // ── Timeline ─────────────────────────────────────────────
  type AccountJoin  = { name: string } | null
  type PolicyJoin   = { premium: number | null } | null

  const timeline: TimelineItem[] = [
    ...paidRenewals.map(r => ({
      id:          r.id,
      type:        'renewal' as TimelineItemType,
      title:       'Renovación pagada',
      subtitle:    (r.account as unknown as AccountJoin)?.name ?? '',
      amount:      (r.new_policy as unknown as PolicyJoin)?.premium ?? null,
      date:        r.updated_at,
      statusLabel: 'Pagada',
      statusClass: 'text-emerald-600',
    })),
    ...renewals.filter(r => r.status !== 'renewed_paid').map(r => ({
      id:          r.id,
      type:        'renewal' as TimelineItemType,
      title:       r.status === 'cancelled' ? 'Renovación cancelada' : 'Renovación cerrada',
      subtitle:    (r.account as unknown as AccountJoin)?.name ?? '',
      amount:      null,
      date:        r.updated_at,
      statusLabel: r.status === 'cancelled' ? 'Cancelada' : 'Cerrada',
      statusClass: r.status === 'cancelled' ? 'text-red-600' : 'text-amber-600',
    })),
    ...quotations.map(q => ({
      id:          q.id,
      type:        'quotation' as TimelineItemType,
      title:       q.status === 'ganada' ? 'Cotización ganada' : q.status === 'perdida' ? 'Cotización perdida' : 'Cotización enviada',
      subtitle:    `${(q.account as unknown as AccountJoin)?.name ?? ''} · ${q.insurer ?? ''}`.replace(/^ · | · $/, ''),
      amount:      q.estimated_premium,
      date:        q.created_at,
      statusLabel: q.status,
      statusClass: q.status === 'ganada' ? 'text-emerald-600' : q.status === 'perdida' ? 'text-red-600' : 'text-blue-600',
    })),
    ...collections.map(c => ({
      id:          c.id,
      type:        'collection' as TimelineItemType,
      title:       `Cobro enviado`,
      subtitle:    (c.account as unknown as AccountJoin)?.name ?? '',
      amount:      null,
      date:        c.created_at,
      statusLabel: c.channel === 'whatsapp' ? 'WhatsApp' : c.channel === 'email' ? 'Email' : 'Enviado',
      statusClass: 'text-sky-600',
    })),
    ...tasks.map(t => ({
      id:          t.id,
      type:        'task' as TimelineItemType,
      title:       'Tarea completada',
      subtitle:    t.title,
      amount:      null,
      date:        t.updated_at,
      statusLabel: 'Completada',
      statusClass: 'text-violet-600',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return { summary, timeline }
}

/**
 * Devuelve la lista de usuarios que el admin/manager puede ver en el selector
 * de "Ver logros de:" en la página /mis-logros.
 */
export async function getAgentsList() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles').select('role, team_id').eq('id', user.id).single()

  if (!['admin', 'ops', 'manager'].includes(profile?.role ?? '')) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('is_active', true)
    .in('role', ['admin', 'ops', 'manager', 'agent'])
    .order('full_name', { ascending: true })

  return data ?? []
}
