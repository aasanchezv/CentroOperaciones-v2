'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient }      from '@/lib/supabase/server'
import { resend, EMAIL_FROM } from '@/lib/resend'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface PortalMessage {
  id:          string
  direction:   'inbound' | 'outbound' | 'note'
  body:        string | null
  sender_name: string | null
  created_at:  string
}

export interface PortalChatData {
  conversationId: string
  messages:       PortalMessage[]
  aiEnabled:      boolean
}

// ── getPortalChat ─────────────────────────────────────────────────────────────
// Obtiene o crea la conversación portal del account, y retorna los mensajes.
// No requiere auth — se llama desde el portal público.

export async function getPortalChat(accountId: string): Promise<PortalChatData> {
  if (!accountId) return { conversationId: '', messages: [], aiEnabled: false }

  const admin = createAdminClient()

  // 1. Buscar conversación portal existente
  let { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('channel', 'portal')
    .maybeSingle()

  // Fetch account data (for create + ai_agent check)
  const { data: accountData } = await admin
    .from('accounts')
    .select('assigned_to, team_id, ai_agent_id')
    .eq('id', accountId)
    .single()

  // 2. Crear si no existe
  if (!conv) {
    const account = accountData

    const { data: newConv } = await admin
      .from('conversations')
      .insert({
        account_id:  accountId,
        channel:     'portal',
        status:      'open',
        priority:    'normal',
        assigned_to: account?.assigned_to ?? null,
        team_id:     (account as unknown as { team_id?: string | null })?.team_id ?? null,
      })
      .select('id')
      .single()
    conv = newConv
  }

  if (!conv) return { conversationId: '', messages: [], aiEnabled: false }

  // 3. Obtener mensajes
  const { data: messages } = await admin
    .from('cc_messages')
    .select('id, direction, body, sender_name, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at')
    .limit(100)

  return {
    conversationId: conv.id,
    messages:       (messages ?? []) as PortalMessage[],
    aiEnabled:      !!(accountData as unknown as { ai_agent_id?: string | null })?.ai_agent_id,
  }
}

// ── sendPortalMessage ─────────────────────────────────────────────────────────
// Inserta un mensaje inbound desde el portal (sin auth).

export async function sendPortalMessage(
  accountId: string,
  body:       string,
): Promise<{ error?: string }> {
  if (!body.trim()) return { error: 'Mensaje vacío' }

  const admin = createAdminClient()

  // Obtener / crear conversación
  const { conversationId } = await getPortalChat(accountId)
  if (!conversationId) return { error: 'No se pudo crear la conversación' }

  // Insertar mensaje inbound
  const { error } = await admin.from('cc_messages').insert({
    conversation_id: conversationId,
    direction:       'inbound',
    channel:         'portal',
    body:            body.trim(),
    sender_name:     'Cliente (Portal)',
  })
  if (error) return { error: error.message }

  // Actualizar conversación: unread++, last_message_at, status=open
  const { data: conv } = await admin
    .from('conversations')
    .select(`
      unread_count,
      accounts!account_id ( name ),
      profiles!assigned_to ( full_name, email )
    `)
    .eq('id', conversationId)
    .single()

  await admin.from('conversations').update({
    unread_count:    (conv?.unread_count ?? 0) + 1,
    last_message_at: new Date().toISOString(),
    status:          'open',
    waiting_since:   new Date().toISOString(),
  }).eq('id', conversationId)

  // Email al agente asignado (fire-and-forget)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRaw   = conv?.profiles as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountRaw = conv?.accounts as any
  const agentEmail  = agentRaw?.email    ?? null
  const agentName   = agentRaw?.full_name ?? null
  const accountName = accountRaw?.name   ?? 'un cliente'

  if (agentEmail) {
    resend.emails.send({
      from:    EMAIL_FROM,
      to:      agentEmail,
      subject: `Nueva consulta de ${accountName} · Portal Web`,
      text:    [
        agentName ? `Hola ${agentName},\n` : '',
        `Tu cliente ${accountName} te envió una consulta desde el portal:\n`,
        `"${body.trim()}"\n`,
        `Responde desde la app en: Contact Center → Portal.`,
      ].join('\n'),
      html: `
        <p>${agentName ? `Hola <b>${agentName}</b>,<br><br>` : ''}
        Tu cliente <b>${accountName}</b> te envió una consulta desde el portal web:</p>
        <blockquote style="border-left:3px solid #ccc;padding:8px 16px;margin:12px 0;color:#555;font-style:italic;">
          ${body.trim().replace(/\n/g, '<br>')}
        </blockquote>
        <p>Responde desde la app en <b>Contact Center → Portal</b>.</p>
      `,
    }).catch(() => {})
  }

  return {}
}

// ── replyPortalMessage ────────────────────────────────────────────────────────
// Inserta un mensaje outbound desde la app (requiere auth).

export async function replyPortalMessage(
  conversationId: string,
  body:           string,
): Promise<{ error?: string }> {
  if (!body.trim()) return { error: 'Respuesta vacía' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const admin = createAdminClient()

  const { error } = await admin.from('cc_messages').insert({
    conversation_id: conversationId,
    direction:       'outbound',
    channel:         'portal',
    body:            body.trim(),
    sender_name:     profile?.full_name ?? 'Agente',
    sent_by:         user.id,
  })
  if (error) return { error: error.message }

  // Actualizar first_response_at solo si es la primera respuesta
  await admin
    .from('conversations')
    .update({
      first_response_at: new Date().toISOString(),
      last_message_at:   new Date().toISOString(),
    })
    .eq('id', conversationId)
    .is('first_response_at', null)

  // Siempre actualizar last_message_at
  await admin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  return {}
}
