'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath }    from 'next/cache'
import { ALLOWED_MODEL_IDS, estimateCost } from '@/lib/ai-models'
import { getAnthropicClient } from '@/lib/anthropic'

// ─── Tipos ───────────────────────────────────────────────────

export interface ToolConfig {
  id:           string
  tool_id:      string
  tool_name:    string
  model:        string
  max_tokens:   number
  is_enabled:   boolean
  updated_at:   string
  updated_by:   string | null
  updater_name: string | null
  // Copiloto IA persona (migration 031)
  persona_name:  string | null
  system_prompt: string | null
  // Portal AI agent (migration 043)
  agent_type:    string   // 'internal' | 'portal'
}

export interface UsageRow {
  tool_id:      string
  model:        string
  calls:        number
  input_tokens: number
  output_tokens: number
  cost_usd:     number
}

export interface UserUsageRow {
  user_id:       string
  full_name:     string | null
  email:         string
  calls:         number
  input_tokens:  number
  output_tokens: number
  cost_usd:      number
  last_used:     string
}

export interface UsageStats {
  today:     { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }
  month:     { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }
  allTime:   { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }
  byTool:    UsageRow[]
  byUser:    UserUsageRow[]
}

// ─── Helpers ─────────────────────────────────────────────────

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Acceso denegado — se requiere rol admin')
  return user
}

function sumLogs(rows: { input_tokens: number; output_tokens: number; model: string }[]) {
  return rows.reduce(
    (acc, row) => {
      acc.calls        += 1
      acc.input_tokens += row.input_tokens
      acc.output_tokens += row.output_tokens
      acc.cost_usd     += estimateCost(row.model, row.input_tokens, row.output_tokens)
      return acc
    },
    { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }
  )
}

// ─── Actions ─────────────────────────────────────────────────

/**
 * Obtiene la configuración de todas las herramientas IA.
 * Solo accesible para admin.
 */
export async function getToolConfigs(): Promise<ToolConfig[]> {
  await assertAdmin()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('ai_tool_configs')
    .select(`
      id, tool_id, tool_name, model, max_tokens, is_enabled, updated_at, updated_by,
      persona_name, system_prompt, agent_type,
      updater:updated_by ( full_name )
    `)
    .order('tool_name')

  if (error) throw new Error(error.message)

  return (data ?? []).map(row => ({
    id:            row.id,
    tool_id:       row.tool_id,
    tool_name:     row.tool_name,
    model:         row.model,
    max_tokens:    row.max_tokens,
    is_enabled:    row.is_enabled,
    updated_at:    row.updated_at,
    updated_by:    row.updated_by,
    updater_name:  (row.updater as unknown as { full_name: string | null } | null)?.full_name ?? null,
    persona_name:  (row as Record<string, unknown>).persona_name as string | null ?? null,
    system_prompt: (row as Record<string, unknown>).system_prompt as string | null ?? null,
    agent_type:    ((row as Record<string, unknown>).agent_type as string | null) ?? 'internal',
  }))
}

/**
 * Actualiza la configuración de una herramienta IA.
 * Valida el model ID contra la allowlist para prevenir uso de modelos no autorizados.
 */
export async function updateToolConfig(
  toolId:     string,
  model:      string,
  maxTokens:  number,
  isEnabled:  boolean,
): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const user = await assertAdmin()
    userId = user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  // Validar model ID contra allowlist (server-side, nunca confiar en el cliente)
  if (!ALLOWED_MODEL_IDS.includes(model)) {
    return { error: `Modelo no permitido: ${model}` }
  }

  if (maxTokens < 256 || maxTokens > 8192) {
    return { error: 'max_tokens debe estar entre 256 y 8192' }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('ai_tool_configs')
    .update({
      model,
      max_tokens: maxTokens,
      is_enabled: isEnabled,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('tool_id', toolId)

  if (error) return { error: error.message }

  // Audit trail
  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'ai_config.updated',
    entity_type: 'ai_tool_config',
    payload:     { tool_id: toolId, model, max_tokens: maxTokens, is_enabled: isEnabled },
  })

  revalidatePath('/admin/ia')
  return { success: true }
}

/**
 * Obtiene estadísticas de uso de tokens.
 * Solo accesible para admin.
 */
export async function getUsageStats(): Promise<UsageStats> {
  await assertAdmin()
  const admin = createAdminClient()

  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Fetch all logs (join with profiles for user names)
  const { data: allLogs } = await admin
    .from('ai_usage_logs')
    .select('tool_id, model, input_tokens, output_tokens, created_at, user_id, file_name')
    .order('created_at', { ascending: false })

  const logs = allLogs ?? []

  // Aggregate by time period
  const todayLogs = logs.filter(l => l.created_at >= today)
  const monthLogs = logs.filter(l => l.created_at >= month)

  // By tool: aggregate all-time
  const toolMap = new Map<string, { tool_id: string; model: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }>()
  for (const log of logs) {
    const key = log.tool_id
    if (!toolMap.has(key)) {
      toolMap.set(key, { tool_id: log.tool_id, model: log.model, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 })
    }
    const entry = toolMap.get(key)!
    entry.calls        += 1
    entry.input_tokens += log.input_tokens
    entry.output_tokens += log.output_tokens
    entry.cost_usd     += estimateCost(log.model, log.input_tokens, log.output_tokens)
    entry.model         = log.model  // latest model used
  }

  // By user: fetch profiles for names
  const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))]
  let profileMap = new Map<string, { full_name: string | null; email: string }>()

  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds as string[])

    for (const p of profiles ?? []) {
      profileMap.set(p.id, { full_name: p.full_name, email: p.email })
    }
  }

  const userMap = new Map<string, UserUsageRow>()
  for (const log of logs) {
    if (!log.user_id) continue
    if (!userMap.has(log.user_id)) {
      const profile = profileMap.get(log.user_id)
      userMap.set(log.user_id, {
        user_id:       log.user_id,
        full_name:     profile?.full_name ?? null,
        email:         profile?.email ?? log.user_id,
        calls:         0,
        input_tokens:  0,
        output_tokens: 0,
        cost_usd:      0,
        last_used:     log.created_at,
      })
    }
    const entry = userMap.get(log.user_id)!
    entry.calls        += 1
    entry.input_tokens += log.input_tokens
    entry.output_tokens += log.output_tokens
    entry.cost_usd     += estimateCost(log.model, log.input_tokens, log.output_tokens)
    if (log.created_at > entry.last_used) entry.last_used = log.created_at
  }

  return {
    today:   sumLogs(todayLogs),
    month:   sumLogs(monthLogs),
    allTime: sumLogs(logs),
    byTool:  [...toolMap.values()],
    byUser:  [...userMap.values()].sort((a, b) => b.cost_usd - a.cost_usd),
  }
}

// ─── API Key management ───────────────────────────────────────

export interface ApiKeyStatus {
  provider:      string
  key_label:     string
  masked_key:    string        // últimos 8 chars
  updated_at:    string | null
  updated_by_name: string | null
  is_active:     boolean
}

/**
 * Devuelve el estado de la API key de un proveedor (key mascarada).
 * Nunca devuelve el valor real al cliente.
 */
export async function getApiKeyStatus(provider: string): Promise<ApiKeyStatus | null> {
  await assertAdmin()
  const admin = createAdminClient()

  const { data } = await admin
    .from('api_keys')
    .select(`
      provider, key_value, key_label, is_active, updated_at, updated_by,
      updater:updated_by ( full_name )
    `)
    .eq('provider', provider)
    .single()

  if (!data) return null

  const keyLen = data.key_value?.length ?? 0
  const masked = keyLen > 8
    ? '•'.repeat(keyLen - 8) + data.key_value.slice(-8)
    : '•'.repeat(keyLen)

  return {
    provider:        data.provider,
    key_label:       data.key_label ?? '',
    masked_key:      masked,
    updated_at:      data.updated_at ?? null,
    updated_by_name: (data.updater as unknown as { full_name: string | null } | null)?.full_name ?? null,
    is_active:       data.is_active,
  }
}

/**
 * Guarda (UPSERT) una API key de proveedor.
 * Registra en audit_events sin revelar el valor de la key.
 */
export async function saveApiKey(
  provider:  string,
  keyValue:  string,
  keyLabel:  string,
): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const user = await assertAdmin()
    userId = user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const trimmed = keyValue.trim()
  if (!trimmed) return { error: 'El valor de la key no puede estar vacío' }
  if (trimmed.length < 20) return { error: 'La key parece demasiado corta — verifica que sea completa' }

  const admin = createAdminClient()

  const { error } = await admin
    .from('api_keys')
    .upsert({
      provider,
      key_value:  trimmed,
      key_label:  keyLabel.trim(),
      is_active:  true,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider' })

  if (error) return { error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'api_key.updated',
    entity_type: 'api_key',
    payload:     { provider, key_label: keyLabel.trim() },
    // Nunca guardar key_value en audit_events
  })

  revalidatePath('/admin/ia')
  return { success: true }
}

// ─── Config history ───────────────────────────────────────────

export interface ConfigHistoryRow {
  id:         string
  action:     string
  actor_name: string | null
  created_at: string
  payload:    Record<string, unknown>
}

/**
 * Devuelve los últimos N cambios de configuración IA y API keys.
 */
export async function getConfigHistory(limit = 20): Promise<ConfigHistoryRow[]> {
  await assertAdmin()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('audit_events')
    .select(`
      id, action, created_at, payload,
      actor:actor_id ( full_name )
    `)
    .in('action', ['ai_config.updated', 'api_key.updated'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  return (data ?? []).map(row => ({
    id:         row.id,
    action:     row.action,
    actor_name: (row.actor as unknown as { full_name: string | null } | null)?.full_name ?? null,
    created_at: row.created_at,
    payload:    (row.payload ?? {}) as Record<string, unknown>,
  }))
}

// ─── Test model ───────────────────────────────────────────────

export interface TestModelResult {
  ok:            boolean
  latency_ms:    number
  input_tokens:  number
  output_tokens: number
  reply:         string
  error?:        string
}

/**
 * Llama a Anthropic con el modelo configurado para una herramienta
 * usando un prompt mínimo ("Responde solo 'ok'") para validar la key y el modelo.
 * NO loguea en ai_usage_logs (es un test, no uso de producción).
 */
export async function testModelCall(toolId: string): Promise<TestModelResult> {
  await assertAdmin()

  const admin = createAdminClient()
  const { data: toolConfig } = await admin
    .from('ai_tool_configs')
    .select('model')
    .eq('tool_id', toolId)
    .single()

  if (!toolConfig) {
    return { ok: false, latency_ms: 0, input_tokens: 0, output_tokens: 0, reply: '', error: 'Herramienta no encontrada' }
  }

  const client = await getAnthropicClient()
  const t0 = Date.now()

  try {
    const response = await client.messages.create({
      model:      toolConfig.model,
      max_tokens: 16,
      messages:   [{ role: 'user', content: "Responde únicamente con la palabra 'ok'" }],
    })

    const latency_ms    = Date.now() - t0
    const reply         = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    const input_tokens  = response.usage.input_tokens
    const output_tokens = response.usage.output_tokens

    return { ok: true, latency_ms, input_tokens, output_tokens, reply }
  } catch (err) {
    return {
      ok:            false,
      latency_ms:    Date.now() - t0,
      input_tokens:  0,
      output_tokens: 0,
      reply:         '',
      error:         err instanceof Error ? err.message : 'Error desconocido',
    }
  }
}

// ─── Copiloto persona ────────────────────────────────────────────────────────

/**
 * Actualiza el nombre y las instrucciones personalizadas del Copiloto IA.
 * Solo accesible para admin.
 */
export async function updateAgentPersona(
  toolId:       string,
  personaName:  string,
  systemPrompt: string | null,
): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const user = await assertAdmin()
    userId = user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const trimmedName = personaName.trim()
  if (!trimmedName) return { error: 'El nombre no puede estar vacío' }
  if (trimmedName.length > 100) return { error: 'Nombre demasiado largo (máx 100 caracteres)' }
  if (systemPrompt && systemPrompt.length > 4000) {
    return { error: 'Instrucciones demasiado largas (máx 4000 caracteres)' }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('ai_tool_configs')
    .update({
      persona_name:  trimmedName,
      system_prompt: systemPrompt?.trim() || null,
      updated_by:    userId,
      updated_at:    new Date().toISOString(),
    })
    .eq('tool_id', toolId)

  if (error) return { error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'ai_config.updated',
    entity_type: 'ai_tool_config',
    payload:     { tool_id: toolId, persona_name: trimmedName, system_prompt_set: !!(systemPrompt?.trim()) },
  })

  revalidatePath('/admin/ia')
  return { success: true }
}

// ─── Portal Agents ────────────────────────────────────────────────────────────

/**
 * Crea un nuevo agente portal con la configuración dada.
 * Solo accesible para admin.
 */
export async function createPortalAgent(payload: {
  toolName:     string
  personaName:  string
  systemPrompt: string
  model:        string
  maxTokens:    number
}): Promise<{ success: true; id: string } | { error: string }> {
  let userId: string
  try {
    const user = await assertAdmin()
    userId = user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const name = payload.toolName.trim()
  if (!name) return { error: 'El nombre del agente no puede estar vacío' }
  if (name.length > 100) return { error: 'Nombre demasiado largo (máx 100 caracteres)' }

  const pName = payload.personaName.trim()
  if (!pName) return { error: 'El nombre de la persona no puede estar vacío' }

  if (!ALLOWED_MODEL_IDS.includes(payload.model)) {
    return { error: `Modelo no permitido: ${payload.model}` }
  }

  if (payload.maxTokens < 256 || payload.maxTokens > 8192) {
    return { error: 'max_tokens debe estar entre 256 y 8192' }
  }

  const admin = createAdminClient()

  // Generate a unique tool_id from the name
  const toolId = `portal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const { data, error } = await admin
    .from('ai_tool_configs')
    .insert({
      tool_id:       toolId,
      tool_name:     name,
      persona_name:  pName,
      system_prompt: payload.systemPrompt.trim() || null,
      model:         payload.model,
      max_tokens:    payload.maxTokens,
      is_enabled:    true,
      agent_type:    'portal',
      updated_by:    userId,
      updated_at:    new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'ai_config.updated',
    entity_type: 'ai_tool_config',
    payload:     { tool_id: toolId, tool_name: name, agent_type: 'portal', action: 'created' },
  })

  revalidatePath('/admin/ia')
  return { success: true, id: data.id }
}

/**
 * Elimina un agente portal (solo agent_type='portal').
 * Solo accesible para admin.
 */
export async function deletePortalAgent(
  id: string,
): Promise<{ success: true } | { error: string }> {
  let userId: string
  try {
    const user = await assertAdmin()
    userId = user.id
  } catch (e) {
    return { error: (e as Error).message }
  }

  const admin = createAdminClient()

  // Safety: only allow deleting portal agents
  const { data: existing } = await admin
    .from('ai_tool_configs')
    .select('tool_id, tool_name, agent_type')
    .eq('id', id)
    .single()

  if (!existing) return { error: 'Agente no encontrado' }
  if (existing.agent_type !== 'portal') return { error: 'Solo se pueden eliminar agentes de tipo portal' }

  // Unassign from all accounts first
  await admin
    .from('accounts')
    .update({ ai_agent_id: null })
    .eq('ai_agent_id', id)

  const { error } = await admin
    .from('ai_tool_configs')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  await admin.from('audit_events').insert({
    actor_id:    userId,
    action:      'ai_config.updated',
    entity_type: 'ai_tool_config',
    payload:     { tool_id: existing.tool_id, tool_name: existing.tool_name, agent_type: 'portal', action: 'deleted' },
  })

  revalidatePath('/admin/ia')
  return { success: true }
}
