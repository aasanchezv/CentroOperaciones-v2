import { redirect }                   from 'next/navigation'
import { createClient }               from '@/lib/supabase/server'
import { createAdminClient }          from '@/lib/supabase/admin'
import { getAllGtmContactsByInsurer }  from '@/app/actions/gtm-admin-actions'
import { GtmContactsAdmin }           from './gtm-contacts-admin'

export default async function AdminGoToMarketPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()

  const [insurersRes, contactsByInsurer] = await Promise.all([
    admin.from('insurers').select('id, name, logo_url').eq('is_active', true).order('name'),
    getAllGtmContactsByInsurer(),
  ])

  const insurers = insurersRes.data ?? []

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Admin Go to Market</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Contactos de aseguradoras para solicitudes de cotización Go-to-Market
        </p>
      </div>

      <GtmContactsAdmin
        insurers={insurers as { id: string; name: string; logo_url: string | null }[]}
        initialContactsByInsurer={contactsByInsurer}
      />
    </div>
  )
}
