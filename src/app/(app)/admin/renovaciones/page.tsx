import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { Settings2 }         from 'lucide-react'
import { RenewalStagesAdmin }   from './renewal-stages-admin'
import { SemaphoreConfig }      from './semaphore-config'
import { getAllRenewalStagesGrouped, getSemaphoreSettings } from '@/app/actions/renewal-actions'

export default async function AdminRenovacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()

  const [{ global: globalStages, byTeam }, teamsRes, templatesRes, semaphore] = await Promise.all([
    getAllRenewalStagesGrouped(),
    admin.from('teams').select('id, name').order('name'),
    admin
      .from('collection_templates')
      .select('id, name, channel')
      .eq('type', 'renovacion')
      .eq('is_active', true)
      .order('name'),
    getSemaphoreSettings(),
  ])

  const teams     = teamsRes.data ?? []
  const templates = templatesRes.data ?? []

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Configuración de Renovaciones</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Define los stages, tiempos y acciones del pipeline de renovación
        </p>
      </div>

      <div className="rounded-xl border bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5 pb-4 border-b">
          <Settings2 className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-700">Stages del pipeline</h2>
          <span className="ml-1 text-xs text-gray-400">(arrastra para reordenar)</span>
        </div>
        <RenewalStagesAdmin
          globalStages={globalStages}
          byTeam={byTeam}
          teams={teams}
          templates={templates}
        />
      </div>

      {/* Semaphore config */}
      <SemaphoreConfig settings={semaphore} />
    </div>
  )
}
