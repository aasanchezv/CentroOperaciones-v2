import { NextRequest, NextResponse }  from 'next/server'
import { createClient }               from '@/lib/supabase/server'
import { createAdminClient }          from '@/lib/supabase/admin'
import { getAnthropicClient }         from '@/lib/anthropic'

interface TemplateField {
  id:    string
  key:   string
  label: string
  type:  'text' | 'number' | 'date'
}

interface ExtractRequest {
  fileData:  string   // base64
  mimeType:  string   // 'application/pdf' | 'image/jpeg' | 'image/png' | ...
  fileName:  string
  fields:    TemplateField[]
}

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
const SUPPORTED_PDF_TYPE    = 'application/pdf'

// Fallback en caso de que la tabla ai_tool_configs no exista aún
const DEFAULT_MODEL      = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 1024

export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  let body: ExtractRequest
  try {
    body = await request.json() as ExtractRequest
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const { fileData, mimeType, fileName, fields } = body

  if (!fileData || !mimeType || !fields?.length) {
    return NextResponse.json({ error: 'Faltan parámetros: fileData, mimeType, fields' }, { status: 400 })
  }

  const isPdf   = mimeType === SUPPORTED_PDF_TYPE
  const isImage = SUPPORTED_IMAGE_TYPES.includes(mimeType)

  if (!isPdf && !isImage) {
    return NextResponse.json({ error: `Tipo de archivo no soportado: ${mimeType}` }, { status: 400 })
  }

  // ── Obtener configuración del modelo desde DB ─────────────
  // Usamos el admin client para leer ai_tool_configs (solo accesible para admin vía RLS,
  // pero el service_role bypassa RLS para operaciones de servidor).
  const admin = createAdminClient()
  const { data: toolConfig } = await admin
    .from('ai_tool_configs')
    .select('model, max_tokens, is_enabled')
    .eq('tool_id', 'captura')
    .single()

  if (toolConfig && !toolConfig.is_enabled) {
    return NextResponse.json({ error: 'Captura IA está deshabilitada temporalmente' }, { status: 503 })
  }

  const model     = toolConfig?.model     ?? DEFAULT_MODEL
  const maxTokens = toolConfig?.max_tokens ?? DEFAULT_MAX_TOKENS

  // Build field extraction prompt
  const fieldList = fields.map(f => `"${f.key}": ${f.label}${f.type !== 'text' ? ` (${f.type})` : ''}`).join('\n')

  const extractionPrompt = `Eres un sistema experto en extracción de datos de pólizas de seguros mexicanas.
Analiza el documento adjunto y extrae exactamente los siguientes campos.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.
Si un campo no está presente o no puedes determinarlo con certeza, usa null.
Para fechas usa formato YYYY-MM-DD cuando sea posible.
Para números usa solo dígitos y punto decimal (sin comas ni símbolos de moneda).

Campos a extraer:
${fieldList}

Responde solo con el JSON en este formato exacto:
{"${fields[0]?.key ?? 'campo'}": "valor o null", ...}`

  try {
    // Build content blocks based on file type
    type ContentBlock =
      | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
      | { type: 'image';    source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text';     text: string }

    const contentBlocks: ContentBlock[] = isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } },
          { type: 'text', text: extractionPrompt },
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileData } },
          { type: 'text', text: extractionPrompt },
        ]

    // Obtener cliente con la key de DB (fallback a env var)
    const client  = await getAnthropicClient()
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{
        role:    'user',
        content: contentBlocks as Parameters<typeof client.messages.create>[0]['messages'][0]['content'],
      }],
    })

    // ── Loguear uso de tokens (fire-and-forget) ───────────────
    // Usamos admin client para bypassar RLS (clients tienen WITH CHECK (false) en INSERT).
    void admin.from('ai_usage_logs').insert({
      tool_id:       'captura',
      user_id:       user.id,
      model,
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      file_name:     fileName ?? null,
    })  // fire-and-forget — no bloquear la respuesta

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

    // Extract JSON from response (handle possible markdown wrapping)
    let jsonStr = rawText
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) jsonStr = jsonMatch[0]

    let extracted: Record<string, string | null>
    try {
      extracted = JSON.parse(jsonStr) as Record<string, string | null>
    } catch {
      // Claude returned non-JSON; try to salvage
      extracted = Object.fromEntries(fields.map(f => [f.key, null]))
    }

    // Ensure all requested fields exist in result
    for (const field of fields) {
      if (!(field.key in extracted)) extracted[field.key] = null
    }

    return NextResponse.json({ extracted })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
