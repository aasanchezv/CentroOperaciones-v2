'use client'

import { useState, useRef }     from 'react'
import { X, Upload, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { createAdminClient }    from '@/lib/supabase/admin'
import type { GtmInsurerRecord } from '@/app/actions/gtm-actions'

interface UploadProposalSheetProps {
  record:     GtmInsurerRecord
  processId:  string
  onClose:    () => void
  onUploaded: (updatedRecord: GtmInsurerRecord) => void
}

export function UploadProposalSheet({ record, processId, onClose, onUploaded }: UploadProposalSheetProps) {
  const [file,      setFile]      = useState<File | null>(null)
  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(f: File | null) {
    if (!f) return
    if (f.size > 20 * 1024 * 1024) { setError('El archivo no puede superar 20 MB'); return }
    setError(null)
    setFile(f)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)

      const res  = await fetch(`/api/gtm/upload/${record.upload_token}`, {
        method: 'POST',
        body:   form,
      })
      const json = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok || json.error) {
        setError(json.error ?? 'Error al subir')
        return
      }

      setSuccess(true)
      const updated: GtmInsurerRecord = {
        ...record,
        status:           'received',
        received_at:      new Date().toISOString(),
        proposal_filename: file.name,
        // proposal_url will be set server-side; we just mark it received
        proposal_url:     `proposals/${processId}/${record.insurer_id}/manual`,
      }
      setTimeout(() => onUploaded(updated), 1200)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center p-4 bg-black/30">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Subir propuesta</h3>
            <p className="text-xs text-gray-500 mt-0.5">{record.insurer_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {success ? (
            <div className="text-center py-4 space-y-2">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
              <p className="text-sm font-medium text-green-700">Propuesta recibida</p>
              <p className="text-xs text-gray-500">El AI analizará la propuesta en segundos</p>
            </div>
          ) : (
            <>
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-blue-400 bg-blue-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files[0] ?? null) }}
                onClick={() => inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div>
                    <CheckCircle2 className="h-7 w-7 text-green-500 mx-auto mb-1" />
                    <p className="text-sm text-green-700 font-medium">{file.name}</p>
                    <p className="text-xs text-green-500">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-7 w-7 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">PDF, JPG o PNG — máx. 20 MB</p>
                  </div>
                )}
              </div>

              {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="flex items-center gap-1.5 rounded-md bg-[#0A2F6B] px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-40"
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {uploading ? 'Subiendo…' : 'Subir propuesta'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
