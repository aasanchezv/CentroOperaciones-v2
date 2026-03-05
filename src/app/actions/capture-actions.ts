'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath }    from 'next/cache'

export interface TemplateField {
  id:    string
  key:   string
  label: string
  type:  'text' | 'number' | 'date'
}

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  return user
}

// ─── Templates ────────────────────────────────────────────────

export async function createTemplate(name: string, fields: TemplateField[], isShared: boolean) {
  const user  = await getUser()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('capture_templates')
    .insert({ name, fields, is_shared: isShared, created_by: user.id })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/captura')
  return data.id as string
}

export async function updateTemplate(id: string, name: string, fields: TemplateField[], isShared: boolean) {
  const user  = await getUser()
  const admin = createAdminClient()

  const { error } = await admin
    .from('capture_templates')
    .update({ name, fields, is_shared: isShared })
    .eq('id', id)
    .eq('created_by', user.id)   // solo el dueño

  if (error) throw new Error(error.message)
  revalidatePath('/captura')
}

export async function deleteTemplate(id: string) {
  const user  = await getUser()
  const admin = createAdminClient()

  const { error } = await admin
    .from('capture_templates')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id)

  if (error) throw new Error(error.message)
  revalidatePath('/captura')
}

// ─── Runs ─────────────────────────────────────────────────────

export interface DocumentResult {
  fileName:  string
  status:    'done' | 'error'
  extracted: Record<string, string | null>
  error?:    string
}

export async function saveRun(payload: {
  name:             string
  templateId:       string | null
  templateSnapshot: TemplateField[]
  documents:        DocumentResult[]
}) {
  const user  = await getUser()
  const admin = createAdminClient()

  const { data: run, error: runError } = await admin
    .from('capture_runs')
    .insert({
      name:              payload.name,
      template_id:       payload.templateId,
      template_snapshot: payload.templateSnapshot,
      document_count:    payload.documents.length,
      created_by:        user.id,
    })
    .select('id')
    .single()

  if (runError) throw new Error(runError.message)

  if (payload.documents.length > 0) {
    const docs = payload.documents.map(d => ({
      run_id:    run.id,
      file_name: d.fileName,
      status:    d.status,
      extracted: d.extracted,
      error:     d.error ?? null,
    }))
    const { error: docsError } = await admin.from('capture_documents').insert(docs)
    if (docsError) throw new Error(docsError.message)
  }

  await admin.from('audit_events').insert({
    actor_id:    user.id,
    action:      'capture.run_saved',
    entity_type: 'capture_run',
    entity_id:   run.id,
    payload:     { document_count: payload.documents.length },
  })

  revalidatePath('/captura')
  return run.id as string
}

// ─── Documents ────────────────────────────────────────────────

export async function updateCaptureDocument(
  docId:     string,
  extracted: Record<string, string | null>,
) {
  const user  = await getUser()
  const admin = createAdminClient()

  // Verify ownership
  const { data: doc } = await admin
    .from('capture_documents')
    .select('run_id')
    .eq('id', docId)
    .single()
  if (!doc) throw new Error('Documento no encontrado')

  const { data: run } = await admin
    .from('capture_runs')
    .select('created_by')
    .eq('id', doc.run_id)
    .single()

  if (run?.created_by !== user.id) {
    const { data: profile } = await admin
      .from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin' && profile?.role !== 'ops') {
      throw new Error('Sin permiso para editar este documento')
    }
  }

  const { error } = await admin
    .from('capture_documents')
    .update({ extracted })
    .eq('id', docId)
  if (error) throw new Error(error.message)

  revalidatePath('/captura')
}
