import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { ArrowLeftRight }    from 'lucide-react'
import { getCachedMovementTypes } from '@/lib/cached-queries'
import { MovementTypesAdmin } from './movement-types-admin'

export default async function AdminMovimientosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const types = await getCachedMovementTypes()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-5 w-5 text-gray-400" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Config. Movimientos</h1>
            <p className="text-xs text-gray-500">Tipos de movimiento y campos requeridos</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <MovementTypesAdmin initialTypes={types} />
      </div>
    </div>
  )
}
