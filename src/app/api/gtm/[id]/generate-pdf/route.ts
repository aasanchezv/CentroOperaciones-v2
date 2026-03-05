import { NextRequest, NextResponse }    from 'next/server'
import { createClient }                from '@/lib/supabase/server'
import { createAdminClient }           from '@/lib/supabase/admin'
import { getAnthropicClient }          from '@/lib/anthropic'
import React                           from 'react'
import { renderToBuffer }              from '@react-pdf/renderer'
import { CommercialProposalDoc }       from '@/components/pdf/CommercialProposalDoc'
import type { ProposalDocData }        from '@/components/pdf/CommercialProposalDoc'

const DEFAULT_MODEL      = 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 2048

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
  const admin             = createAdminClient()

  // Load process + analyzed proposals
  const [processRes, insurersRes] = await Promise.all([
    admin
      .from('gtm_processes')
      .select('id, title, branch, slip_extracted, ai_recommendation, account_id, account:accounts!gtm_processes_account_id_fkey(name)')
      .eq('id', processId)
      .single(),

    admin
      .from('gtm_process_insurers')
      .select('id, insurer_id, ai_prima, ai_suma_asegurada, ai_coberturas, ai_exclusiones, ai_deducible, ai_vigencia, ai_condiciones, status, insurer:insurers!gtm_process_insurers_insurer_id_fkey(name, logo_url)')
      .eq('process_id', processId)
      .in('status', ['analyzed', 'declined']),
  ])

  if (processRes.error || !processRes.data) {
    return NextResponse.json({ error: 'Proceso no encontrado' }, { status: 404 })
  }

  const process  = processRes.data
  const insurers = insurersRes.data ?? []
  const analyzed = insurers.filter(i => i.status === 'analyzed')

  if (!analyzed.length) {
    return NextResponse.json({ error: 'No hay propuestas analizadas para generar la comparativa' }, { status: 400 })
  }

  const p        = process as unknown as Record<string, unknown>
  const extracted = process.slip_extracted as Record<string, string | null> | null
  const accountName = (p.account as { name: string } | null)?.name ?? ''

  // Generate AI recommendation if not present
  let recommendation = process.ai_recommendation

  if (!recommendation) {
    try {
      const proposalsSummary = analyzed.map(ins => {
        const ir = ins as unknown as Record<string, unknown>
        const insurerName = (ir.insurer as { name: string } | null)?.name ?? 'N/A'
        return `${insurerName}: prima=${ins.ai_prima ?? 'N/A'}, suma_asegurada=${ins.ai_suma_asegurada ?? 'N/A'}, coberturas=${ins.ai_coberturas ?? 'N/A'}, deducible=${ins.ai_deducible ?? 'N/A'}`
      }).join('\n')

      const prompt = `Eres un asesor de seguros experto de Murguía Seguros.
Basado en las siguientes propuestas recibidas de aseguradoras, redacta una recomendación profesional y concisa para el cliente en español mexicano.

PROCESO: ${process.title}
RAMO: ${process.branch ?? 'N/A'}
CLIENTE: ${accountName || (extracted?.client_name ?? 'N/A')}

PROPUESTAS RECIBIDAS:
${proposalsSummary}

Redacta 2-3 párrafos:
1. Resumen ejecutivo del resultado del proceso
2. Recomendación de la mejor opción o combinación, con justificación
3. Próximos pasos sugeridos

Sé conciso, profesional y claro.`

      const { data: toolConfig } = await admin
        .from('ai_tool_configs')
        .select('model, max_tokens')
        .eq('tool_id', 'agente')
        .single()

      const model     = toolConfig?.model     ?? DEFAULT_MODEL
      const maxTokens = toolConfig?.max_tokens ?? DEFAULT_MAX_TOKENS

      const client    = await getAnthropicClient()
      const response  = await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages:   [{ role: 'user', content: prompt }],
      })

      void admin.from('ai_usage_logs').insert({
        tool_id:       'gtm_generate',
        user_id:       user.id,
        model,
        input_tokens:  response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      })

      recommendation = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''

      // Save recommendation
      await admin
        .from('gtm_processes')
        .update({ ai_recommendation: recommendation })
        .eq('id', processId)

    } catch {
      recommendation = 'No fue posible generar una recomendación automática. Por favor, edite este campo manualmente.'
    }
  }

  // Build PDF data
  const docData: ProposalDocData = {
    process_title:  process.title,
    branch:         process.branch ?? '',
    client_name:    accountName || (extracted?.client_name ?? ''),
    fecha:          new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }),
    asesor:         profile.full_name ?? '',
    slip:           {
      suma_asegurada:       extracted?.suma_asegurada ?? '',
      coberturas_requeridas: extracted?.coberturas_requeridas ?? '',
      vigencia_from:        extracted?.vigencia_from ?? '',
      vigencia_to:          extracted?.vigencia_to ?? '',
      deducible:            extracted?.deducible ?? '',
      condiciones:          extracted?.condiciones_especiales ?? '',
    },
    proposals: analyzed.map(ins => {
      const ir          = ins as unknown as Record<string, unknown>
      const insurerName = (ir.insurer as { name: string; logo_url: string | null } | null)?.name ?? ''
      return {
        insurer_name:  insurerName,
        prima:         ins.ai_prima ?? null,
        suma_asegurada: ins.ai_suma_asegurada ?? '',
        coberturas:    ins.ai_coberturas ?? '',
        exclusiones:   ins.ai_exclusiones ?? '',
        deducible:     ins.ai_deducible ?? '',
        vigencia:      ins.ai_vigencia ?? '',
        condiciones:   ins.ai_condiciones ?? '',
      }
    }),
    recommendation: recommendation ?? '',
  }

  // Generate PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(React.createElement(CommercialProposalDoc, { data: docData }) as any)

  // Upload PDF to Storage
  const pdfPath = `reports/${processId}/propuesta.pdf`
  const { error: uploadError } = await admin.storage
    .from('gtm-files')
    .upload(pdfPath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert:      true,
    })

  if (uploadError) {
    return NextResponse.json({ error: 'Error al guardar PDF: ' + uploadError.message }, { status: 500 })
  }

  // Update process
  await admin
    .from('gtm_processes')
    .update({
      proposal_pdf_url: pdfPath,
      status:           'proposal_ready',
      updated_at:       new Date().toISOString(),
    })
    .eq('id', processId)

  // Generate signed URL for download
  const { data: signedData } = await admin.storage
    .from('gtm-files')
    .createSignedUrl(pdfPath, 3600)

  return NextResponse.json({ ok: true, pdf_url: signedData?.signedUrl ?? null })
}
