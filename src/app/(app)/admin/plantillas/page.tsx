import { redirect }          from 'next/navigation'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TemplateList }      from '../cobranza/template-form-dialog'
import type { CollectionTemplate } from '@/app/actions/collection-actions'

export default async function AdminPlantillasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const { data: templates } = await admin
    .from('collection_templates')
    .select('*')
    .order('name')

  const cobranzaTemplates   = (templates ?? []).filter(t => !t.type || t.type === 'cobranza')
  const renovacionTemplates = (templates ?? []).filter(t => t.type === 'renovacion')

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Plantillas de mensajes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Todas las plantillas del sistema disponibles para todos los usuarios — cobranza y renovaciones.
        </p>
      </div>

      <TemplateList
        cobranzaTemplates={cobranzaTemplates as CollectionTemplate[]}
        renovacionTemplates={renovacionTemplates as CollectionTemplate[]}
      />
    </div>
  )
}
