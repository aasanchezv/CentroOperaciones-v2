'use server'

import { revalidatePath }     from 'next/cache'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'
import { sanitizeFileName }   from '@/lib/storage'

// ─── Types ────────────────────────────────────────────────────

export interface GtmProcess {
  id:               string
  title:            string
  account_id:       string | null
  account_name:     string | null
  branch:           string | null
  slip_url:         string | null
  slip_filename:    string | null
  slip_extracted:   Record<string, unknown> | null
  status:           string
  proposal_pdf_url: string | null
  ai_recommendation: string | null
  notes:            string | null
  deadline_at:      string | null
  created_by:       string | null
  assigned_to:      string | null
  assigned_name:    string | null
  created_at:       string
  updated_at:       string
  insurer_count:    number
  responded_count:  number
}

export interface GtmInsurerRecord {
  id:               string
  process_id:       string
  insurer_id:       string
  insurer_name:     string
  insurer_logo_url: string | null
  contact_name:     string | null
  contact_email:    string
  upload_token:     string
  status:           string
  sent_at:          string | null
  proposal_url:     string | null
  proposal_filename: string | null
  received_at:      string | null
  analyzed_at:      string | null
  ai_prima:         number | null
  ai_suma_asegurada: string | null
  ai_coberturas:    string | null
  ai_exclusiones:   string | null
  ai_deducible:     string | null
  ai_vigencia:      string | null
  ai_condiciones:   string | null
  notes:            string | null
}

// ─── Auth helper ──────────────────────────────────────────────

async function requireOperator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles').select('id, role, full_name').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') throw new Error('Acceso denegado')
  return { user, supabase, profile }
}

// ─── getGtmProcesses ──────────────────────────────────────────

export async function getGtmProcesses(): Promise<GtmProcess[]> {
  await requireOperator()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('gtm_processes')
    .select(`
      id, title, account_id, branch, slip_url, slip_filename, slip_extracted,
      status, proposal_pdf_url, ai_recommendation, notes, deadline_at,
      created_by, assigned_to, created_at, updated_at,
      account:accounts!gtm_processes_account_id_fkey(name),
      assignee:profiles!gtm_processes_assigned_to_fkey(full_name),
      insurers:gtm_process_insurers(id, status)
    `)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  return (data ?? []).map(row => {
    const r = row as unknown as Record<string, unknown>
    const insurerRows = (r.insurers as { id: string; status: string }[]) ?? []
    return {
      id:               row.id,
      title:            row.title,
      account_id:       row.account_id,
      account_name:     (r.account as { name: string } | null)?.name ?? null,
      branch:           row.branch,
      slip_url:         row.slip_url,
      slip_filename:    row.slip_filename,
      slip_extracted:   row.slip_extracted as Record<string, unknown> | null,
      status:           row.status,
      proposal_pdf_url: row.proposal_pdf_url,
      ai_recommendation: row.ai_recommendation,
      notes:            row.notes,
      deadline_at:      row.deadline_at,
      created_by:       row.created_by,
      assigned_to:      row.assigned_to,
      assigned_name:    (r.assignee as { full_name: string } | null)?.full_name ?? null,
      created_at:       row.created_at,
      updated_at:       row.updated_at,
      insurer_count:    insurerRows.length,
      responded_count:  insurerRows.filter(i => ['received','analyzed'].includes(i.status)).length,
    }
  })
}

// ─── getGtmProcess ────────────────────────────────────────────

export async function getGtmProcess(id: string): Promise<{
  process: GtmProcess
  insurers: GtmInsurerRecord[]
} | null> {
  await requireOperator()
  const admin = createAdminClient()

  const [processRes, insurersRes] = await Promise.all([
    admin
      .from('gtm_processes')
      .select(`
        id, title, account_id, branch, slip_url, slip_filename, slip_extracted,
        status, proposal_pdf_url, ai_recommendation, notes, deadline_at,
        created_by, assigned_to, created_at, updated_at,
        account:accounts!gtm_processes_account_id_fkey(name),
        assignee:profiles!gtm_processes_assigned_to_fkey(full_name)
      `)
      .eq('id', id)
      .single(),

    admin
      .from('gtm_process_insurers')
      .select(`
        id, process_id, insurer_id, contact_name, contact_email, upload_token,
        status, sent_at, proposal_url, proposal_filename, received_at, analyzed_at,
        ai_prima, ai_suma_asegurada, ai_coberturas, ai_exclusiones,
        ai_deducible, ai_vigencia, ai_condiciones, notes,
        insurer:insurers!gtm_process_insurers_insurer_id_fkey(name, logo_url)
      `)
      .eq('process_id', id)
      .order('created_at'),
  ])

  if (processRes.error || !processRes.data) return null
  const row = processRes.data
  const r   = row as unknown as Record<string, unknown>

  const insurerRows = (insurersRes.data ?? []).map(ins => {
    const ir = ins as unknown as Record<string, unknown>
    const insurer = ir.insurer as { name: string; logo_url: string | null } | null
    return {
      id:               ins.id,
      process_id:       ins.process_id,
      insurer_id:       ins.insurer_id,
      insurer_name:     insurer?.name ?? '',
      insurer_logo_url: insurer?.logo_url ?? null,
      contact_name:     ins.contact_name,
      contact_email:    ins.contact_email,
      upload_token:     String(ins.upload_token),
      status:           ins.status,
      sent_at:          ins.sent_at,
      proposal_url:     ins.proposal_url,
      proposal_filename: ins.proposal_filename,
      received_at:      ins.received_at,
      analyzed_at:      ins.analyzed_at,
      ai_prima:         ins.ai_prima,
      ai_suma_asegurada: ins.ai_suma_asegurada,
      ai_coberturas:    ins.ai_coberturas,
      ai_exclusiones:   ins.ai_exclusiones,
      ai_deducible:     ins.ai_deducible,
      ai_vigencia:      ins.ai_vigencia,
      ai_condiciones:   ins.ai_condiciones,
      notes:            ins.notes,
    } as GtmInsurerRecord
  })

  const process: GtmProcess = {
    id:               row.id,
    title:            row.title,
    account_id:       row.account_id,
    account_name:     (r.account as { name: string } | null)?.name ?? null,
    branch:           row.branch,
    slip_url:         row.slip_url,
    slip_filename:    row.slip_filename,
    slip_extracted:   row.slip_extracted as Record<string, unknown> | null,
    status:           row.status,
    proposal_pdf_url: row.proposal_pdf_url,
    ai_recommendation: row.ai_recommendation,
    notes:            row.notes,
    deadline_at:      row.deadline_at,
    created_by:       row.created_by,
    assigned_to:      row.assigned_to,
    assigned_name:    (r.assignee as { full_name: string } | null)?.full_name ?? null,
    created_at:       row.created_at,
    updated_at:       row.updated_at,
    insurer_count:    insurerRows.length,
    responded_count:  insurerRows.filter(i => ['received','analyzed'].includes(i.status)).length,
  }

  return { process, insurers: insurerRows }
}

// ─── createGtmProcess ─────────────────────────────────────────

export async function createGtmProcess(input: {
  title:       string
  account_id?: string | null
  branch?:     string | null
  notes?:      string | null
  deadline_at?: string | null
  assigned_to?: string | null
}): Promise<{ id: string } | { error: string }> {
  try {
    const { user } = await requireOperator()
    const admin    = createAdminClient()

    const { data, error } = await admin
      .from('gtm_processes')
      .insert({
        title:       input.title.trim(),
        account_id:  input.account_id  ?? null,
        branch:      input.branch      ?? null,
        notes:       input.notes       ?? null,
        deadline_at: input.deadline_at ?? null,
        assigned_to: input.assigned_to ?? user.id,
        created_by:  user.id,
        status:      'draft',
      })
      .select('id')
      .single()

    if (error) return { error: error.message }
    revalidatePath('/go-to-market')
    return { id: data.id }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── updateGtmProcess ─────────────────────────────────────────

export async function updateGtmProcess(
  id: string,
  input: Partial<{
    title:            string
    status:           string
    notes:            string | null
    deadline_at:      string | null
    assigned_to:      string | null
    ai_recommendation: string | null
    slip_url:         string | null
    slip_filename:    string | null
    slip_extracted:   Record<string, unknown> | null
    proposal_pdf_url: string | null
  }>,
): Promise<{ error?: string }> {
  try {
    await requireOperator()
    const admin = createAdminClient()
    const { error } = await admin
      .from('gtm_processes')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/go-to-market')
    revalidatePath(`/go-to-market/${id}`)
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── deleteGtmProcess ─────────────────────────────────────────

export async function deleteGtmProcess(id: string): Promise<{ error?: string }> {
  try {
    const { profile } = await requireOperator()
    if (!['admin','ops'].includes(profile.role)) return { error: 'Solo admin u ops puede eliminar procesos GTM' }
    const admin = createAdminClient()
    const { error } = await admin.from('gtm_processes').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/go-to-market')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── addInsurerToProcess ──────────────────────────────────────

export async function addInsurerToProcess(
  processId: string,
  insurerId:  string,
  contactEmail: string,
  contactName?: string | null,
): Promise<{ id: string } | { error: string }> {
  try {
    await requireOperator()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('gtm_process_insurers')
      .insert({ process_id: processId, insurer_id: insurerId, contact_email: contactEmail, contact_name: contactName ?? null })
      .select('id')
      .single()
    if (error) return { error: error.message }
    revalidatePath(`/go-to-market/${processId}`)
    return { id: data.id }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── removeInsurerFromProcess ─────────────────────────────────

export async function removeInsurerFromProcess(recordId: string, processId: string): Promise<{ error?: string }> {
  try {
    await requireOperator()
    const admin = createAdminClient()
    const { error } = await admin.from('gtm_process_insurers').delete().eq('id', recordId)
    if (error) return { error: error.message }
    revalidatePath(`/go-to-market/${processId}`)
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── markInsurerDeclined ──────────────────────────────────────

export async function markInsurerDeclined(recordId: string, processId: string): Promise<{ error?: string }> {
  try {
    await requireOperator()
    const admin = createAdminClient()
    const { error } = await admin
      .from('gtm_process_insurers')
      .update({ status: 'declined' })
      .eq('id', recordId)
    if (error) return { error: error.message }
    revalidatePath(`/go-to-market/${processId}`)
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── getSlipUploadUrl ─────────────────────────────────────────
/**
 * Genera una URL firmada para subir el Excel del slip directamente al Storage.
 */
export async function getSlipUploadUrl(
  processId: string,
  fileName:  string,
): Promise<{ token: string; path: string } | { error: string }> {
  try {
    await requireOperator()
    const admin    = createAdminClient()
    const safeName = sanitizeFileName(fileName)
    const uid      = Math.random().toString(36).slice(2, 10)
    const path     = `slips/${processId}/${uid}-${safeName}`

    const { data, error } = await admin.storage
      .from('gtm-files')
      .createSignedUploadUrl(path)

    if (error || !data) return { error: error?.message ?? 'Error al generar URL' }
    return { token: data.token, path }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── getProposalSignedUrl ─────────────────────────────────────
/**
 * Genera una URL firmada de descarga para una propuesta de aseguradora.
 */
export async function getProposalSignedUrl(
  filePath: string,
): Promise<{ url: string } | { error: string }> {
  try {
    await requireOperator()
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from('gtm-files')
      .createSignedUrl(filePath, 3600) // 1 hora
    if (error || !data) return { error: error?.message ?? 'Error al generar URL' }
    return { url: data.signedUrl }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── getPdfSignedUrl ──────────────────────────────────────────
/**
 * Genera una URL firmada de descarga para el PDF de propuesta comercial.
 */
export async function getPdfSignedUrl(
  processId: string,
): Promise<{ url: string } | { error: string }> {
  try {
    await requireOperator()
    const admin    = createAdminClient()
    const filePath = `reports/${processId}/propuesta.pdf`
    const { data, error } = await admin.storage
      .from('gtm-files')
      .createSignedUrl(filePath, 3600)
    if (error || !data) return { error: error?.message ?? 'Error al generar URL' }
    return { url: data.signedUrl }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
