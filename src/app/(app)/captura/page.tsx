import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CaptureWorkspace }  from './capture-workspace'

export default async function CapturaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  const admin = createAdminClient()

  // Plantillas: propias + compartidas
  const { data: templates } = await admin
    .from('capture_templates')
    .select('id, name, fields, is_shared, created_by, created_at')
    .or(`created_by.eq.${user.id},is_shared.eq.true`)
    .order('created_at', { ascending: false })

  // Historial de runs del usuario
  const { data: runs } = await admin
    .from('capture_runs')
    .select(`
      id, name, document_count, created_at, template_id, template_snapshot,
      capture_documents(id, file_name, status, extracted, error)
    `)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b bg-white">
        <h1 className="text-lg font-semibold text-gray-900">Agente de Captura</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Extracción inteligente de datos de pólizas con IA
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <CaptureWorkspace
          templates={(templates ?? []) as unknown as Parameters<typeof CaptureWorkspace>[0]['templates']}
          runs={(runs ?? []) as unknown as Parameters<typeof CaptureWorkspace>[0]['runs']}
          currentUserId={user.id}
        />
      </div>
    </div>
  )
}
