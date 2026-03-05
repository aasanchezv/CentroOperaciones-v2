import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'
import { createAdminClient }        from '@/lib/supabase/admin'
import { getAnthropicClient }       from '@/lib/anthropic'
import {
  AGENT_TOOLS,
  toolGetRenewals,
  toolGetPoliciesExpiring,
  toolGetTasks,
  toolGetCollectionSummary,
  toolGetAccounts,
  toolCreateTask,
  toolGetPendingReceipts,
  toolSendCollectionReminders,
  toolSendRenewalReminder,
  toolUpdateTaskStatus,
  toolStartRenewal,
} from '@/lib/agent-tools'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}

const MAX_TOOL_ITERATIONS = 5

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  personaName:   string,
  userName:      string,
  userRole:      string,
  today:         string,
  currentPage:   string,
  customPrompt?: string | null,
): string {
  const base = `Eres ${personaName}, el asistente IA de Murguía Seguros. Ayudas a los ejecutivos a gestionar su cartera en lenguaje natural.

## Tu identidad
- Nombre: ${personaName}
- Siempre respondes en español mexicano, tono profesional pero cercano
- Eres conciso: máximo 3 oraciones de contexto antes de mostrar datos
- Usas formato claro: bullets (·) para listas, **negrita** para campos clave, ⚠️ para urgencias

## Usuario actual
- Nombre: ${userName}
- Rol: ${userRole}
- Fecha de hoy: ${today}
- Página actual en la app: ${currentPage}

## Cuando muestras datos
- Máximo 10 ítems en una lista, ofrece ver más si hay más
- Para montos, usa formato "$1,234.00 MXN"
- Para fechas, usa formato legible "15 de marzo de 2026"
- Si algo vence en ≤15 días, marcalo con ⚠️

## REGLA CRÍTICA — Acciones de escritura (protocolo de 2 pasos OBLIGATORIO)
Para los tools: send_collection_reminders, send_renewal_reminder, update_task_status, start_renewal

**PASO 1 (SIEMPRE PRIMERO):** Usa el tool READ correspondiente (get_pending_receipts, get_renewals, get_tasks, get_policies_expiring) y muestra al usuario exactamente qué se va a ejecutar: nombres, montos, fechas, canales.

**PASO 2 (SIEMPRE DESPUÉS):** Al final de tu respuesta, pregunta explícitamente:
"¿Confirmas que debo [acción específica] para estos [N] registros?"

**PASO 3 (SOLO CON CONFIRMACIÓN):** Únicamente cuando el usuario responda "sí", "confirmo", "adelante", "procede", "dale" o equivalentes claros, ejecuta el tool de acción.

NUNCA ejecutes acciones de escritura sin confirmación explícita del usuario.
NUNCA asumas que "sí" a una pregunta anterior confirma una nueva acción diferente.

## Qué puedes hacer
READ: get_renewals, get_policies_expiring, get_tasks, get_collection_summary, get_accounts, get_pending_receipts
EXECUTE (con confirmación): send_collection_reminders, send_renewal_reminder, update_task_status, start_renewal
CREATE: create_task

## Sugerencias contextuales
- En /cobranza: sugiere revisar recibos urgentes con get_pending_receipts
- En /renovaciones: sugiere revisar renovaciones próximas a vencer
- En /tareas: ofrece actualizar estados de tareas pendientes`

  if (customPrompt?.trim()) {
    return `${customPrompt.trim()}\n\n---\n\n${base}`
  }
  return base
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, team_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role === 'readonly') {
    return NextResponse.json({ error: 'Sin acceso al copiloto' }, { status: 403 })
  }

  // Request body
  const body = await req.json() as {
    message:      string
    history?:     ChatMessage[]
    currentPage?: string
  }
  const { message, history = [], currentPage = '/' } = body

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })
  }

  // Agent config from DB
  const admin = createAdminClient()
  const { data: toolConfig } = await admin
    .from('ai_tool_configs')
    .select('model, max_tokens, is_enabled, persona_name, system_prompt')
    .eq('tool_id', 'agente')
    .single()

  if (toolConfig && !toolConfig.is_enabled) {
    return NextResponse.json({ error: 'Copiloto IA deshabilitado' }, { status: 503 })
  }

  const model       = (toolConfig?.model       ?? 'claude-haiku-4-5-20251001') as string
  const maxToks     = (toolConfig?.max_tokens  ?? 2048) as number
  const personaName = (toolConfig?.persona_name ?? 'Copiloto IA') as string
  const customPrompt = toolConfig?.system_prompt as string | null | undefined

  // Build system prompt
  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const systemPrompt = buildSystemPrompt(
    personaName,
    profile.full_name ?? user.email ?? 'Usuario',
    profile.role ?? 'agent',
    today,
    currentPage,
    customPrompt,
  )

  // Build message history
  const anthropicMessages: { role: 'user' | 'assistant'; content: string }[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message.trim() },
  ]

  // Tool-use loop
  const client = await getAnthropicClient()
  let reply    = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let conversationMessages: any[] = [...anthropicMessages]

  const userRole   = profile.role   ?? 'agent'
  const userTeamId = profile.team_id ?? null
  const cookieHeader = req.headers.get('cookie') ?? ''
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxToks,
      system:     systemPrompt,
      tools:      AGENT_TOOLS as unknown as Parameters<typeof client.messages.create>[0]['tools'],
      messages:   conversationMessages as unknown as Parameters<typeof client.messages.create>[0]['messages'],
    })

    if (response.stop_reason === 'end_turn') {
      const text = response.content.find(b => b.type === 'text')
      reply = text?.type === 'text' ? text.text : ''
      break
    }

    if (response.stop_reason !== 'tool_use') {
      const text = response.content.find(b => b.type === 'text')
      reply = text?.type === 'text' ? text.text : ''
      break
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')

    // Add assistant's tool_use turn
    conversationMessages = [
      ...conversationMessages,
      { role: 'assistant', content: response.content },
    ]

    // Execute each tool and collect results
    const toolResults = []
    for (const block of toolUseBlocks) {
      if (block.type !== 'tool_use') continue
      const { id: toolUseId, name, input } = block as { id: string; name: string; input: Record<string, unknown> }
      let result: unknown

      try {
        switch (name) {
          case 'get_renewals':
            result = await toolGetRenewals(user.id, userRole, userTeamId, input as Parameters<typeof toolGetRenewals>[3])
            break
          case 'get_policies_expiring':
            result = await toolGetPoliciesExpiring(user.id, userRole, userTeamId, input as Parameters<typeof toolGetPoliciesExpiring>[3])
            break
          case 'get_tasks':
            result = await toolGetTasks(user.id, userRole, userTeamId, input as Parameters<typeof toolGetTasks>[3])
            break
          case 'get_collection_summary':
            result = await toolGetCollectionSummary(user.id, userRole, userTeamId, input as Parameters<typeof toolGetCollectionSummary>[3])
            break
          case 'get_accounts':
            result = await toolGetAccounts(user.id, userRole, userTeamId, input as Parameters<typeof toolGetAccounts>[3])
            break
          case 'create_task':
            result = await toolCreateTask(user.id, input as Parameters<typeof toolCreateTask>[1])
            break
          case 'get_pending_receipts':
            result = await toolGetPendingReceipts(user.id, userRole, userTeamId, input as Parameters<typeof toolGetPendingReceipts>[3])
            break
          case 'send_collection_reminders':
            result = await toolSendCollectionReminders(
              user.id,
              { role: userRole, full_name: profile.full_name ?? null, team_id: userTeamId },
              input as Parameters<typeof toolSendCollectionReminders>[2],
            )
            break
          case 'send_renewal_reminder': {
            const inp = input as { renewal_id: string; channel: 'email' | 'whatsapp' | 'both' }
            result = await toolSendRenewalReminder(inp.renewal_id, inp.channel, cookieHeader, baseUrl)
            break
          }
          case 'update_task_status':
            result = await toolUpdateTaskStatus(user.id, input as Parameters<typeof toolUpdateTaskStatus>[1])
            break
          case 'start_renewal':
            result = await toolStartRenewal(user.id, (input as { policy_id: string }).policy_id)
            break
          default:
            result = { error: `Tool desconocido: ${name}` }
        }
      } catch (e) {
        result = { error: (e as Error).message }
      }

      toolResults.push({
        type:        'tool_result',
        tool_use_id: toolUseId,
        content:     JSON.stringify(result),
      })
    }

    // Add tool results turn
    conversationMessages = [
      ...conversationMessages,
      { role: 'user', content: toolResults },
    ]
  }

  // Log usage (fire-and-forget)
  Promise.resolve().then(async () => {
    try {
      await admin.from('ai_usage_logs').insert({
        tool_id:       'agente',
        user_id:       user.id,
        model,
        input_tokens:  0,
        output_tokens: 0,
      })
    } catch { /* non-blocking */ }
  })

  return NextResponse.json({ reply })
}
