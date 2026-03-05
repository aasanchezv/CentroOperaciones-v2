import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }        from '@/lib/supabase/admin'
import { sanitizeFileName }         from '@/lib/storage'

// Public endpoint — no auth required, token-based access

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const admin     = createAdminClient()

  // Look up the insurer record by upload_token
  const { data: record } = await admin
    .from('gtm_process_insurers')
    .select('id, process_id, insurer_id, status')
    .eq('upload_token', token)
    .single()

  if (!record) {
    return NextResponse.json({ error: 'Link inválido o expirado' }, { status: 404 })
  }

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Formato de solicitud inválido' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
  }

  // Validate file type
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
  if (!allowedTypes.includes(file.type) && !file.name.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Solo se aceptan archivos PDF, JPG o PNG' }, { status: 400 })
  }

  // Max 20MB
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'El archivo no puede superar 20 MB' }, { status: 400 })
  }

  const safeName = sanitizeFileName(file.name)
  const uid      = Math.random().toString(36).slice(2, 10)
  const path     = `proposals/${record.process_id}/${record.insurer_id}/${uid}-${safeName}`

  // Upload to Storage
  const buffer   = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('gtm-files')
    .upload(path, Buffer.from(buffer), {
      contentType:  file.type || 'application/pdf',
      upsert:       false,
    })

  if (uploadError) {
    return NextResponse.json({ error: 'Error al guardar el archivo: ' + uploadError.message }, { status: 500 })
  }

  // Update insurer record
  await admin
    .from('gtm_process_insurers')
    .update({
      proposal_url:      path,
      proposal_filename: file.name,
      received_at:       new Date().toISOString(),
      status:            'received',
    })
    .eq('id', record.id)

  // Fire-and-forget: trigger AI analysis
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mc2core.vercel.app'
  void fetch(`${baseUrl}/api/gtm/${record.process_id}/analyze`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_SECRET ?? '' },
    body:    JSON.stringify({ insurerRecordId: record.id }),
  }).catch(() => { /* non-critical */ })

  return NextResponse.json({ ok: true, message: 'Propuesta recibida correctamente' })
}

// GET: check status (insurer can see if already uploaded)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const admin     = createAdminClient()

  const { data: record } = await admin
    .from('gtm_process_insurers')
    .select(`
      id, status, received_at, proposal_filename,
      process:gtm_processes!gtm_process_insurers_process_id_fkey(
        title, branch, slip_extracted
      ),
      insurer:insurers!gtm_process_insurers_insurer_id_fkey(name)
    `)
    .eq('upload_token', token)
    .single()

  if (!record) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 })
  }

  const r           = record as unknown as Record<string, unknown>
  const process     = r.process as { title: string; branch: string | null; slip_extracted: Record<string, unknown> | null } | null
  const insurer     = r.insurer as { name: string } | null
  const extracted   = process?.slip_extracted as Record<string, string | null> | null

  return NextResponse.json({
    insurer_name:     insurer?.name ?? '',
    process_title:    process?.title ?? '',
    branch:           process?.branch ?? '',
    client_name:      extracted?.client_name ?? '',
    suma_asegurada:   extracted?.suma_asegurada ?? '',
    vigencia_from:    extracted?.vigencia_from ?? '',
    vigencia_to:      extracted?.vigencia_to ?? '',
    already_received: record.status !== 'pending' && record.status !== 'sent',
    received_at:      record.received_at,
    proposal_filename: record.proposal_filename,
  })
}
