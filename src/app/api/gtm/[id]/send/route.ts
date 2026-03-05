import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'
import { createAdminClient }        from '@/lib/supabase/admin'
import { resend, EMAIL_FROM }       from '@/lib/resend'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const { id: processId } = await params

  let body: { insurerRecordIds?: string[] } = {}
  try { body = await request.json() as { insurerRecordIds?: string[] } } catch { /* ok */ }

  const admin = createAdminClient()

  // Load process
  const { data: gtmProcess } = await admin
    .from('gtm_processes')
    .select('id, title, branch, slip_url, slip_filename, slip_extracted')
    .eq('id', processId)
    .single()

  if (!gtmProcess) return NextResponse.json({ error: 'Proceso no encontrado' }, { status: 404 })
  if (!gtmProcess.slip_url) {
    return NextResponse.json({ error: 'El proceso no tiene slip cargado' }, { status: 400 })
  }

  // Load insurer records to send
  let query = admin
    .from('gtm_process_insurers')
    .select('id, insurer_id, contact_name, contact_email, upload_token, insurer:insurers!gtm_process_insurers_insurer_id_fkey(name)')
    .eq('process_id', processId)
    .eq('status', 'pending')

  if (body.insurerRecordIds?.length) {
    query = query.in('id', body.insurerRecordIds)
  }

  const { data: records } = await query

  if (!records?.length) {
    return NextResponse.json({ error: 'No hay aseguradoras pendientes de envío' }, { status: 400 })
  }

  // Download slip from Storage
  const { data: slipFile, error: dlError } = await admin.storage
    .from('gtm-files')
    .download(gtmProcess.slip_url)

  if (dlError || !slipFile) {
    return NextResponse.json({ error: 'No se pudo cargar el slip' }, { status: 500 })
  }

  const slipBuffer  = await slipFile.arrayBuffer()
  const slipBase64  = Buffer.from(slipBuffer).toString('base64')
  const slipName    = gtmProcess.slip_filename ?? 'slip.xlsx'

  // Get base URL for portal links
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mc2core.vercel.app'

  const extracted  = gtmProcess.slip_extracted as Record<string, string | null> | null
  const clientName = extracted?.client_name ?? ''
  const ramo       = gtmProcess.branch ?? extracted?.ramo ?? ''

  const errors: string[] = []
  let sentCount = 0

  for (const record of records) {
    const r            = record as unknown as Record<string, unknown>
    const insurerName  = (r.insurer as { name: string } | null)?.name ?? 'Aseguradora'
    const uploadUrl    = `${baseUrl}/portal/gtm/${record.upload_token}`
    const contactName  = record.contact_name ?? `Equipo de Cotizaciones`

    const subject = `Solicitud de Cotización — ${ramo}${clientName ? ` — ${clientName}` : ''}`

    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1a1a1a;">
  <div style="background: #0A2F6B; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="color: #fff; margin: 0; font-size: 18px;">Solicitud de Cotización</h2>
    <p style="color: #93C5FD; margin: 4px 0 0; font-size: 13px;">Murguía Seguros</p>
  </div>
  <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Estimado/a <strong>${contactName}</strong>,</p>
    <p>Por medio del presente, Murguía Seguros le solicita atentamente una cotización para el siguiente riesgo:</p>
    ${clientName ? `<p><strong>Cliente:</strong> ${clientName}</p>` : ''}
    ${ramo ? `<p><strong>Ramo:</strong> ${ramo}</p>` : ''}
    ${extracted?.suma_asegurada ? `<p><strong>Suma asegurada:</strong> ${extracted.suma_asegurada}</p>` : ''}
    ${extracted?.vigencia_from ? `<p><strong>Vigencia:</strong> ${extracted.vigencia_from}${extracted.vigencia_to ? ` al ${extracted.vigencia_to}` : ''}</p>` : ''}
    <p>Los detalles completos del riesgo se encuentran en el slip adjunto.</p>

    <div style="margin: 24px 0; padding: 16px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px;">
      <p style="margin: 0 0 8px; font-weight: bold; color: #166534;">📋 Suba su propuesta aquí:</p>
      <a href="${uploadUrl}" style="display: inline-block; background: #16A34A; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
        Subir propuesta de cotización
      </a>
      <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">
        O copie este enlace: <code>${uploadUrl}</code>
      </p>
    </div>

    <p>Si tiene alguna pregunta, no dude en contactarnos.</p>
    <p>Atentamente,<br><strong>${profile.full_name ?? 'Equipo Murguía Seguros'}</strong></p>
  </div>
</div>`

    try {
      await resend.emails.send({
        from:    EMAIL_FROM,
        to:      record.contact_email,
        subject,
        html,
        attachments: [{
          filename: slipName,
          content:  slipBase64,
        }],
      })

      await admin
        .from('gtm_process_insurers')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', record.id)

      sentCount++
    } catch (e) {
      errors.push(`${insurerName}: ${(e as Error).message}`)
    }
  }

  // Update process status if at least one sent
  if (sentCount > 0) {
    await admin
      .from('gtm_processes')
      .update({ status: 'waiting', updated_at: new Date().toISOString() })
      .eq('id', processId)
      .eq('status', 'draft')
  }

  return NextResponse.json({ sent: sentCount, errors })
}
