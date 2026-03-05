'use client'

import { useState, useTransition } from 'react'
import Link                        from 'next/link'
import {
  ChevronLeft, Send, FileDown, Loader2, AlertCircle, CheckCircle2,
  Plus, X, RefreshCw, Building2, Clock,
} from 'lucide-react'
import type { GtmProcess, GtmInsurerRecord } from '@/app/actions/gtm-actions'
import {
  addInsurerToProcess, removeInsurerFromProcess,
  markInsurerDeclined, updateGtmProcess, getPdfSignedUrl, getProposalSignedUrl,
} from '@/app/actions/gtm-actions'
import { UploadProposalSheet } from './upload-proposal-sheet'

// ─── Status helpers ───────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending:  'Pendiente',
  sent:     'Enviado',
  received: 'Propuesta recibida',
  analyzed: 'Analizado',
  declined: 'Declinó',
}
const STATUS_COLOR: Record<string, string> = {
  pending:  'bg-gray-100 text-gray-500',
  sent:     'bg-blue-100 text-blue-700',
  received: 'bg-amber-100 text-amber-700',
  analyzed: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-600',
}

// ─── InsureCard ───────────────────────────────────────────────

function InsurerCard({
  record,
  processStatus,
  onRemove,
  onDecline,
  onViewProposal,
  onUploadManual,
}: {
  record:         GtmInsurerRecord
  processStatus:  string
  onRemove:       () => void
  onDecline:      () => void
  onViewProposal: () => void
  onUploadManual: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        {/* Logo */}
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
          {record.insurer_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={record.insurer_logo_url} alt={record.insurer_name} className="w-full h-full object-contain" />
          ) : (
            <Building2 className="h-5 w-5 text-gray-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">{record.insurer_name}</p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLOR[record.status] ?? STATUS_COLOR.pending}`}>
              {STATUS_LABEL[record.status] ?? record.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{record.contact_email}</p>
          {record.sent_at && (
            <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Enviado: {new Date(record.sent_at).toLocaleDateString('es-MX')}
            </p>
          )}
          {record.analyzed_at && record.ai_prima != null && (
            <p className="text-xs font-semibold text-green-700 mt-1">
              Prima: ${record.ai_prima.toLocaleString('es-MX')}
              {record.ai_deducible && <span className="font-normal text-gray-500 ml-2">Ded: {record.ai_deducible}</span>}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {record.status === 'analyzed' && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
            >
              {expanded ? 'Ocultar' : 'Ver detalles'}
            </button>
          )}
          {record.proposal_url && (
            <button
              onClick={onViewProposal}
              className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
            >
              Ver PDF
            </button>
          )}
          <button
            onClick={onUploadManual}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            title="Subir propuesta manualmente"
          >
            Subir propuesta
          </button>
          {record.status === 'pending' || record.status === 'sent' ? (
            <button
              onClick={onDecline}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
            >
              Declinó
            </button>
          ) : null}
          {processStatus === 'draft' && (
            <button onClick={onRemove} className="p-1 text-gray-300 hover:text-red-400 transition-colors rounded">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && record.status === 'analyzed' && (
        <div className="px-4 pb-4 border-t pt-3 space-y-2 bg-gray-50">
          {record.ai_suma_asegurada && (
            <div className="flex gap-2 text-xs">
              <span className="text-gray-400 w-32">Suma asegurada:</span>
              <span className="text-gray-700">{record.ai_suma_asegurada}</span>
            </div>
          )}
          {record.ai_coberturas && (
            <div className="flex gap-2 text-xs">
              <span className="text-gray-400 w-32">Coberturas:</span>
              <span className="text-gray-700 flex-1">{record.ai_coberturas}</span>
            </div>
          )}
          {record.ai_exclusiones && (
            <div className="flex gap-2 text-xs">
              <span className="text-gray-400 w-32">Exclusiones:</span>
              <span className="text-gray-700 flex-1">{record.ai_exclusiones}</span>
            </div>
          )}
          {record.ai_vigencia && (
            <div className="flex gap-2 text-xs">
              <span className="text-gray-400 w-32">Vigencia:</span>
              <span className="text-gray-700">{record.ai_vigencia}</span>
            </div>
          )}
          {record.ai_condiciones && (
            <div className="flex gap-2 text-xs">
              <span className="text-gray-400 w-32">Condiciones:</span>
              <span className="text-gray-700 flex-1">{record.ai_condiciones}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AddInsurerRow ────────────────────────────────────────────

function AddInsurerRow({
  insurers,
  defaultContacts,
  contactsByInsurer,
  existingIds,
  processId,
  onAdded,
}: {
  insurers:          { id: string; name: string }[]
  defaultContacts:   Record<string, { name: string; email: string }>
  contactsByInsurer: Record<string, { name: string; email: string }[]>
  existingIds:       Set<string>
  processId:         string
  onAdded:           (rec: GtmInsurerRecord) => void
}) {
  const [selectedId,   setSelectedId]   = useState('')
  const [email,        setEmail]        = useState('')
  const [name,         setName]         = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [pending,      setPending]      = useState(false)

  const available = insurers.filter(i => !existingIds.has(i.id))

  function handleInsurerChange(id: string) {
    setSelectedId(id)
    const def = defaultContacts[id]
    if (def) {
      setEmail(def.email)
      setName(def.name)
    } else {
      setEmail('')
      setName('')
    }
    setError(null)
  }

  async function handleAdd() {
    if (!selectedId) { setError('Selecciona una aseguradora'); return }
    if (!email.trim()) { setError('El email de contacto es requerido'); return }
    setPending(true)
    setError(null)
    const res = await addInsurerToProcess(processId, selectedId, email.trim(), name.trim() || null)
    setPending(false)
    if ('error' in res) { setError(res.error); return }
    // Build partial record
    const insurer = insurers.find(i => i.id === selectedId)
    onAdded({
      id:               res.id,
      process_id:       processId,
      insurer_id:       selectedId,
      insurer_name:     insurer?.name ?? '',
      insurer_logo_url: null,
      contact_name:     name.trim() || null,
      contact_email:    email.trim(),
      upload_token:     '',
      status:           'pending',
      sent_at:          null,
      proposal_url:     null,
      proposal_filename: null,
      received_at:      null,
      analyzed_at:      null,
      ai_prima:         null,
      ai_suma_asegurada: null,
      ai_coberturas:    null,
      ai_exclusiones:   null,
      ai_deducible:     null,
      ai_vigencia:      null,
      ai_condiciones:   null,
      notes:            null,
    })
    setSelectedId('')
    setEmail('')
    setName('')
  }

  const contacts = selectedId && contactsByInsurer[selectedId] ? contactsByInsurer[selectedId] : []

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-medium text-blue-700">Agregar aseguradora</p>
      <div className="flex gap-2 flex-wrap">
        <select
          value={selectedId}
          onChange={e => handleInsurerChange(e.target.value)}
          className="text-sm border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-[160px]"
        >
          <option value="">— Seleccionar —</option>
          {available.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>

        {contacts.length > 0 ? (
          <select
            value={email}
            onChange={e => {
              setEmail(e.target.value)
              const c = contacts.find(c => c.email === e.target.value)
              if (c) setName(c.name)
            }}
            className="text-sm border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-[180px]"
          >
            <option value="">— Seleccionar contacto —</option>
            {contacts.map(c => <option key={c.email} value={c.email}>{c.name} ({c.email})</option>)}
          </select>
        ) : (
          <input
            type="email"
            placeholder="Email de contacto"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="text-sm border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-[180px]"
          />
        )}

        <button
          onClick={handleAdd}
          disabled={pending || !selectedId || !email}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Agregar
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ─── ProcessDetail ────────────────────────────────────────────

interface ProcessDetailProps {
  initialProcess:    GtmProcess
  initialInsurers:   GtmInsurerRecord[]
  allInsurers:       { id: string; name: string; logo_url: string | null }[]
  defaultContacts:   Record<string, { name: string; email: string }>
  contactsByInsurer: Record<string, { name: string; email: string }[]>
  currentUserId:     string
  currentUserRole:   string
}

export function ProcessDetail({
  initialProcess, initialInsurers, allInsurers, defaultContacts, contactsByInsurer,
}: ProcessDetailProps) {
  const [process,        setProcess]        = useState(initialProcess)
  const [insurers,       setInsurers]       = useState(initialInsurers)
  const [sending,        setSending]        = useState(false)
  const [generating,     setGenerating]     = useState(false)
  const [sendError,      setSendError]      = useState<string | null>(null)
  const [sendSuccess,    setSendSuccess]    = useState<string | null>(null)
  const [genError,       setGenError]       = useState<string | null>(null)
  const [recommendation, setRecommendation] = useState(process.ai_recommendation ?? '')
  const [savingRec,      setSavingRec]      = useState(false)
  const [uploadTarget,   setUploadTarget]   = useState<GtmInsurerRecord | null>(null)
  const [,               startTransition]   = useTransition()

  const responded   = insurers.filter(i => ['received','analyzed'].includes(i.status)).length
  const total       = insurers.length
  const pct         = total > 0 ? Math.round((responded / total) * 100) : 0
  const pendingSend = insurers.filter(i => i.status === 'pending')
  const canSend     = pendingSend.length > 0 && process.slip_url
  const canGenerate = insurers.some(i => i.status === 'analyzed')

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    setSendError(null)
    setSendSuccess(null)
    try {
      const res = await fetch(`/api/gtm/${process.id}/send`, { method: 'POST' })
      const json = await res.json() as { sent?: number; errors?: string[]; error?: string }
      if (json.error) { setSendError(json.error); return }
      if ((json.errors ?? []).length > 0) setSendError(json.errors!.join(' | '))
      setSendSuccess(`Enviado a ${json.sent ?? 0} aseguradora(s)`)
      // Refresh insurer statuses
      setInsurers(prev => prev.map(i =>
        pendingSend.find(p => p.id === i.id) ? { ...i, status: 'sent', sent_at: new Date().toISOString() } : i
      ))
      setProcess(prev => ({ ...prev, status: 'waiting' }))
    } catch (e) {
      setSendError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  async function handleGeneratePdf() {
    if (!canGenerate) return
    setGenerating(true)
    setGenError(null)
    try {
      // Save recommendation first if edited
      if (recommendation !== process.ai_recommendation) {
        await updateGtmProcess(process.id, { ai_recommendation: recommendation || null })
      }
      const res = await fetch(`/api/gtm/${process.id}/generate-pdf`, { method: 'POST' })
      const json = await res.json() as { ok?: boolean; pdf_url?: string; error?: string }
      if (!res.ok || json.error) { setGenError(json.error ?? 'Error al generar PDF'); return }
      if (json.pdf_url) window.open(json.pdf_url, '_blank')
      setProcess(prev => ({ ...prev, status: 'proposal_ready' }))
    } catch (e) {
      setGenError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleDownloadPdf() {
    const res = await getPdfSignedUrl(process.id)
    if ('url' in res) window.open(res.url, '_blank')
  }

  async function handleViewProposal(record: GtmInsurerRecord) {
    if (!record.proposal_url) return
    const res = await getProposalSignedUrl(record.proposal_url)
    if ('url' in res) window.open(res.url, '_blank')
  }

  async function handleSaveRecommendation() {
    setSavingRec(true)
    await updateGtmProcess(process.id, { ai_recommendation: recommendation || null })
    setProcess(prev => ({ ...prev, ai_recommendation: recommendation || null }))
    setSavingRec(false)
  }

  const slip = process.slip_extracted as Record<string, string | null> | null

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/go-to-market" className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-2">
            <ChevronLeft className="h-3 w-3" />
            Go to Market
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-gray-900">{process.title}</h1>
            {process.branch && (
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                {process.branch}
              </span>
            )}
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              process.status === 'proposal_ready' ? 'bg-green-100 text-green-700' :
              process.status === 'waiting' ? 'bg-amber-100 text-amber-700' :
              process.status === 'analyzing' ? 'bg-purple-100 text-purple-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {process.status === 'draft' ? 'Borrador' :
               process.status === 'sending' ? 'Enviando' :
               process.status === 'waiting' ? 'Esperando respuestas' :
               process.status === 'analyzing' ? 'Analizando' :
               process.status === 'proposal_ready' ? 'Propuesta lista' :
               process.status === 'completed' ? 'Completado' : process.status}
            </span>
          </div>
          {process.account_name && <p className="text-sm text-gray-500 mt-0.5">{process.account_name}</p>}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {process.status === 'proposal_ready' || process.status === 'completed' ? (
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" />
              Descargar propuesta PDF
            </button>
          ) : null}

          {canGenerate && (
            <button
              onClick={handleGeneratePdf}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {generating ? 'Generando…' : 'Generar propuesta PDF'}
            </button>
          )}

          {canSend && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-1.5 rounded-lg bg-[#0A2F6B] px-3 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-40 transition-colors"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {sending ? 'Enviando…' : `Enviar a ${pendingSend.length} aseguradora(s)`}
            </button>
          )}
        </div>
      </div>

      {sendSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {sendSuccess}
        </div>
      )}
      {(sendError || genError) && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {sendError ?? genError}
        </div>
      )}

      {/* Slip info */}
      {slip && Object.values(slip).some(Boolean) && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Datos del slip</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
            {Object.entries(slip).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="text-gray-400 capitalize">{k.replace(/_/g, ' ')}: </span>
                <span className="text-gray-700">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Progreso de respuestas</h2>
          <span className="text-sm font-semibold text-gray-900">{responded}/{total} respondieron</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {process.deadline_at && (
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Deadline: {new Date(process.deadline_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Insurers grid */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Aseguradoras</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insurers.map(ins => (
            <InsurerCard
              key={ins.id}
              record={ins}
              processStatus={process.status}
              onRemove={() => {
                startTransition(async () => {
                  await removeInsurerFromProcess(ins.id, process.id)
                  setInsurers(prev => prev.filter(i => i.id !== ins.id))
                })
              }}
              onDecline={() => {
                startTransition(async () => {
                  await markInsurerDeclined(ins.id, process.id)
                  setInsurers(prev => prev.map(i => i.id === ins.id ? { ...i, status: 'declined' } : i))
                })
              }}
              onViewProposal={() => handleViewProposal(ins)}
              onUploadManual={() => setUploadTarget(ins)}
            />
          ))}

          {process.status === 'draft' && (
            <AddInsurerRow
              insurers={allInsurers}
              defaultContacts={defaultContacts}
              contactsByInsurer={contactsByInsurer}
              existingIds={new Set(insurers.map(i => i.insurer_id))}
              processId={process.id}
              onAdded={rec => setInsurers(prev => [...prev, rec])}
            />
          )}
        </div>

        {!process.slip_url && insurers.length > 0 && (
          <p className="mt-3 text-xs text-amber-600 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Sube el slip de cotización antes de enviar. Ve a <Link href="/go-to-market" className="underline">Go to Market</Link> y edita este proceso.
          </p>
        )}
      </div>

      {/* Recommendation */}
      {(canGenerate || process.ai_recommendation) && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recomendación del asesor</h2>
            <button
              onClick={handleSaveRecommendation}
              disabled={savingRec}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              {savingRec ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {savingRec ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            Esta sección se incluirá en el PDF de propuesta comercial.
            El AI generará un borrador al crear el PDF, pero puedes editarla aquí.
          </p>
          <textarea
            rows={6}
            value={recommendation}
            onChange={e => setRecommendation(e.target.value)}
            placeholder="Escribe aquí la recomendación para el cliente, o déjalo en blanco para que el AI lo genere automáticamente al crear el PDF…"
            className="w-full text-sm border rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300 leading-relaxed"
          />
        </div>
      )}

      {/* Upload proposal sheet */}
      {uploadTarget && (
        <UploadProposalSheet
          record={uploadTarget}
          processId={process.id}
          onClose={() => setUploadTarget(null)}
          onUploaded={updatedRecord => {
            setInsurers(prev => prev.map(i => i.id === updatedRecord.id ? updatedRecord : i))
            setUploadTarget(null)
          }}
        />
      )}
    </div>
  )
}
