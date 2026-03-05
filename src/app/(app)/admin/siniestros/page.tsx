import { redirect }             from 'next/navigation'
import { createClient }         from '@/lib/supabase/server'
import { ShieldAlert }          from 'lucide-react'
import { getInsurers }          from '@/app/actions/commission-actions'
import { getClaimImportRuns, getUnmatchedClaims } from '@/app/actions/claim-actions'
import { SiniestrosAdminClient } from './siniestros-admin-client'

export default async function AdminSiniestrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'ops'].includes(profile.role)) redirect('/dashboard')

  const [insurers, importRuns, unmatchedClaims] = await Promise.all([
    getInsurers(),
    getClaimImportRuns(),
    getUnmatchedClaims(),
  ])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-gray-400" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Siniestros</h1>
            <p className="text-xs text-gray-500">
              Importa reportes de aseguradoras y consulta el historial de siniestros por cliente
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <SiniestrosAdminClient
          insurers={insurers as { id: string; name: string; short_name: string | null }[]}
          importRuns={importRuns}
          unmatchedClaims={unmatchedClaims}
        />
      </div>
    </div>
  )
}
