import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.KAPSO_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature.replace('sha256=', ''), 'hex'),
    Buffer.from(expected, 'hex')
  )
}

export async function POST(req: NextRequest) {
  const rawBody   = await req.text()
  const signature = req.headers.get('x-kapso-signature') ?? req.headers.get('x-hub-signature-256')

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const from        = extractPhone(body)
  const messageText = extractMessageText(body)
  const externalId  = extractMessageId(body)

  if (!from) {
    // No es mensaje entrante (status update), ignorar
    return NextResponse.json({ ok: true })
  }

  const admin           = createAdminClient()
  const normalizedPhone = from.replace(/\D/g, '')

  // ── 1. Buscar contacto por teléfono ──────────────────────────
  const { data: contacts } = await admin
    .from('contacts')
    .select('id, full_name, account_id')
    .or(`phone.eq.${from},phone.eq.+${normalizedPhone},phone.eq.${normalizedPhone}`)

  const contactList = (contacts ?? []) as { id: string; full_name: string; account_id: string }[]

  // ── 2. Contact Center — crear/actualizar conversación ─────────
  await upsertWAConversation({ admin, from, normalizedPhone, messageText, externalId, contacts: contactList })

  // ── 3. Renovaciones — auto-confirmar si aplica ────────────────
  if (contactList.length > 0) {
    const contactIds = contactList.map(c => c.id)

    const { data: policies } = await admin
      .from('policies')
      .select('id')
      .in('tomador_id', contactIds)

    if (policies && policies.length > 0) {
      const policyIds = policies.map(p => p.id)

      const { data: renewals } = await admin
        .from('renewals')
        .select('id')
        .in('policy_id', policyIds)
        .eq('status', 'in_progress')
        .is('client_confirmed_at', null)

      if (renewals && renewals.length > 0) {
        const renewalIds  = renewals.map(r => r.id)
        const confirmedAt = new Date().toISOString()

        await admin
          .from('renewals')
          .update({ client_confirmed_at: confirmedAt, updated_at: confirmedAt })
          .in('id', renewalIds)

        await admin.from('renewal_events').insert(
          renewalIds.map(id => ({
            renewal_id: id,
            action:     'confirmed',
            notes:      'Confirmación automática vía respuesta de WhatsApp',
            metadata:   { from_phone: from },
          }))
        )

        await admin.from('audit_events').insert(
          renewalIds.map(id => ({
            action:      'renewal.confirmed_whatsapp',
            entity_type: 'renewal',
            entity_id:   id,
            payload:     { from_phone: from },
          }))
        )
      }
    }
  }

  return NextResponse.json({ ok: true })
}

// ── Upsert conversación WA en Contact Center ──────────────────

async function upsertWAConversation({
  admin,
  from,
  normalizedPhone,
  messageText,
  externalId,
  contacts,
}: {
  admin: ReturnType<typeof createAdminClient>
  from: string
  normalizedPhone: string
  messageText: string | null
  externalId: string | null
  contacts: { id: string; full_name: string; account_id: string }[]
}) {
  const contact   = contacts[0] ?? null
  const contactId = contact?.id ?? null
  const accountId = contact?.account_id ?? null
  const now       = new Date().toISOString()

  // Buscar conversación WA abierta para este contacto
  let conversationId: string | null = null

  if (contactId) {
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .eq('channel', 'whatsapp')
      .neq('status', 'resolved')
      .eq('contact_id', contactId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    conversationId = existing?.id ?? null
  }

  if (conversationId) {
    // Actualizar conversación existente — leer unread_count y sumar 1
    const { data: convData } = await admin
      .from('conversations')
      .select('unread_count')
      .eq('id', conversationId)
      .single()

    await admin
      .from('conversations')
      .update({
        last_message_at: now,
        updated_at:      now,
        unread_count:    (convData?.unread_count ?? 0) + 1,
        waiting_since:   now,
      })
      .eq('id', conversationId)

  } else {
    // Crear conversación nueva
    const { data: newConv } = await admin
      .from('conversations')
      .insert({
        contact_id:      contactId,
        account_id:      accountId,
        channel:         'whatsapp',
        status:          'open',
        last_message_at: now,
        unread_count:    1,
        waiting_since:   now,
      })
      .select('id')
      .single()

    conversationId = newConv?.id ?? null
  }

  if (!conversationId) return

  // Insertar mensaje entrante
  await admin.from('cc_messages').insert({
    conversation_id: conversationId,
    direction:       'inbound',
    channel:         'whatsapp',
    body:            messageText ?? '',
    sender_name:     contact?.full_name ?? 'Desconocido',
    sender_phone:    from.startsWith('+') ? from : `+${normalizedPhone}`,
    external_id:     externalId,
    status:          'delivered',
  })
}

// ── Extractors del payload Meta/Kapso ─────────────────────────

function extractPhone(body: Record<string, unknown>): string | null {
  try {
    const entry    = (body.entry as Record<string, unknown>[])?.[0]
    const change   = (entry?.changes as Record<string, unknown>[])?.[0]
    const value    = change?.value as Record<string, unknown>
    const messages = value?.messages as Record<string, unknown>[]
    return (messages?.[0]?.from as string) ?? null
  } catch { return null }
}

function extractMessageText(body: Record<string, unknown>): string | null {
  try {
    const entry    = (body.entry as Record<string, unknown>[])?.[0]
    const change   = (entry?.changes as Record<string, unknown>[])?.[0]
    const value    = change?.value as Record<string, unknown>
    const messages = value?.messages as Record<string, unknown>[]
    const msg      = messages?.[0] as Record<string, unknown>
    if (msg?.type === 'text') {
      return ((msg.text as Record<string, unknown>)?.body as string) ?? null
    }
    if (msg?.type === 'interactive') {
      const ia = msg.interactive as Record<string, unknown>
      return ((ia?.button_reply as Record<string, unknown>)?.title as string)
          ?? ((ia?.list_reply   as Record<string, unknown>)?.title as string)
          ?? '[interactivo]'
    }
    return `[${(msg?.type as string) ?? 'mensaje'}]`
  } catch { return null }
}

function extractMessageId(body: Record<string, unknown>): string | null {
  try {
    const entry    = (body.entry as Record<string, unknown>[])?.[0]
    const change   = (entry?.changes as Record<string, unknown>[])?.[0]
    const value    = change?.value as Record<string, unknown>
    const messages = value?.messages as Record<string, unknown>[]
    return (messages?.[0]?.id as string) ?? null
  } catch { return null }
}
