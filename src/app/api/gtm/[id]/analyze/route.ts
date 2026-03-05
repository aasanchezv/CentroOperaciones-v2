import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }        from '@/lib/supabase/admin'
import { getAnthropicClient }       from '@/lib/anthropic'

const DEFAULT_MODEL      = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 1024

// Called internally (fire-and-forget from upload endpoint)
// Auth: x-internal-secret header OR admin session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Verify internal secret
  const secret = request.headers.get('x-internal-secret')
  if (secret !== (process.env.INTERNAL_SECRET ?? '') && !process.env.INTERNAL_SECRET) {
    // Allow if INTERNAL_SECRET not set (dev mode)
  } else if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id: processId } = await params
  const admin             = createAdminClient()

  let body: { insurerRecordId?: string } = {}
  try { body = await request.json() as { insurerRecordId?: string } } catch { /* ok */ }

  if (!body.insurerRecordId) {
    return NextResponse.json({ error: 'insurerRecordId requerido' }, { status: 400 })
  }

  // Load insurer record
  const { data: record } = await admin
    .from('gtm_process_insurers')
    .select('id, process_id, proposal_url, proposal_filename, status')
    .eq('id', body.insurerRecordId)
    .eq('process_id', processId)
    .single()

  if (!record?.proposal_url) {
    return NextResponse.json({ error: 'Sin propuesta cargada' }, { status: 400 })
  }

  // Download proposal from Storage
  const { data: fileData, error: dlError } = await admin.storage
    .from('gtm-files')
    .download(record.proposal_url)

  if (dlError || !fileData) {
    return NextResponse.json({ error: 'Error al descargar propuesta' }, { status: 500 })
  }

  try {
    const buffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    // Determine type (assume PDF if not clear from filename)
    const filename = record.proposal_filename ?? ''
    const isPdf    = filename.toLowerCase().endsWith('.pdf') || !filename.match(/\.(jpg|jpeg|png)$/i)
    const mimeType = isPdf ? 'application/pdf' : 'image/jpeg'

    const prompt = `Eres un extractor de datos de propuestas de seguros mexicanas.
Analiza esta propuesta y extrae los datos en JSON.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni markdown.
Si un campo no está disponible, usa null.
Para la prima usa solo números (sin comas ni símbolos de moneda).

Extrae este JSON exacto:
{
  "prima_anual": "monto de la prima anual (solo número)",
  "suma_asegurada": "suma asegurada propuesta",
  "coberturas_incluidas": ["listado de coberturas incluidas"],
  "exclusiones_clave": ["principales exclusiones"],
  "deducible": "deducible propuesto",
  "vigencia_propuesta": "vigencia propuesta (fechas o duración)",
  "condiciones_especiales": "condiciones o requisitos especiales"
}`

    type ContentBlock =
      | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
      | { type: 'image';    source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text';     text: string }

    const contentBlocks: ContentBlock[] = isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text',     text: prompt },
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text',  text: prompt },
        ]

    // Get AI config
    const { data: toolConfig } = await admin
      .from('ai_tool_configs')
      .select('model, max_tokens')
      .eq('tool_id', 'captura')
      .single()

    const model     = toolConfig?.model     ?? DEFAULT_MODEL
    const maxTokens = toolConfig?.max_tokens ?? DEFAULT_MAX_TOKENS

    const client   = await getAnthropicClient()
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages:   [{
        role:    'user',
        content: contentBlocks as Parameters<typeof client.messages.create>[0]['messages'][0]['content'],
      }],
    })

    // Log usage (fire-and-forget)
    void admin.from('ai_usage_logs').insert({
      tool_id:       'gtm_analyze',
      user_id:       null,
      model,
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      file_name:     record.proposal_filename ?? 'propuesta.pdf',
    })

    const rawText   = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    const jsonStr   = jsonMatch ? jsonMatch[0] : '{}'

    let extracted: Record<string, unknown> = {}
    try { extracted = JSON.parse(jsonStr) as Record<string, unknown> } catch { /* ok */ }

    const prima = extracted.prima_anual
      ? parseFloat(String(extracted.prima_anual).replace(/[^0-9.]/g, ''))
      : null

    const coberturas = Array.isArray(extracted.coberturas_incluidas)
      ? (extracted.coberturas_incluidas as string[]).join(' • ')
      : (extracted.coberturas_incluidas as string | null)

    const exclusiones = Array.isArray(extracted.exclusiones_clave)
      ? (extracted.exclusiones_clave as string[]).join(' • ')
      : (extracted.exclusiones_clave as string | null)

    // Update insurer record with AI analysis
    await admin
      .from('gtm_process_insurers')
      .update({
        status:           'analyzed',
        analyzed_at:      new Date().toISOString(),
        ai_prima:         isNaN(prima ?? NaN) ? null : prima,
        ai_suma_asegurada: extracted.suma_asegurada as string | null ?? null,
        ai_coberturas:    coberturas ?? null,
        ai_exclusiones:   exclusiones ?? null,
        ai_deducible:     extracted.deducible as string | null ?? null,
        ai_vigencia:      extracted.vigencia_propuesta as string | null ?? null,
        ai_condiciones:   extracted.condiciones_especiales as string | null ?? null,
      })
      .eq('id', record.id)

    // Check if all insurers for this process are analyzed or declined
    const { data: allRecords } = await admin
      .from('gtm_process_insurers')
      .select('status')
      .eq('process_id', processId)

    const allDone = (allRecords ?? []).every(r =>
      ['analyzed', 'declined'].includes(r.status)
    )

    if (allDone && (allRecords ?? []).some(r => r.status === 'analyzed')) {
      await admin
        .from('gtm_processes')
        .update({ status: 'analyzing', updated_at: new Date().toISOString() })
        .eq('id', processId)
        .in('status', ['waiting', 'sending'])
    }

    return NextResponse.json({ ok: true, extracted })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
