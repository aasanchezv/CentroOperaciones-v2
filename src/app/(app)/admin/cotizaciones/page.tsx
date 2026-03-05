import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { QuotationStagesAdmin } from './quotation-stages-admin'
import { RequestersAdmin }   from './requesters-admin'
import { getAllQuotationStagesGrouped } from '@/app/actions/quotation-stage-actions'
import { getAllInternalRequesters }     from '@/app/actions/cotizacion-actions'

export default async function AdminCotizacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()

  const [{ global: globalStages, byTeam }, teamsRes, requesters, slaRes] = await Promise.all([
    getAllQuotationStagesGrouped(),
    admin.from('teams').select('id, name').order('name'),
    getAllInternalRequesters(),
    admin.from('app_settings').select('value').eq('key', 'quotation_sla_hours').single(),
  ])

  const teams    = teamsRes.data ?? []
  const slaHours = slaRes.data?.value ?? null

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Configuración de Cotizaciones</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gestiona stages del kanban, solicitantes internos y SLA de entrega.
        </p>
      </div>

      <RequestersAdmin
        initialRequesters={requesters}
        initialSlaHours={slaHours}
      />

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Stages del kanban</h2>
        <div className="rounded-xl border bg-white shadow-sm p-6">
          <QuotationStagesAdmin
            globalStages={globalStages}
            byTeam={byTeam}
            teams={teams}
          />
        </div>
      </div>
    </div>
  )
}
