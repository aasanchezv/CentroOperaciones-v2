import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import { getRules, getCobranzaStageNames, getTeams } from '@/app/actions/rules-actions'
import { RulesClient } from './rules-client'
import { Settings2 }   from 'lucide-react'

export default async function AdminPolizasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'ops'].includes(profile?.role ?? '')) redirect('/dashboard')

  const [rules, stages, teams] = await Promise.all([
    getRules(),
    getCobranzaStageNames(),
    getTeams(),
  ])

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
          <Settings2 className="h-5 w-5 text-slate-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reglas de pólizas</h1>
          <p className="text-sm text-gray-500">
            Automatiza el workflow de renovaciones y cobranza según condiciones de negocio
          </p>
        </div>
      </div>

      <RulesClient initialRules={rules} stages={stages} teams={teams} />
    </div>
  )
}
