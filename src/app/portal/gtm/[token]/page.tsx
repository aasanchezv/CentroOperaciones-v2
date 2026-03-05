// Public page — no auth required. Token-based access for insurers to upload proposals.

import { createAdminClient } from '@/lib/supabase/admin'
import { InsurerUpload }     from './insurer-upload'

interface Props {
  params: Promise<{ token: string }>
}

export default async function GtmUploadPage({ params }: Props) {
  const { token } = await params
  const admin     = createAdminClient()

  // Look up the insurer record by upload_token
  const { data: record } = await admin
    .from('gtm_process_insurers')
    .select(`
      id, status, received_at, proposal_filename,
      process:gtm_processes!gtm_process_insurers_process_id_fkey(
        title, branch, slip_extracted
      ),
      insurer:insurers!gtm_process_insurers_insurer_id_fkey(name, logo_url)
    `)
    .eq('upload_token', token)
    .single()

  if (!record) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Link inválido</h1>
          <p className="text-sm text-gray-500">Este enlace no es válido o ha expirado. Por favor contacte a Murguía Seguros.</p>
        </div>
      </main>
    )
  }

  const r           = record as unknown as Record<string, unknown>
  const process     = r.process as { title: string; branch: string | null; slip_extracted: Record<string, string | null> | null } | null
  const insurer     = r.insurer as { name: string; logo_url: string | null } | null
  const extracted   = process?.slip_extracted

  const alreadyReceived = !['pending','sent'].includes(record.status)

  return (
    <InsurerUpload
      token={token}
      insurerName={insurer?.name ?? ''}
      processTitle={process?.title ?? ''}
      branch={process?.branch ?? ''}
      clientName={extracted?.client_name ?? ''}
      sumaAsegurada={extracted?.suma_asegurada ?? ''}
      vigenciaFrom={extracted?.vigencia_from ?? ''}
      vigenciaTo={extracted?.vigencia_to ?? ''}
      alreadyReceived={alreadyReceived}
      receivedAt={record.received_at ?? null}
      proposalFilename={record.proposal_filename ?? null}
    />
  )
}
