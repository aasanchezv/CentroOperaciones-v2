'use client'

import { useState, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, X, CheckCircle2,
} from 'lucide-react'
import type { TemplateField } from '@/app/actions/capture-actions'

// ─── Types ────────────────────────────────────────────────────

export interface ReviewFileRow {
  id:        string
  file:      File
  fileName:  string
  extracted: Record<string, string>
}

interface Props {
  initialFileId: string
  files:         ReviewFileRow[]   // only done files, in table order
  fields:        TemplateField[]
  onChange:      (fileId: string, key: string, value: string) => void
  onClose:       () => void
}

// ─── CaptureReviewDialog ──────────────────────────────────────

export function CaptureReviewDialog({
  initialFileId, files, fields, onChange, onClose,
}: Props) {
  const [currentId,  setCurrentId]  = useState(initialFileId)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const idx     = files.findIndex(f => f.id === currentId)
  const current = files[idx] ?? files[0]
  const prevFile = idx > 0              ? files[idx - 1] : null
  const nextFile = idx < files.length - 1 ? files[idx + 1] : null

  // Blob URL lifecycle per file
  useEffect(() => {
    if (!current?.file) return
    const url = URL.createObjectURL(current.file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')          { onClose(); return }
      if (e.key === 'ArrowRight' && nextFile) setCurrentId(nextFile.id)
      if (e.key === 'ArrowLeft'  && prevFile) setCurrentId(prevFile.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nextFile, prevFile, onClose])

  if (!current) return null

  const isPDF = current.file.type === 'application/pdf'

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-stretch p-4">
      <div className="flex-1 flex bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* ── Left: document viewer ─────────────────────────── */}
        <div className="flex-1 flex flex-col border-r min-w-0">

          {/* Viewer header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-white shrink-0">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
              title="Cerrar (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="text-sm font-medium text-gray-700 truncate flex-1 min-w-0">
              {current.fileName}
            </p>
            {/* Navigation */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-400 mr-1">
                {idx + 1} / {files.length}
              </span>
              <button
                onClick={() => prevFile && setCurrentId(prevFile.id)}
                disabled={!prevFile}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                title="Anterior (←)"
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </button>
              <button
                onClick={() => nextFile && setCurrentId(nextFile.id)}
                disabled={!nextFile}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                title="Siguiente (→)"
              >
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Document */}
          <div className="flex-1 overflow-hidden bg-gray-100">
            {previewUrl && (
              isPDF ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full"
                  title={current.fileName}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={current.fileName}
                    className="max-w-full max-h-full object-contain rounded-xl shadow-sm"
                  />
                </div>
              )
            )}
            {!previewUrl && (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                Cargando vista previa…
              </div>
            )}
          </div>
        </div>

        {/* ── Right: extracted fields form ──────────────────── */}
        <div className="w-[400px] shrink-0 flex flex-col bg-white">

          {/* Form header */}
          <div className="flex items-center gap-2 px-5 py-3 border-b shrink-0">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <p className="text-sm font-semibold text-gray-800">Campos extraídos</p>
            <span className="ml-auto text-xs text-gray-400">
              {fields.length} campo{fields.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {fields.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No hay campos definidos en esta plantilla.
              </p>
            )}
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {f.label}
                </label>
                <input
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={current.extracted[f.key] ?? ''}
                  onChange={e => onChange(current.id, f.key, e.target.value)}
                  placeholder={`Valor de ${f.label}…`}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors placeholder:text-gray-300"
                />
              </div>
            ))}
          </div>

          {/* Footer CTA */}
          <div className="px-5 py-4 border-t bg-gray-50/60 shrink-0 space-y-2">
            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              Los cambios se aplican al instante · usa ← → para navegar
            </p>
            {nextFile ? (
              <button
                onClick={() => setCurrentId(nextFile.id)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium transition-colors"
              >
                Siguiente documento
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                Revisión completa
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
