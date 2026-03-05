import { redirect }           from 'next/navigation'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'
import { MesaControlSettings }  from './mesa-control-settings'
import { CobranzaStagesAdmin }  from './cobranza-stages-admin'
import { getAllCobranzaStagesGrouped } from '@/app/actions/cobranza-receipt-actions'

export default async function AdminCobranzaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()

  const [{ global: globalStages, byTeam }, teamsRes, settingsRes, templatesRes] = await Promise.all([
    getAllCobranzaStagesGrouped(),
    admin.from('teams').select('id, name').order('name'),
    admin.from('app_settings')
      .select('key, value')
      .in('key', ['mesa_control_email', 'cobranza_semaforo_red', 'cobranza_semaforo_yellow']),
    admin.from('collection_templates').select('id, name, channel, conducto_cobro_filter').order('name'),
  ])

  const settingsMap = Object.fromEntries(
    (settingsRes.data ?? []).map(s => [s.key, s.value as string | null])
  )

  const semaforoRed    = parseInt(settingsMap['cobranza_semaforo_red']    ?? '3')
  const semaforoYellow = parseInt(settingsMap['cobranza_semaforo_yellow'] ?? '1')

  const teams     = teamsRes.data ?? []
  const templates = (templatesRes.data ?? []).map(t => ({
    id:                   t.id,
    name:                 t.name,
    channel:              t.channel ?? 'email',
    conducto_cobro_filter: (t as Record<string, unknown>).conducto_cobro_filter as string | null ?? null,
  }))

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Configuración de Cobranza</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Etapas de cobranza y configuración de Mesa de Control.
          Los correos CC y la meta de ingresos se configuran por equipo en <strong>Admin → Equipos</strong>.
        </p>
      </div>

      <MesaControlSettings initialEmail={settingsMap['mesa_control_email'] ?? null} />

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Etapas de cobranza</h2>
        <p className="text-xs text-gray-500 mb-4">
          Configura las etapas que sigue un recibo desde el primer aviso hasta el cobro.
        </p>
        <CobranzaStagesAdmin
          globalStages={globalStages}
          byTeam={byTeam}
          teams={teams}
          templates={templates}
          semaforoRed={isNaN(semaforoRed) ? 3 : semaforoRed}
          semaforoYellow={isNaN(semaforoYellow) ? 1 : semaforoYellow}
        />
      </div>
    </div>
  )
}
