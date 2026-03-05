import { redirect }             from 'next/navigation'
import { createClient }         from '@/lib/supabase/server'
import { createAdminClient }    from '@/lib/supabase/admin'
import { ArrowLeftRight }       from 'lucide-react'
import { getMyMovements }       from '@/app/actions/movement-actions'
import { MovementsClient }      from './movements-client'

export default async function MovimientosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  // Fetch all movements for this user (scoped by role in action)
  const movements = await getMyMovements()

  // Fetch insurers for email pre-population
  const admin = createAdminClient()
  const { data: insurers } = await admin
    .from('insurers')
    .select('id, name, short_name, email')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-5 w-5 text-gray-400" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Movimientos</h1>
            <p className="text-xs text-gray-500">
              {['admin', 'ops'].includes(profile.role)
                ? 'Todos los movimientos de pólizas'
                : profile.role === 'manager'
                  ? 'Movimientos de tu equipo'
                  : 'Tus movimientos de pólizas'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <MovementsClient
          initialMovements={movements}
          insurers={(insurers ?? []) as { id: string; name: string; short_name: string | null; email: string | null }[]}
          userRole={profile.role}
        />
      </div>
    </div>
  )
}
