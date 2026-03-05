'use client'

import { useState } from 'react'
import * as XLSX    from 'xlsx'
import {
  ChevronDown, ChevronRight, Download, History,
  CalendarDays, Pencil, Loader2,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { updateCaptureDocument, type TemplateField } from '@/app/actions/capture-actions'

// ─── Types ────────────────────────────────────────────────────

interface CaptureDoc {
  id:        string
  file_name: string
  status:    string
  extracted: Record<string, string | null> | null
  error:     string | null
}

interface CaptureRun {
  id:                string
  name:              string
  document_count:    number
  created_at:        string
  template_id:       string | null
  template_snapshot: TemplateField[] | null
  capture_documents: CaptureDoc[]
}

interface Props {
  runs: CaptureRun[]
}

// ─── Helpers ──────────────────────────────────────────────────

function downloadRunExcel(run: CaptureRun) {
  const docs   = Array.isArray(run.capture_documents) ? run.capture_documents : []
  const fields = docs[0]?.extracted ? Object.keys(docs[0].extracted) : []

  const headers = ['Archivo', ...fields]
  const rows    = docs.map(doc => [
    doc.file_name,
    ...fields.map(k => doc.extracted?.[k] ?? ''),
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Extracción')
  XLSX.writeFile(wb, `${run.name.replace(/\s+/g, '_')}.xlsx`)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function downloadTodayExcel(runs: CaptureRun[]) {
  const today     = new Date().toISOString().split('T')[0]
  const todayRuns = runs.filter(r => r.created_at.startsWith(today))
  if (todayRuns.length === 0) {
    alert('No hay capturas registradas hoy.')
    return
  }

  const wb = XLSX.utils.book_new()
  for (const run of todayRuns) {
    const docs   = Array.isArray(run.capture_documents) ? run.capture_documents : []
    const fields = docs[0]?.extracted ? Object.keys(docs[0].extracted) : []
    const headers = ['Archivo', ...fields]
    const rows    = docs.map(doc => [
      doc.file_name,
      ...fields.map(k => doc.extracted?.[k] ?? ''),
    ])
    const ws        = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const sheetName = run.name.replace(/[^\w\s\-]/g, '').slice(0, 31) || 'Run'
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }
  XLSX.writeFile(wb, `capturas_${today}.xlsx`)
}

/** Derive editable fields from template_snapshot, falling back to extracted keys */
function resolveFields(doc: CaptureDoc, snapshot: TemplateField[] | null): TemplateField[] {
  if (snapshot && snapshot.length > 0) return snapshot
  return Object.keys(doc.extracted ?? {}).map(k => ({
    id: k, key: k, label: k, type: 'text' as const,
  }))
}

// ─── RunHistory ───────────────────────────────────────────────

export function RunHistory({ runs: initialRuns }: Props) {
  const [runs, setRuns]         = useState<CaptureRun[]>(initialRuns)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Editor state
  const [editingDoc, setEditingDoc] = useState<{
    doc:    CaptureDoc
    fields: TemplateField[]
    runId:  string
  } | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  if (runs.length === 0) return null

  // ── Editor helpers ───────────────────────────────────────────

  function openEditor(doc: CaptureDoc, snapshot: TemplateField[] | null, runId: string) {
    const fields = resolveFields(doc, snapshot)
    const vals: Record<string, string> = {}
    for (const k of Object.keys(doc.extracted ?? {})) {
      vals[k] = doc.extracted?.[k] ?? ''
    }
    for (const f of fields) {
      if (!(f.key in vals)) vals[f.key] = ''
    }
    setEditingDoc({ doc, fields, runId })
    setEditValues(vals)
    setSaveError(null)
  }

  function closeEditor() {
    if (!saving) { setEditingDoc(null); setSaveError(null) }
  }

  async function handleSave() {
    if (!editingDoc) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateCaptureDocument(editingDoc.doc.id, editValues)
      setRuns(prev => prev.map(run => {
        if (run.id !== editingDoc.runId) return run
        return {
          ...run,
          capture_documents: run.capture_documents.map(d =>
            d.id !== editingDoc.doc.id ? d : { ...d, extracted: editValues }
          ),
        }
      }))
      setEditingDoc(null)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="border-t bg-white">

      {/* Header */}
      <div className="px-6 py-3 flex items-center gap-2">
        <History className="h-4 w-4 text-gray-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 flex-1">
          Historial de extracciones
        </span>
        <button
          onClick={() => downloadTodayExcel(runs)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition-colors"
          title="Exportar todas las capturas de hoy en un Excel"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Excel de hoy
        </button>
      </div>

      {/* Runs list */}
      <div className="divide-y max-h-[320px] overflow-y-auto">
        {runs.map(run => {
          const docs   = Array.isArray(run.capture_documents) ? run.capture_documents : []
          const isOpen = expanded === run.id

          return (
            <div key={run.id}>
              {/* Run header row */}
              <div
                className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => setExpanded(isOpen ? null : run.id)}
              >
                {isOpen
                  ? <ChevronDown  className="h-4 w-4 text-gray-400 shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{run.name}</p>
                  <p className="text-xs text-gray-400">{formatDate(run.created_at)}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {run.document_count} doc{run.document_count !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); downloadRunExcel(run) }}
                  className="text-gray-300 hover:text-gray-700 shrink-0 p-1 rounded"
                  title="Descargar Excel"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {/* Expanded: document rows with edit button */}
              {isOpen && docs.length > 0 && (
                <div className="bg-gray-50 px-6 pb-3 space-y-1.5">
                  {docs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 text-xs">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${doc.status === 'done' ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-gray-600 truncate flex-1">{doc.file_name}</span>
                      {doc.error && <span className="text-red-500 truncate">{doc.error}</span>}
                      {doc.status === 'done' && (
                        <button
                          onClick={() => openEditor(doc, run.template_snapshot, run.id)}
                          className="text-gray-300 hover:text-indigo-500 transition-colors shrink-0 p-0.5"
                          title="Editar campos extraídos"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Edit dialog ─────────────────────────────────────── */}
      <Dialog open={!!editingDoc} onOpenChange={v => { if (!v) closeEditor() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Pencil className="h-4 w-4 text-indigo-500 shrink-0" />
              Editar campos extraídos
              {editingDoc && (
                <span className="text-gray-400 font-normal text-xs truncate">— {editingDoc.doc.file_name}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {editingDoc && (
            <div className="space-y-3 py-1 max-h-[60vh] overflow-y-auto pr-1">
              {editingDoc.fields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={editValues[f.key] ?? ''}
                    onChange={e => setEditValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 transition-colors"
                  />
                </div>
              ))}
              {/* Extra keys not in template snapshot */}
              {Object.keys(editValues)
                .filter(k => !editingDoc.fields.some(f => f.key === k))
                .map(k => (
                  <div key={k}>
                    <label className="block text-xs font-medium text-gray-400 mb-1 font-mono">{k}</label>
                    <input
                      type="text"
                      value={editValues[k] ?? ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [k]: e.target.value }))}
                      className="w-full text-sm border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 transition-colors"
                    />
                  </div>
                ))
              }
              {saveError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">{saveError}</p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 pt-3 border-t">
            <Button variant="outline" size="sm" onClick={closeEditor} disabled={saving}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5"
            >
              {saving
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Pencil className="h-3 w-3" />
              }
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
