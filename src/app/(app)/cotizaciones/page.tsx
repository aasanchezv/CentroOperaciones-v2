import { createClient }        from '@/lib/supabase/server'
import { createAdminClient }   from '@/lib/supabase/admin'
import { redirect }            from 'next/navigation'
import { CotizacionBoard }     from './cotizacion-board'
import { getQuotationStages }  from '@/app/actions/quotation-stage-actions'
import { getInternalRequesters } from '@/app/actions/cotizacion-actions'

export default async function CotizacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, team_id').eq('id', user.id).single()

  const role = profile?.role ?? 'readonly'
  if (role === 'readonly') redirect('/dashboard')

  const admin     = createAdminClient()
  const isManager = ['admin', 'ops', 'manager'].includes(role)

  const [stages, quotResult, accountsResult, requesters, slaRes] = await Promise.all([
    getQuotationStages(profile?.team_id ?? null),

    (isManager ? admin : supabase)
      .from('quotations')
      .select(`
        id, status, stage_id, insurer, branch, estimated_premium, notes, expires_at,
        delivery_due_at, probable_contractor, requester_is_contractor,
        created_at, updated_at, assigned_to,
        account:accounts!quotations_account_id_fkey(id, name),
        contact:contacts!quotations_contact_id_fkey(id, full_name),
        assignee:profiles!quotations_assigned_to_fkey(id, full_name),
        requester:internal_requesters!quotations_requested_by_id_fkey(id, name)
      `)
      .order('updated_at', { ascending: false }),

    supabase
      .from('accounts')
      .select('id, name')
      .eq('status', 'active')
      .order('name', { ascending: true })
      .limit(200),

    getInternalRequesters(),

    admin
      .from('app_settings')
      .select('value')
      .eq('key', 'quotation_sla_hours')
      .single(),
  ])

  const slaRaw  = slaRes.data?.value?.trim()
  const slaHours = slaRaw ? Number(slaRaw) : null

  return (
    <CotizacionBoard
      quotations={(quotResult.data ?? []) as unknown as Parameters<typeof CotizacionBoard>[0]['quotations']}
      accounts={accountsResult.data ?? []}
      requesters={requesters}
      slaHours={Number.isFinite(slaHours) ? slaHours : null}
      canCreate={role !== 'readonly'}
      canManage={['admin', 'ops'].includes(role)}
      stages={stages}
    />
  )
}
