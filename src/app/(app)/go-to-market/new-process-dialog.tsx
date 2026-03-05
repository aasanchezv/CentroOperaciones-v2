'use client'

import { useState, useTransition, useRef } from 'react'
import { X, Loader2, Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import { createGtmProcess, updateGtmProcess, getSlipUploadUrl } from '@/app/actions/gtm-actions'
import type { GtmProcess } from '@/app/actions/gtm-actions'

const BRANCHES = [
  { value: 'GMM', label: 'Gastos Médicos Mayores' },
  { value: 'Autos', label: 'Autos' },
  { value: 'Vida', label: 'Vida' },
  { value: 'Daños', label: 'Daños' },
  { value: 'RC', label: 'Responsabilidad Civil' },
  { value: 'Transporte', label: 'Transporte' },
  { value: 'Otro', label: 'Otro' },
]

interface NewProcessDialogProps {
  insurers:      { id: string; name: string; logo_url: string | null }[]
  profiles:      { id: string; full_name: string }[]
  currentUserId: string
  onClose:       () => void
  onCreated:     (process: GtmProcess) => void
}

export function NewProcessDialog({ profiles, currentUserId, onClose, onCreated }: NewProcessDialogProps) {
  const [step,         setStep]         = useState<'form' | 'slip' | 'extracting' | 'done'>('form')
  const [title,        setTitle]        = useState('')
  const [branch,       setBranch]       = useState('')
  const [assignedTo,   setAssignedTo]   = useState(currentUserId)
  const [deadlineAt,   setDeadlineAt]   = useState('')
  const [processId,    setProcessId]    = useState<string | null>(null)
  const [slipFile,     setSlipFile]     = useState<File | null>(null)
  const [slipDragging, setSlipDragging] = useState(false)
  const [extracted,    setExtracted]    = useState<Record<string, string | null> | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [, startTransition]             = useTransition()
  const [pending,      setPending]      = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleCreateAndContinue(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('El título es requerido'); return }
    setPending(true)
    setError(null)
    try {
      const res = await createGtmProcess({
        title:       title.trim(),
        branch:      branch || null,
        assigned_to: assignedTo,
        deadline_at: deadlineAt || null,
      })
      if ('error' in res) { setError(res.error); return }
      setProcessId(res.id)
      setStep('slip')
    } finally {
      setPending(false)
    }
  }

  function handleSlipSelect(file: File | null) {
    if (!file) return
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ]
    const isExcel = allowed.includes(file.type) || file.name.match(/\.(xlsx?|ods)$/i)
    if (!isExcel) {
      setError('Solo se aceptan archivos Excel (.xlsx, .xls)')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo no puede superar 10 MB')
      return
    }
    setError(null)
    setSlipFile(file)
  }

  async function handleUploadAndExtract() {
    if (!slipFile || !processId) return
    setPending(true)
    setError(null)
    setStep('extracting')
    try {
      // 1. Get signed upload URL
      const urlRes = await getSlipUploadUrl(processId, slipFile.name)
      if ('error' in urlRes) { setError(urlRes.error); setStep('slip'); return }

      // 2. Upload directly to Supabase Storage via signed URL
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const uploadUrl   = `${supabaseUrl}/storage/v1/object/gtm-files/${urlRes.path}?token=${urlRes.token}`

      const uploadRes = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': slipFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        body:    slipFile,
      })
      if (!uploadRes.ok) {
        setError('Error al subir el slip')
        setStep('slip')
        return
      }

      // 3. Update process with slip_url
      await updateGtmProcess(processId, {
        slip_url:      urlRes.path,
        slip_filename: slipFile.name,
      })

      // 4. Extract data with AI
      const extractRes = await fetch(`/api/gtm/${processId}/extract-slip`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const extractJson = await extractRes.json() as { extracted?: Record<string, string | null>; error?: string }
      if (!extractRes.ok || extractJson.error) {
        // Non-critical — continue without extraction
        setExtracted({})
      } else {
        setExtracted(extractJson.extracted ?? {})
      }

      setStep('done')
    } catch (e) {
      setError((e as Error).message)
      setStep('slip')
    } finally {
      setPending(false)
    }
  }

  function handleFinish() {
    if (!processId) return
    // Build a partial GtmProcess to pass back
    const newProcess: GtmProcess = {
      id:               processId,
      title:            title.trim(),
      account_id:       null,
      account_name:     null,
      branch:           branch || null,
      slip_url:         null,
      slip_filename:    slipFile?.name ?? null,
      slip_extracted:   extracted,
      status:           'draft',
      proposal_pdf_url: null,
      ai_recommendation: null,
      notes:            null,
      deadline_at:      deadlineAt || null,
      created_by:       currentUserId,
      assigned_to:      assignedTo,
      assigned_name:    profiles.find(p => p.id === assignedTo)?.full_name ?? null,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
      insurer_count:    0,
      responded_count:  0,
    }
    onCreated(newProcess)
  }

  function handleSkipSlip() {
    if (!processId) return
    const newProcess: GtmProcess = {
      id:               processId,
      title:            title.trim(),
      account_id:       null,
      account_name:     null,
      branch:           branch || null,
      slip_url:         null,
      slip_filename:    null,
      slip_extracted:   null,
      status:           'draft',
      proposal_pdf_url: null,
      ai_recommendation: null,
      notes:            null,
      deadline_at:      deadlineAt || null,
      created_by:       currentUserId,
      assigned_to:      assignedTo,
      assigned_name:    profiles.find(p => p.id === assignedTo)?.full_name ?? null,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
      insurer_count:    0,
      responded_count:  0,
    }
    onCreated(newProcess)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-[#0A2F6B]">
          <div>
            <h3 className="text-sm font-semibold text-white">Nuevo proceso Go to Market</h3>
            <p className="text-[11px] text-blue-300 mt-0.5">
              {step === 'form' ? 'Paso 1: Datos del proceso' :
               step === 'slip' ? 'Paso 2: Slip de cotización' :
               step === 'extracting' ? 'Extrayendo datos con AI…' :
               'Proceso creado'}
            </p>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {/* Step 1: Form */}
          {step === 'form' && (
            <form onSubmit={handleCreateAndContinue} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">Título del proceso *</label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  placeholder="Cotización GMM — Empresa ABC 2026"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500">Ramo</label>
                  <select
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    className="w-full text-sm border rounded-md px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Seleccionar —</option>
                    {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500">Fecha límite</label>
                  <input
                    type="date"
                    value={deadlineAt}
                    onChange={e => setDeadlineAt(e.target.value)}
                    className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">Asignado a</label>
                <select
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                  className="w-full text-sm border rounded-md px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>

              {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button
                  type="submit"
                  disabled={pending || !title.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-[#0A2F6B] px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Siguiente: subir slip
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Slip upload */}
          {step === 'slip' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-600">
                Sube el slip de cotización en Excel. El AI leerá los datos automáticamente.
              </p>

              {/* Drop zone */}
              <div
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  slipDragging ? 'border-blue-400 bg-blue-50' :
                  slipFile ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                onDragOver={e => { e.preventDefault(); setSlipDragging(true) }}
                onDragLeave={() => setSlipDragging(false)}
                onDrop={e => { e.preventDefault(); setSlipDragging(false); handleSlipSelect(e.dataTransfer.files[0] ?? null) }}
                onClick={() => inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.ods"
                  className="hidden"
                  onChange={e => handleSlipSelect(e.target.files?.[0] ?? null)}
                />
                {slipFile ? (
                  <div>
                    <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-green-700">{slipFile.name}</p>
                    <p className="text-xs text-green-600 mt-1">{(slipFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Arrastra el Excel o haz clic</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx o .xls — máx. 10 MB</p>
                  </div>
                )}
              </div>

              {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <div className="flex justify-between gap-2">
                <button onClick={handleSkipSlip} className="text-xs text-gray-500 hover:text-gray-700 underline">
                  Saltar — subir después
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep('form')} className="rounded-md border px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">Atrás</button>
                  <button
                    onClick={handleUploadAndExtract}
                    disabled={!slipFile || pending}
                    className="flex items-center gap-1.5 rounded-md bg-[#16A34A] px-4 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
                  >
                    {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    Subir y extraer datos
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step: Extracting */}
          {step === 'extracting' && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto" />
              <div>
                <p className="text-sm font-medium text-gray-900">Subiendo slip y extrayendo datos con AI…</p>
                <p className="text-xs text-gray-500 mt-1">Esto puede tomar unos segundos</p>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && extracted !== null && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">Slip procesado correctamente</p>
              </div>

              {/* Preview extracted data */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5 max-h-48 overflow-y-auto">
                {Object.entries(extracted).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-gray-400 w-32 shrink-0 capitalize">{k.replace(/_/g, ' ')}:</span>
                    <span className="text-gray-700 flex-1 truncate">{v}</span>
                  </div>
                ))}
                {Object.values(extracted).every(v => !v) && (
                  <p className="text-gray-400 italic">No se extrajeron datos automáticamente. Puedes editarlos en el proceso.</p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleFinish}
                  className="flex items-center gap-1.5 rounded-md bg-[#0A2F6B] px-4 py-2 text-xs font-medium text-white hover:bg-blue-900"
                >
                  Ir al proceso
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
