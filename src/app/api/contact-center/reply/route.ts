import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsApp }      from '@/lib/kapso'
import { resend, EMAIL_FROM } from '@/lib/resend'
import { getEmailCcList }    from '@/lib/email-cc'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, team_id')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role === 'readonly') {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const body = await req.json() as {
    conversationId: string
    message: string
    subject?: string
  }

  const { conversationId, message, subject } = body
  if (!conversationId || !message?.trim()) {
    return NextResponse.json({ error: 'conversationId y message son requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Cargar conversación con contacto
  const { data: conv } = await admin
    .from('conversations')
    .select(`
      id, channel, status,
      contact:contacts!conversations_contact_id_fkey(
        id, full_name, email, phone
      )
    `)
    .eq('id', conversationId)
    .single()

  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
  if (conv.status === 'resolved') {
    return NextResponse.json({ error: 'Conversación cerrada' }, { status: 400 })
  }

  type ContactShape = { id: string; full_name: string; email: string | null; phone: string | null }
  const contact = (Array.isArray(conv.contact) ? conv.contact[0] : conv.contact) as ContactShape | null

  const now = new Date().toISOString()
  let sent  = false

  // ── WhatsApp ──────────────────────────────────────────────────
  if (conv.channel === 'whatsapp') {
    const phone = contact?.phone
    if (!phone) return NextResponse.json({ error: 'Contacto sin teléfono' }, { status: 400 })

    const result = await sendWhatsApp(phone, message)
    if (!result.ok) {
      if (result.code === 'session_expired') {
        return NextResponse.json({
          error: 'session_expired',
          message: 'La sesión de WhatsApp expiró (ventana de 24 h). El cliente debe escribirte primero para poder responder.',
        }, { status: 422 })
      }
      return NextResponse.json({ error: result.message }, { status: 502 })
    }
    sent = true

    await admin.from('cc_messages').insert({
      conversation_id: conversationId,
      direction:       'outbound',
      channel:         'whatsapp',
      body:            message,
      sender_name:     (profile.full_name as string | null) ?? 'Ejecutivo',
      sender_phone:    contact?.phone,
      sent_by:         user.id,
      status:          'delivered',
    })
  }

  // ── Email ─────────────────────────────────────────────────────
  if (conv.channel === 'email') {
    const email = contact?.email
    if (!email) return NextResponse.json({ error: 'Contacto sin email' }, { status: 400 })

    const cc = await getEmailCcList(false, (profile as { team_id?: string | null }).team_id ?? undefined)
    await resend.emails.send({
      from:    EMAIL_FROM,
      to:      email,
      subject: subject ?? 'Re: Mensaje de Murguía Seguros',
      text:    message,
      ...(cc.length ? { cc } : {}),
    })
    sent = true

    await admin.from('cc_messages').insert({
      conversation_id: conversationId,
      direction:       'outbound',
      channel:         'email',
      body:            message,
      subject:         subject,
      sender_name:     (profile.full_name as string | null) ?? 'Ejecutivo',
      sender_email:    email,
      sent_by:         user.id,
      status:          'delivered',
    })
  }

  if (sent) {
    // Leer conversación para saber si es el primer outbound (first_response_at)
    const { data: convData } = await admin
      .from('conversations')
      .select('first_response_at')
      .eq('id', conversationId)
      .single()

    const isFirstResponse = !convData?.first_response_at

    await admin
      .from('conversations')
      .update({
        last_message_at:    now,
        updated_at:         now,
        waiting_since:      null,
        ...(isFirstResponse ? { first_response_at: now } : {}),
      })
      .eq('id', conversationId)

    // Registrar evento de respuesta
    await admin.from('conversation_events').insert({
      conversation_id: conversationId,
      event_type:      isFirstResponse ? 'first_reply' : 'reply',
      actor_id:        user.id,
      metadata:        { channel: conv.channel },
    })
  }

  return NextResponse.json({ ok: true })
}
