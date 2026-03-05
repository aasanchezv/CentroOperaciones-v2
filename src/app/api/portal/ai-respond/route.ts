import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }        from '@/lib/supabase/admin'
import { getAnthropicClient }       from '@/lib/anthropic'

// ── Portal AI Respond ──────────────────────────────────────────────────────────
// Endpoint interno: genera respuesta automática de un agente IA al mensaje
// de un cliente en el portal. Se llama desde portal-chat.tsx tras enviar mensaje.
//
// POST { accountId: string }
//
// Flujo:
// 1. Busca ai_agent_id en la cuenta
// 2. Carga config del agente (persona, system_prompt, model, max_tokens)
// 3. Carga contexto del cliente (pólizas, recibos, siniestros)
// 4. Carga últimos 10 mensajes de la conversación portal
// 5. Llama a Claude con contexto completo en system prompt
// 6. Inserta respuesta en cc_messages como outbound

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  let accountId: string
  try {
    const body = await request.json() as { accountId?: string }
    accountId = body.accountId ?? ''
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    // 1. Fetch account + ai_agent_id
    const { data: account } = await admin
      .from('accounts')
      .select('id, name, ai_agent_id')
      .eq('id', accountId)
      .single()

    if (!account?.ai_agent_id) {
      return NextResponse.json({ skipped: true })
    }

    // 2. Fetch agent config
    const { data: agentConfig } = await admin
      .from('ai_tool_configs')
      .select('persona_name, system_prompt, model, max_tokens, is_enabled')
      .eq('id', account.ai_agent_id)
      .single()

    if (!agentConfig?.is_enabled) {
      return NextResponse.json({ skipped: true, reason: 'agent_disabled' })
    }

    // 3. Fetch portal conversation
    const { data: conv } = await admin
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('channel', 'portal')
      .maybeSingle()

    if (!conv) return NextResponse.json({ skipped: true, reason: 'no_conversation' })

    // 4. Fetch last 12 messages (context)
    const { data: messages } = await admin
      .from('cc_messages')
      .select('direction, body, sender_name, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(12)

    const recentMessages = (messages ?? []).reverse()

    // 5. Fetch client context
    const [{ data: policies }, { data: receipts }, { data: claims }] = await Promise.all([
      admin
        .from('policies')
        .select('policy_number, insurer, branch, status, start_date, end_date, premium, payment_frequency')
        .eq('account_id', accountId)
        .eq('status', 'active')
        .order('end_date')
        .limit(10),
      admin
        .from('policy_receipts')
        .select('receipt_number, due_date, amount, status')
        .eq('account_id', accountId)
        .in('status', ['pending', 'overdue'])
        .order('due_date')
        .limit(10),
      admin
        .from('account_claims')
        .select('claim_number, status, report_date, description')
        .eq('account_id', accountId)
        .order('report_date', { ascending: false })
        .limit(5),
    ])

    // 6. Build system prompt
    const personaName = agentConfig.persona_name ?? 'Asistente Murguía'
    const basePrompt  = agentConfig.system_prompt ?? DEFAULT_SYSTEM_PROMPT

    const clientContext = [
      `\n\n--- INFORMACIÓN DEL CLIENTE: ${account.name} ---`,
      policies && policies.length > 0
        ? `\nPÓLIZAS VIGENTES:\n${policies.map(p =>
            `- ${p.insurer} (${p.branch}): No. ${p.policy_number ?? 'S/N'}, vence ${p.end_date}, prima $${p.premium?.toLocaleString('es-MX') ?? '—'}`
          ).join('\n')}`
        : '\nPÓLIZAS: Sin pólizas vigentes',
      receipts && receipts.length > 0
        ? `\nRECIBOS PENDIENTES:\n${receipts.map(r =>
            `- Recibo ${r.receipt_number ?? 'S/N'}: $${r.amount?.toLocaleString('es-MX') ?? '—'}, vence ${r.due_date} (${r.status})`
          ).join('\n')}`
        : '\nRECIBOS: Sin recibos pendientes',
      claims && claims.length > 0
        ? `\nSINIESTROS:\n${claims.map(c =>
            `- ${c.claim_number ?? 'S/N'}: ${c.status}, reportado ${c.report_date}`
          ).join('\n')}`
        : '\nSINIESTROS: Sin siniestros registrados',
      '--- FIN INFORMACIÓN DEL CLIENTE ---',
    ].join('\n')

    const systemPrompt = basePrompt.replace('{persona_name}', personaName) + clientContext

    // 7. Build conversation history for Claude
    const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = []
    for (const m of recentMessages) {
      if (!m.body?.trim()) continue
      claudeMessages.push({
        role:    m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.body.trim(),
      })
    }

    // Ensure we don't send empty messages array or double assistant at end
    if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role === 'assistant') {
      return NextResponse.json({ skipped: true, reason: 'no_user_message_to_respond' })
    }

    // 8. Call Claude
    const anthropic = await getAnthropicClient()
    const response  = await anthropic.messages.create({
      model:      agentConfig.model ?? 'claude-haiku-4-5-20251001',
      max_tokens: agentConfig.max_tokens ?? 1024,
      system:     systemPrompt,
      messages:   claudeMessages,
    })

    const aiText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.type === 'text' ? b.text : '')
      .join('')
      .trim()

    if (!aiText) return NextResponse.json({ skipped: true, reason: 'empty_response' })

    // 9. Insert AI response as outbound message
    await admin.from('cc_messages').insert({
      conversation_id: conv.id,
      direction:       'outbound',
      channel:         'portal',
      body:            aiText,
      sender_name:     personaName,
    })

    // Update conversation last_message_at + first_response_at if needed
    await admin
      .from('conversations')
      .update({
        last_message_at:   new Date().toISOString(),
        first_response_at: new Date().toISOString(),
      })
      .eq('id', conv.id)
      .is('first_response_at', null)

    await admin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conv.id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[portal/ai-respond]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

const DEFAULT_SYSTEM_PROMPT = `Eres {persona_name}, el asistente virtual de Seguros Murguía. Tu objetivo es ayudar a los clientes con información sobre sus pólizas, recibos y siniestros.

REGLAS:
- Responde siempre en español mexicano, de forma amable, clara y concisa.
- Usa solo la información del cliente proporcionada. No inventes datos, montos ni fechas.
- Para trámites, pagos o situaciones urgentes, invita al cliente a contactar directamente a su asesor.
- Sé breve: máximo 3-4 oraciones por respuesta.
- Si el cliente pregunta algo fuera de tu alcance, responde: "Para eso te recomiendo hablar directamente con tu asesor, quien podrá atenderte personalmente."`
