import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { InsurerCommissionAdmin } from './insurer-commission-admin'
import type { Insurer, CommissionCode } from '@/types/database.types'

export default async function AdminAseguradorasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'ops'].includes(profile.role)) redirect('/dashboard')

  const admin = createAdminClient()

  const [insurersRes, codesRes] = await Promise.all([
    admin.from('insurers').select('*').order('name'),
    admin.from('commission_codes').select('*').order('code'),
  ])

  const insurers = (insurersRes.data ?? []) as Insurer[]
  const allCodes = (codesRes.data ?? [])   as CommissionCode[]

  // Agrupar códigos por aseguradora
  const codesByInsurer: Record<string, CommissionCode[]> = {}
  for (const c of allCodes) {
    if (!codesByInsurer[c.insurer_id]) codesByInsurer[c.insurer_id] = []
    codesByInsurer[c.insurer_id].push(c)
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Directorio de Aseguradoras</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gestiona las aseguradoras y sus códigos de comisión. Los códigos se pueden vincular a cada póliza.
        </p>
      </div>

      <InsurerCommissionAdmin
        initialInsurers={insurers}
        initialCodesByInsurer={codesByInsurer}
      />
    </div>
  )
}
