import { createClient }      from '@/lib/supabase/server'
import { redirect }           from 'next/navigation'
import {
  getToolConfigs,
  getUsageStats,
  getApiKeyStatus,
  getConfigHistory,
} from '@/app/actions/ai-admin-actions'
import { IaAdminClient }      from './ia-admin-client'

export default async function IaAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  // getApiKeyStatus puede fallar si migration 012 aún no se corrió (tabla no existe).
  // Cargamos el resto normal y solo protegemos esas dos con catch individual.
  const [configs, stats, anthropicKey, history] = await Promise.all([
    getToolConfigs(),
    getUsageStats(),
    getApiKeyStatus('anthropic').catch(() => null),
    getConfigHistory(20).catch(() => []),
  ])

  return (
    <IaAdminClient
      configs={configs}
      stats={stats}
      anthropicKey={anthropicKey}
      history={history}
    />
  )
}
