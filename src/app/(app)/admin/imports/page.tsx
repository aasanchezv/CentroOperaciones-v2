import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PolicyImport } from './policy-import'
import { Upload } from 'lucide-react'

export default async function ImportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_code, name')
    .order('account_code')

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Importación masiva</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Carga pólizas en lote desde un archivo Excel o CSV
        </p>
      </div>

      <div className="rounded-xl border bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5 pb-4 border-b">
          <Upload className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-700">Importar pólizas</h2>
        </div>
        <PolicyImport accounts={accounts ?? []} />
      </div>
    </div>
  )
}
