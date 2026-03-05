'use client'

import { useState, useRef, useTransition, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, Plus, Download, Loader2, CheckCircle2,
  XCircle, ScanText, ChevronDown, Pencil, Settings2,
  AlertTriangle, Eye, EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TemplateEditor, type CaptureTemplate } from './template-editor'
import { RunHistory }          from './run-history'
import { CaptureReviewDialog } from './capture-review-dialog'
import { saveRun, type TemplateField } from '@/app/actions/capture-actions'

// ─── Constants ────────────────────────────────────────────────

const ACCEPTED_TYPES   = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_FILE_MB      = 10        // advertencia suave
const HARD_LIMIT_MB    = 20        // límite duro (Anthropic API)
const FETCH_TIMEOUT_MS = 90_000   // 90 s timeout por documento

// ─── Types ────────────────────────────────────────────────────

interface FileRow {
  id:        string
  file:      File
  fileName:  string
  status:    'idle' | 'processing' | 'done' | 'error'
  extracted: Record<string, string>
  error?:    string
}

interface CaptureRun {
  id:                string
  name:              string
  document_count:    number
  created_at:        string
  template_id:       string | null
  template_snapshot: TemplateField[] | null
  capture_documents: {
    id: string; file_name: string; status: string
    extracted: Record<string, string | null> | null; error: string | null
  }[]
}

interface Props {
  templates:     CaptureTemplate[]
  runs:          CaptureRun[]
  currentUserId: string
}

// ─── Helpers ──────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileSizeMB(file: File) { return file.size / (1024 * 1024) }

function StatusIcon({ status }: { status: FileRow['status'] }) {
  if (status === 'processing') return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
  if (status === 'done')       return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'error')      return <XCircle className="h-4 w-4 text-red-500" />
  return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
}

// ─── Editable cell ────────────────────────────────────────────

function EditableCell({ value, onChange, disabled }: {
  value: string; onChange: (v: string) => void; disabled: boolean
}) {
  return (
    <td className="px-3 py-2 border-r border-gray-100 last:border-r-0">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full text-xs text-gray-700 bg-transparent outline-none focus:bg-blue-50 rounded px-1 py-0.5 disabled:cursor-default min-w-[80px]"
      />
    </td>
  )
}

// ─── Left panel: no-template empty state ─────────────────────

function NoTemplatePanel({ onNew }: { onNew: () => void }) {
  return (
    <div className="p-4 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
        Campos a extraer
      </p>
      <div className="rounded-xl border-2 border-dashed border-gray-200 p-4 text-center space-y-3">
        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
          <Settings2 className="h-5 w-5 text-gray-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-700">Define qué datos extraer</p>
          <p className="text-[11px] text-gray-400 mt-1">
            Crea una plantilla con los campos que el agente debe buscar en cada póliza
          </p>
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium px-3 py-2 hover:bg-gray-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Crear mi primera plantilla
        </button>
      </div>
      <p className="text-[10px] text-gray-400 leading-relaxed">
        Ejemplo: número de póliza, tomador, prima neta, vigencia, aseguradora…
      </p>
    </div>
  )
}

// ─── Main workspace ───────────────────────────────────────────

export function CaptureWorkspace({ templates, runs: initialRuns, currentUserId }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<CaptureTemplate | null>(
    templates[0] ?? null
  )
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [editingTemplate, setEditingTemplate]       = useState<CaptureTemplate | null>(null)
  const [files, setFiles]                           = useState<FileRow[]>([])
  const [processing, setProcessing]                 = useState(false)
  const [saving, setSaving]                         = useState(false)
  const [isDragging, setIsDragging]                 = useState(false)
  const [, startTransition]                         = useTransition()
  const [runs, setRuns]                             = useState<CaptureRun[]>(initialRuns)
  const [showTemplateMenu, setShowTemplateMenu]     = useState(false)
  const [previewFileId, setPreviewFileId]           = useState<string | null>(null)
  const [previewUrl, setPreviewUrl]                 = useState<string | null>(null)
  const [reviewFileId, setReviewFileId]             = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Manage blob URL lifecycle for PDF/image preview
  const previewFile = files.find(f => f.id === previewFileId) ?? null
  useEffect(() => {
    if (!previewFile) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(previewFile.file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [previewFile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fields: TemplateField[] = selectedTemplate?.fields ?? []

  // ─── File handling ──────────────────────────────────────

  const addFiles = useCallback((newFiles: File[]) => {
    const valid   = newFiles.filter(f => ACCEPTED_TYPES.includes(f.type))
    const tooBig  = valid.filter(f => fileSizeMB(f) > HARD_LIMIT_MB)
    const ok      = valid.filter(f => fileSizeMB(f) <= HARD_LIMIT_MB)

    if (tooBig.length > 0) {
      alert(`${tooBig.map(f => f.name).join(', ')} supera el límite de ${HARD_LIMIT_MB} MB y no puede procesarse.`)
    }
    if (ok.length === 0) return

    const rows: FileRow[] = ok.map(f => ({
      id:        crypto.randomUUID(),
      file:      f,
      fileName:  f.name,
      status:    'idle',
      extracted: Object.fromEntries(fields.map(field => [field.key, ''])),
      error:     fileSizeMB(f) > MAX_FILE_MB
        ? undefined  // warn shown in row
        : undefined,
    }))
    setFiles(prev => [...prev, ...rows])
  }, [fields])

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  function updateCell(fileId: string, fieldKey: string, value: string) {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, extracted: { ...f.extracted, [fieldKey]: value } } : f
    ))
  }

  function removeFile(fileId: string) {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  // ─── Process ────────────────────────────────────────────

  async function handleProcess() {
    if (!selectedTemplate || fields.length === 0) {
      alert('Define los campos de tu plantilla primero')
      return
    }
    const idle = files.filter(f => f.status === 'idle')
    if (idle.length === 0) return

    setProcessing(true)

    for (const row of idle) {
      setFiles(prev => prev.map(f => f.id === row.id ? { ...f, status: 'processing' } : f))

      try {
        const fileData = await fileToBase64(row.file)
        const mimeType = row.file.type

        // AbortController para timeout de 90 s por documento
        const controller = new AbortController()
        const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        let res: Response
        try {
          res = await fetch('/api/capture/extract', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            signal:  controller.signal,
            body:    JSON.stringify({ fileData, mimeType, fileName: row.fileName, fields }),
          })
        } finally {
          clearTimeout(timer)
        }

        const data = await res.json() as { extracted?: Record<string, string | null>; error?: string }

        if (!res.ok || data.error) {
          setFiles(prev => prev.map(f =>
            f.id === row.id ? { ...f, status: 'error', error: data.error ?? 'Error desconocido' } : f
          ))
        } else {
          const extracted = Object.fromEntries(
            Object.entries(data.extracted ?? {}).map(([k, v]) => [k, v ?? ''])
          )
          setFiles(prev => prev.map(f =>
            f.id === row.id ? { ...f, status: 'done', extracted } : f
          ))
        }
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === 'AbortError'
        setFiles(prev => prev.map(f =>
          f.id === row.id
            ? { ...f, status: 'error', error: isTimeout ? 'Tiempo de espera agotado (90 s) — el archivo puede ser muy grande' : (err as Error).message }
            : f
        ))
      }
    }

    setProcessing(false)
  }

  // ─── Save + Download ─────────────────────────────────────

  async function handleSaveAndDownload() {
    if (files.length === 0) return
    setSaving(true)

    const headers = ['Archivo', ...fields.map(f => f.label)]
    const rows    = files.map(f => [f.fileName, ...fields.map(field => f.extracted[field.key] ?? '')])
    const ws      = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols']   = [{ wch: 30 }, ...fields.map(f => ({ wch: Math.max(f.label.length, 15) }))]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Extracción')
    const dateStr = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `captura_${selectedTemplate?.name.replace(/\s+/g, '_') ?? 'datos'}_${dateStr}.xlsx`)

    startTransition(async () => {
      try {
        const runName = `${selectedTemplate?.name ?? 'Captura'} — ${new Date().toLocaleDateString('es-MX')}`
        await saveRun({
          name:             runName,
          templateId:       selectedTemplate?.id ?? null,
          templateSnapshot: fields,
          documents:        files.map(f => ({
            fileName:  f.fileName,
            status:    f.status === 'done' ? 'done' : 'error',
            extracted: f.extracted,
            error:     f.error,
          })),
        })
        setFiles([])
      } catch (e) {
        alert('Error al guardar: ' + (e as Error).message)
      } finally {
        setSaving(false)
      }
    })
  }

  // ─── Counters ────────────────────────────────────────────

  const idleCount       = files.filter(f => f.status === 'idle').length
  const processingCount = files.filter(f => f.status === 'processing').length
  const doneCount       = files.filter(f => f.status === 'done').length
  const hasResults      = doneCount > 0

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel ── */}
      <div className="w-64 border-r bg-gray-50 flex flex-col overflow-y-auto shrink-0">

        {templates.length === 0 && !selectedTemplate ? (
          /* Primera vez: guía prominente */
          <NoTemplatePanel onNew={() => { setEditingTemplate(null); setShowTemplateEditor(true) }} />
        ) : (
          <div className="p-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Campos a extraer
            </p>

            {/* Template selector */}
            <div className="relative">
              <button
                onClick={() => setShowTemplateMenu(v => !v)}
                className="w-full flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:border-gray-300 transition-colors"
              >
                <span className="truncate">{selectedTemplate?.name ?? 'Sin plantilla'}</span>
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              </button>

              {showTemplateMenu && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTemplate(t); setShowTemplateMenu(false) }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        selectedTemplate?.id === t.id ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="truncate block">{t.name}</span>
                      {t.is_shared && <span className="text-[10px] opacity-60">Compartida</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingTemplate(null); setShowTemplateEditor(true) }}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Nueva
              </button>
              {selectedTemplate && selectedTemplate.created_by === currentUserId && (
                <button
                  onClick={() => { setEditingTemplate(selectedTemplate); setShowTemplateEditor(true) }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar campos
                </button>
              )}
            </div>

            {/* Fields list */}
            {fields.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 pt-2">
                  Campos definidos ({fields.length})
                </p>
                {fields.map(f => (
                  <div key={f.id} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0" />
                    <span className="text-xs text-gray-700 truncate">{f.label}</span>
                    {f.type !== 'text' && (
                      <span className="text-[10px] text-gray-300 ml-auto shrink-0">{f.type}</span>
                    )}
                  </div>
                ))}
                {selectedTemplate?.created_by === currentUserId && (
                  <button
                    onClick={() => { setEditingTemplate(selectedTemplate); setShowTemplateEditor(true) }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-400 py-1.5 hover:border-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Añadir campo
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700 space-y-1.5">
                <p className="font-medium">Esta plantilla no tiene campos</p>
                <button
                  onClick={() => { setEditingTemplate(selectedTemplate); setShowTemplateEditor(true) }}
                  className="underline underline-offset-2"
                >
                  Añadir campos ahora
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              <Plus className="h-4 w-4" /> Añadir documentos
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={onInputChange}
              className="hidden"
            />
            {files.length > 0 && (
              <span className="text-xs text-gray-400">
                {files.length} archivo{files.length !== 1 ? 's' : ''}
                {processingCount > 0 && ` · procesando ${processingCount}…`}
                {doneCount > 0 && ` · ${doneCount} listos`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {idleCount > 0 && (
              <Button
                size="sm"
                disabled={processing || !selectedTemplate || fields.length === 0}
                onClick={handleProcess}
                className="gap-1.5"
              >
                {processing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <ScanText className="h-3.5 w-3.5" />}
                {processing ? 'Procesando…' : `Procesar ${idleCount}`}
              </Button>
            )}
            {hasResults && (
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={handleSaveAndDownload}
                className="gap-1.5"
              >
                {saving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />}
                {saving ? 'Guardando…' : 'Guardar + Excel'}
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">

          {/* PDF preview panel */}
          {previewUrl && previewFile && (
            <div className="w-1/2 border-r flex flex-col shrink-0 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
                <p className="text-xs font-medium text-gray-600 truncate">{previewFile.fileName}</p>
                <button
                  onClick={() => setPreviewFileId(null)}
                  className="text-gray-400 hover:text-gray-700 transition-colors ml-2 shrink-0"
                  title="Cerrar vista previa"
                >
                  <EyeOff className="h-4 w-4" />
                </button>
              </div>
              {previewFile.file.type === 'application/pdf' ? (
                <iframe
                  src={previewUrl}
                  className="flex-1 w-full"
                  title={previewFile.fileName}
                />
              ) : (
                <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt={previewFile.fileName} className="max-w-full max-h-full object-contain rounded" />
                </div>
              )}
            </div>
          )}

          {/* Main content: drop zone or table */}
          <div className={`${previewUrl ? 'w-1/2' : 'flex-1'} overflow-auto`}>
            {files.length === 0 ? (
              /* Drop zone */
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`m-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 py-20 cursor-pointer transition-colors ${
                  isDragging ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-gray-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Arrastra pólizas aquí</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, WebP · hasta {HARD_LIMIT_MB} MB por archivo</p>
                </div>
                {!selectedTemplate && (
                  <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                    ⚠ Define los campos en el panel izquierdo primero
                  </p>
                )}
              </div>
            ) : (
              /* Results table */
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b sticky top-0 z-10">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 w-8" />
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 min-w-[180px]">Archivo</th>
                    {fields.map(f => (
                      <th key={f.key} className="px-3 py-2.5 text-xs font-semibold text-gray-500 min-w-[120px]">
                        {f.label}
                      </th>
                    ))}
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {files.map(row => (
                    <tr
                      key={row.id}
                      className={`transition-colors ${row.id === previewFileId ? 'bg-blue-50' : row.status === 'processing' ? 'bg-blue-50/30' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-2.5 text-center">
                        <StatusIcon status={row.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-start gap-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-800 truncate max-w-[160px]">{row.fileName}</p>
                            {fileSizeMB(row.file) > MAX_FILE_MB && row.status === 'idle' && (
                              <p className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                Archivo grande ({fileSizeMB(row.file).toFixed(1)} MB)
                              </p>
                            )}
                            {row.error && <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[160px]" title={row.error}>{row.error}</p>}
                          </div>
                          <button
                            onClick={() => {
                              if (row.status === 'done') {
                                setPreviewFileId(null)
                                setReviewFileId(row.id)
                              } else {
                                setPreviewFileId(row.id === previewFileId ? null : row.id)
                              }
                            }}
                            className={`shrink-0 mt-0.5 transition-colors ${
                              row.status === 'done'
                                ? 'text-indigo-400 hover:text-indigo-600'
                                : row.id === previewFileId ? 'text-blue-500' : 'text-gray-300 hover:text-gray-600'
                            }`}
                            title={row.status === 'done' ? 'Revisar extracción' : row.id === previewFileId ? 'Cerrar vista previa' : 'Ver documento'}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      {fields.map(f => (
                        <EditableCell
                          key={f.key}
                          value={row.extracted[f.key] ?? ''}
                          onChange={v => updateCell(row.id, f.key, v)}
                          disabled={row.status !== 'done'}
                        />
                      ))}
                      <td className="px-2 py-2.5 text-center">
                        {row.status !== 'processing' && (
                          <button
                            onClick={() => removeFile(row.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors text-xs"
                            title="Quitar"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* History */}
        <RunHistory runs={runs} />
      </div>

      {/* Template editor modal */}
      {showTemplateEditor && (
        <TemplateEditor
          template={editingTemplate}
          currentUserId={currentUserId}
          onClose={() => { setShowTemplateEditor(false); setEditingTemplate(null) }}
          onSaved={() => {
            setShowTemplateEditor(false)
            setEditingTemplate(null)
            window.location.reload()
          }}
        />
      )}

      {/* Review dialog — PDF + fields side by side */}
      {reviewFileId && (
        <CaptureReviewDialog
          initialFileId={reviewFileId}
          files={files.filter(f => f.status === 'done')}
          fields={fields}
          onChange={updateCell}
          onClose={() => setReviewFileId(null)}
        />
      )}
    </div>
  )
}
