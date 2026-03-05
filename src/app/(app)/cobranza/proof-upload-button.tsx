'use client'

import { useRef, useState } from 'react'
import { createClient }     from '@/lib/supabase/client'
import { createProofUploadUrl, registerProof } from '@/app/actions/proof-actions'
import { Upload, CheckCircle, Loader2 } from 'lucide-react'

interface Props {
  collectionSendId: string
  hasProof:         boolean
}

export function ProofUploadButton({ collectionSendId, hasProof: initialHasProof }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus]     = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [hasProof, setHasProof] = useState(initialHasProof)
  const [message, setMessage]   = useState<string | null>(null)

  if (hasProof) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
        <CheckCircle className="h-3 w-3" />
        Comprobante
      </span>
    )
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('uploading')
    setMessage(null)

    try {
      // 1. Obtener URL firmada de subida desde el servidor
      const { token, path } = await createProofUploadUrl(collectionSendId, file.name)

      // 2. Subir directamente al bucket desde el browser
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('comprobantes')
        .uploadToSignedUrl(path, token, file, { contentType: file.type })

      if (uploadError) throw new Error(uploadError.message)

      // 3. Registrar en DB + notificar Mesa de Control
      const result = await registerProof(
        collectionSendId,
        path,
        file.name,
        file.size,
        file.type,
      )

      setHasProof(true)
      setStatus('done')
      setMessage(result.sentToControl ? 'Enviado a Mesa de Control' : 'Comprobante guardado')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      // Reset input so the same file can be re-selected if needed
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === 'uploading'}
        className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-700 disabled:opacity-40 transition-colors"
        title="Subir comprobante de pago"
      >
        {status === 'uploading'
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <Upload className="h-3 w-3" />
        }
        {status === 'uploading' ? 'Subiendo…' : 'Comprobante'}
      </button>
      {message && (
        <span className={`text-[9px] leading-none ${status === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
          {message}
        </span>
      )}
    </div>
  )
}
