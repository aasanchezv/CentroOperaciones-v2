import { redirect }         from 'next/navigation'
import { createClient }     from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGtmProcesses }  from '@/app/actions/gtm-actions'
import { GtmPanel }         from './gtm-panel'

export default async function GoToMarketPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  const admin = createAdminClient()

  const [processes, insurersRes, profilesRes] = await Promise.all([
    getGtmProcesses(),
    admin.from('insurers').select('id, name, logo_url').eq('is_active', true).order('name'),
    admin.from('profiles').select('id, full_name').order('full_name'),
  ])

  const insurers = insurersRes.data ?? []
  const profiles  = profilesRes.data ?? []

  return (
    <div className="p-6 max-w-7xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Go to Market</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gestión autónoma de solicitudes de cotización a aseguradoras
        </p>
      </div>

      <GtmPanel
        initialProcesses={processes}
        insurers={insurers as { id: string; name: string; logo_url: string | null }[]}
        profiles={profiles as { id: string; full_name: string }[]}
        currentUserId={user.id}
        currentUserRole={profile.role}
      />
    </div>
  )
}
