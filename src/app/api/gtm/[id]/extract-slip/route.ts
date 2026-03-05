import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'
import { createAdminClient }        from '@/lib/supabase/admin'
import { getAnthropicClient }       from '@/lib/anthropic'
import * as XLSX                    from 'xlsx'

const DEFAULT_MODEL      = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 1024

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const { id: processId } = await params
  const admin = createAdminClient()

  // Load process to get slip_url
  const { data: process } = await admin
    .from('gtm_processes')
    .select('id, slip_url, slip_filename')
    .eq('id', processId)
    .single()

  if (!process?.slip_url) {
    return NextResponse.json({ error: 'El proceso no tiene un slip cargado' }, { status: 400 })
  }

  try {
    // Download the Excel file from Storage
    const { data: fileData, error: downloadError } = await admin.storage
      .from('gtm-files')
      .download(process.slip_url)

    if (downloadError || !fileData) {
      return NextResponse.json({ error: 'No se pudo descargar el slip' }, { status: 500 })
    }

    // Parse Excel with xlsx
    const buffer    = await fileData.arrayBuffer()
    const workbook  = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet     = workbook.Sheets[sheetName]

    // Convert to CSV text for Claude
    const csvText   = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    const jsonData  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    const tableText = (jsonData as unknown[][])
      .filter((row: unknown[]) => row.some(cell => String(cell).trim()))
      .slice(0, 80)  // limit to 80 rows
      .map((row: unknown[]) => row.map(cell => String(cell ?? '').trim()).join(' | '))
      .join('\n')

    const slipContent = tableText || csvText.slice(0, 4000)

    // Build AI prompt
    const prompt = `Eres un extractor de datos de slips de cotización de seguros mexicanos.
Analiza el siguiente slip de cotización (en formato tabla) y extrae los datos en JSON.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni markdown.
Si un campo no está presente, usa null.
Para fechas usa formato YYYY-MM-DD si es posible.
Para montos usa solo números (sin comas ni símbolos).

CONTENIDO DEL SLIP:
${slipContent}

Extrae este JSON exacto:
{
  "client_name": "nombre del cliente o empresa asegurada",
  "ramo": "ramo de seguro (GMM, Autos, Vida, Daños, RC, etc.)",
  "suma_asegurada": "suma asegurada (número o rango)",
  "deducible": "deducible solicitado",
  "coaseguro_pct": "porcentaje de coaseguro si aplica",
  "vigencia_from": "fecha inicio vigencia",
  "vigencia_to": "fecha fin vigencia",
  "coberturas_requeridas": "lista de coberturas solicitadas",
  "condiciones_especiales": "condiciones o requisitos especiales",
  "numero_asegurados": "número de personas aseguradas si aplica",
  "edad_promedio": "edad promedio del grupo si aplica",
  "contacto_cliente": "nombre del contacto del cliente",
  "observaciones": "observaciones generales"
}`

    // Get AI config
    const { data: toolConfig } = await admin
      .from('ai_tool_configs')
      .select('model, max_tokens, is_enabled')
      .eq('tool_id', 'captura')
      .single()

    const model     = toolConfig?.model     ?? DEFAULT_MODEL
    const maxTokens = toolConfig?.max_tokens ?? DEFAULT_MAX_TOKENS

    const client   = await getAnthropicClient()
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })

    // Log usage
    void admin.from('ai_usage_logs').insert({
      tool_id:       'gtm_extract',
      user_id:       user.id,
      model,
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      file_name:     process.slip_filename ?? 'slip.xlsx',
    })

    const rawText  = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    const jsonStr   = jsonMatch ? jsonMatch[0] : '{}'

    let extracted: Record<string, string | null> = {}
    try {
      extracted = JSON.parse(jsonStr) as Record<string, string | null>
    } catch {
      extracted = {}
    }

    // Save to DB
    await admin
      .from('gtm_processes')
      .update({ slip_extracted: extracted, updated_at: new Date().toISOString() })
      .eq('id', processId)

    return NextResponse.json({ extracted })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
