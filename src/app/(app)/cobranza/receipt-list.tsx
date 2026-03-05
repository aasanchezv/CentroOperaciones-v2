'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter }  from 'next/navigation'
import {
  ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, Loader2, CreditCard, Search, Calendar, Square, CheckSquare,
} from 'lucide-react'
import { Button }  from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { YearBarChart, type YearBarMonth } from '@/components/year-bar-chart'
import {
  markReceiptPaid,
  bulkMarkPaid,
  bulkCobrar,
  getReceiptNextStagePreview,
  sendAndAdvanceStage,
  type ReceiptWithContext,
  type ReceiptSendPreview,
  type CobranzaPeriod,
} from '@/app/actions/cobranza-receipt-actions'
import type { CobranzaStage } from '@/types/database.types'

// ─── Types ────────────────────────────────────────────────────

const PERIOD_LABELS: Record<CobranzaPeriod, string> = {
  vencido: 'Vencidos',
  today:   'Hoy',
  week:    'Esta semana',
  month:   'Este mes',
  quarter: 'Este trimestre',
}

const MES: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

interface Props {
  initialPending: ReceiptWithContext[]
  initialPaid:    ReceiptWithContext[]
  stages:         CobranzaStage[]
  period:         CobranzaPeriod
  periodCounts:   Record<CobranzaPeriod, number>
  yearData:       YearBarMonth[]
  selectedMonth:  string | null
}

// ─── Helpers ──────────────────────────────────────────────────

function getUrgencyBadge(days: number, status: string) {
  if (status === 'overdue' || days < 0) {
    return { label: 'Vencido', cls: 'bg-red-100 text-red-700' }
  }
  if (days === 0) return { label: 'Hoy',         cls: 'bg-red-100 text-red-700' }
  if (days <= 2)  return { label: `En ${days}d`,  cls: 'bg-orange-100 text-orange-700' }
  if (days <= 7)  return { label: `En ${days}d`,  cls: 'bg-amber-100 text-amber-700' }
  return           { label: `En ${days}d`,         cls: 'bg-blue-100 text-blue-700' }
}

function formatMXN(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  }).format(n)
}

function formatDateShort(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short',
  })
}

const BRANCH_LABELS: Record<string, string> = {
  gmm: 'GMM', vida: 'Vida', auto: 'Auto', rc: 'RC',
  danos: 'Daños', transporte: 'Transp.', fianzas: 'Fianzas',
  ap: 'AP', tecnicos: 'Técnicos', otro: 'Otro',
}

// ─── Main Component ───────────────────────────────────────────

export function ReceiptList({
  initialPending, initialPaid, stages, period, periodCounts, yearData, selectedMonth,
}: Props) {
  const router = useRouter()
  const [pending, setPending]   = useState(initialPending)
  const [paid, setPaid]         = useState(initialPaid)
  const [query,   setQuery]     = useState('')
  const [showPaid, setShowPaid] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Per-card loading
  const [loadingReceipts, setLoadingReceipts] = useState<Set<string>>(new Set())

  // Per-card preview states
  const [previewOpen,    setPreviewOpen]    = useState(false)
  const [previewData,    setPreviewData]    = useState<ReceiptSendPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewRcptId,  setPreviewRcptId]  = useState<string | null>(null)
  const [editSubject,    setEditSubject]    = useState('')
  const [editBody,       setEditBody]       = useState('')
  const [editWA,         setEditWA]         = useState('')
  const [sendError,      setSendError]      = useState<string | null>(null)

  // ── Bulk selection ────────────────────────────────────────────
  const [selected,    setSelected]    = useState<string[]>([])
  const [bulkAction,  setBulkAction]  = useState<'cobrar' | 'cobrado' | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult,  setBulkResult]  = useState<string | null>(null)

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll(ids: string[]) {
    const allIn = ids.every(id => selected.includes(id))
    if (allIn) {
      setSelected(prev => prev.filter(id => !ids.includes(id)))
    } else {
      setSelected(prev => [...new Set([...prev, ...ids])])
    }
  }

  function clearSelection() { setSelected([]) }

  // ── Bulk confirm ──────────────────────────────────────────────

  async function handleBulkConfirm() {
    if (!bulkAction || selected.length === 0) return
    setBulkLoading(true)
    setBulkResult(null)
    try {
      if (bulkAction === 'cobrado') {
        const res = await bulkMarkPaid(selected)
        setPending(prev => prev.filter(r => !selected.includes(r.id)))
        setSelected([])
        setBulkResult(`${res.success} recibo${res.success !== 1 ? 's' : ''} marcado${res.success !== 1 ? 's' : ''} como cobrado${res.success !== 1 ? 's' : ''}`)
      } else {
        const res = await bulkCobrar(selected)
        // Optimistic: remove fully processed from list
        setPending(prev => prev.filter(r => !selected.includes(r.id)))
        setSelected([])
        const errs = res.errors.length > 0 ? ` (${res.errors.length} errores)` : ''
        setBulkResult(`${res.sent} notificación${res.sent !== 1 ? 'es' : ''} enviada${res.sent !== 1 ? 's' : ''}${errs}`)
      }
    } catch (e) {
      setBulkResult(`Error: ${(e as Error).message}`)
    } finally {
      setBulkLoading(false)
      setBulkAction(null)
    }
  }

  // ── Month chart click → navigate ─────────────────────────────

  function handleMonthClick(month: string | null) {
    if (!month) {
      router.push(`?period=${period}`)
    } else {
      router.push(`?month=${month}`)
    }
  }

  const q = query.trim().toLowerCase()
  const filteredPending = q
    ? pending.filter(r =>
        (r.account_name ?? '').toLowerCase().includes(q) ||
        (r.policy_number ?? '').toLowerCase().includes(q)
      )
    : pending
  const filteredPaid = q
    ? paid.filter(r =>
        (r.account_name ?? '').toLowerCase().includes(q) ||
        (r.policy_number ?? '').toLowerCase().includes(q)
      )
    : paid

  // ── Group pending by stage ─────────────────────────────────

  const groupedByStage = useMemo(() => {
    const sortMap = new Map(stages.map(s => [s.id, s.sort_order ?? 0]))
    const groups  = new Map<string | null, {
      stageName: string; sortOrder: number; receipts: ReceiptWithContext[]
    }>()
    for (const r of filteredPending) {
      const key = r.current_stage_id ?? null
      if (!groups.has(key)) {
        groups.set(key, {
          stageName:  r.stage_name ?? 'Sin etapa',
          sortOrder:  key ? (sortMap.get(key) ?? 999) : 9999,
          receipts:   [],
        })
      }
      groups.get(key)!.receipts.push(r)
    }
    return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder)
  }, [filteredPending, stages])

  // ── Mark individual as paid ───────────────────────────────────

  function handleMarkPaid(receiptId: string) {
    setLoadingReceipts(prev => new Set(prev).add(receiptId))
    startTransition(async () => {
      const result = await markReceiptPaid(receiptId)
      setLoadingReceipts(prev => { const s = new Set(prev); s.delete(receiptId); return s })
      if (!result.error) {
        setPending(prev => prev.filter(r => r.id !== receiptId))
      }
    })
  }

  // ── Cobrar: load preview then open modal ──────────────────────

  async function handleCobrarClick(receiptId: string) {
    setSendError(null)
    setPreviewLoading(true)
    setPreviewRcptId(receiptId)
    const result = await getReceiptNextStagePreview(receiptId)
    setPreviewLoading(false)
    if ('error' in result) {
      setSendError(result.error)
      return
    }
    setPreviewData(result)
    setEditSubject(result.email?.subject ?? '')
    setEditBody(result.email?.body ?? '')
    setEditWA(result.whatsapp?.body ?? '')
    setPreviewOpen(true)
  }

  // ── Confirm send + advance ────────────────────────────────────

  function handleSendConfirm() {
    if (!previewRcptId || !previewData) return
    startTransition(async () => {
      const sendPayload: Parameters<typeof sendAndAdvanceStage>[1] = {}
      if (previewData.hasEmail && previewData.email && editBody) {
        sendPayload.email = { to: previewData.email.to, subject: editSubject, body: editBody }
      }
      if (previewData.hasWhatsApp && previewData.whatsapp && editWA) {
        sendPayload.whatsapp = { to: previewData.whatsapp.to, body: editWA }
      }
      const result = await sendAndAdvanceStage(previewRcptId, sendPayload)
      if ('error' in result) {
        setSendError(result.error)
        return
      }
      const nextStageObj = stages.find(s => s.id === result.stageId)
      setPending(prev => prev.map(r =>
        r.id === previewRcptId
          ? { ...r, current_stage_id: result.stageId, stage_name: result.stageName, stage_sort: nextStageObj?.sort_order ?? null }
          : r
      ))
      setPreviewOpen(false)
      setPreviewData(null)
      setPreviewRcptId(null)
    })
  }

  // ── Render ────────────────────────────────────────────────────

  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="space-y-4">

      {/* Year chart */}
      <YearBarChart
        title="Vencimientos del año"
        bars={yearData}
        selectedMonth={selectedMonth}
        onMonthClick={handleMonthClick}
        showAmount
        emptyLabel="Sin recibos pendientes este año"
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por cliente o # póliza…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20 transition-colors"
        />
      </div>

      {/* Period filter (hidden when custom month selected) */}
      {!selectedMonth ? (
        <div className="flex gap-1 border-b pb-3 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as CobranzaPeriod[]).map(p => {
            const count = periodCounts[p]
            return (
              <button
                key={p}
                onClick={() => router.push(`?period=${p}`)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? p === 'vencido'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-900 text-white'
                    : p === 'vencido'
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {PERIOD_LABELS[p]}
                {count > 0 && (
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${
                    period === p
                      ? 'bg-white/20 text-white'
                      : p === 'vencido'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 pb-3 border-b">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white">
            <Calendar className="h-3.5 w-3.5" />
            {MES[selectedMonth.slice(5, 7)]} {selectedMonth.slice(0, 4)}
          </span>
          <button
            onClick={() => router.push(`?period=${period}`)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            × Ver período actual
          </button>
        </div>
      )}

      {/* Bulk result toast */}
      {bulkResult && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-emerald-700 font-medium">{bulkResult}</span>
          <button onClick={() => setBulkResult(null)} className="text-emerald-500 hover:text-emerald-700 text-xs">×</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-blue-700 font-medium">
            {selected.length} recibo{selected.length !== 1 ? 's' : ''} seleccionado{selected.length !== 1 ? 's' : ''}
          </span>
          <Button
            size="sm"
            className="ml-auto gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs"
            onClick={() => setBulkAction('cobrar')}
          >
            <CreditCard className="h-3 w-3" />
            Cobrar {selected.length}
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            onClick={() => setBulkAction('cobrado')}
          >
            <CheckCircle2 className="h-3 w-3" />
            Cobrado {selected.length}
          </Button>
          <button className="text-xs text-blue-500 hover:text-blue-700" onClick={clearSelection}>
            Cancelar
          </button>
        </div>
      )}

      {/* Pending receipts — Kanban by stage */}
      {filteredPending.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
          <p className="text-sm text-gray-500">
            {q ? 'Sin resultados para esta búsqueda' : 'Sin recibos pendientes en este período'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="flex gap-3 min-w-max items-start">
            {groupedByStage.map(group => {
              const groupIds   = group.receipts.map(r => r.id)
              const allChecked = groupIds.every(id => selected.includes(id))
              const someChecked = groupIds.some(id => selected.includes(id)) && !allChecked

              return (
                <div key={group.stageName} className="w-[260px] shrink-0">
                  {/* Column header */}
                  <div className="flex items-center justify-between px-1 mb-2">
                    <div className="flex items-center gap-1.5">
                      {/* Select-all checkbox */}
                      <button
                        onClick={() => toggleSelectAll(groupIds)}
                        className="text-gray-400 hover:text-blue-500 transition-colors"
                        title={allChecked ? 'Deseleccionar todos' : 'Seleccionar todos'}
                      >
                        {allChecked
                          ? <CheckSquare className="h-3.5 w-3.5 text-blue-500" />
                          : someChecked
                            ? <CheckSquare className="h-3.5 w-3.5 text-blue-300" />
                            : <Square className="h-3.5 w-3.5" />
                        }
                      </button>
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 truncate">
                        {group.stageName}
                      </span>
                    </div>
                    <span className="ml-2 shrink-0 text-xs font-semibold bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                      {group.receipts.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2">
                    {group.receipts.map(receipt => {
                      const urgency      = getUrgencyBadge(receipt.days_until_due, receipt.status)
                      const isLoading    = loadingReceipts.has(receipt.id)
                      const isPreviewing = previewLoading && previewRcptId === receipt.id
                      const currentSort  = receipt.stage_sort ?? -1
                      const hasNextStage = stages.some(s => (s.sort_order ?? 0) > currentSort)
                      const isChecked    = selected.includes(receipt.id)

                      const conducto    = receipt.conducto_cobro ?? null
                      const isDomiciliado = conducto?.toUpperCase().includes('DOMICILIAD') ?? false

                      return (
                        <div
                          key={receipt.id}
                          onClick={() => router.push(`/accounts/${receipt.account_id}`)}
                          className={`rounded-xl border bg-white border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer ${
                            isChecked ? 'border-blue-400 bg-blue-50/30' : ''
                          }`}
                        >
                          {/* Card body */}
                          <div className="px-3 pt-3 pb-2">
                            {/* Checkbox + Account name + amount */}
                            <div className="flex items-start gap-1.5">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 mt-0.5 rounded border-gray-300 text-blue-600 shrink-0 cursor-pointer"
                                checked={isChecked}
                                onChange={() => toggleSelect(receipt.id)}
                                onClick={e => e.stopPropagation()}
                              />
                              <div className="flex-1 min-w-0 flex items-start justify-between gap-1">
                                <p className="text-xs font-semibold text-gray-900 truncate leading-tight flex-1">
                                  {receipt.account_name}
                                </p>
                                <p className="text-xs font-semibold text-gray-900 shrink-0">
                                  {formatMXN(receipt.amount)}
                                </p>
                              </div>
                            </div>

                            {/* Date + urgency */}
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap ml-5">
                              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700">
                                <Calendar className="h-2.5 w-2.5 shrink-0" />
                                {formatDateShort(receipt.due_date)}
                              </span>
                              <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${urgency.cls}`}>
                                {receipt.days_until_due < 0 && <AlertCircle className="h-2.5 w-2.5" />}
                                {urgency.label}
                              </span>
                            </div>

                            {/* Conducto badge */}
                            {conducto && (
                              <div className="mt-1.5 ml-5">
                                <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                                  isDomiciliado
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-gray-50 text-gray-500 border-gray-200'
                                }`}>
                                  {conducto}
                                </span>
                              </div>
                            )}

                            {/* Branch · Insurer · Policy */}
                            <p className="text-[10px] text-gray-400 mt-1 ml-5 truncate">
                              {BRANCH_LABELS[receipt.branch ?? ''] ?? receipt.branch ?? '—'}
                              {' · '}
                              {receipt.insurer ?? '—'}
                              {receipt.policy_number ? ` · ${receipt.policy_number}` : ''}
                            </p>
                          </div>

                          {/* Card actions */}
                          <div
                            className="px-3 pb-3 flex gap-1.5"
                            onClick={e => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              onClick={() => handleCobrarClick(receipt.id)}
                              disabled={!hasNextStage || isPreviewing || isPending}
                              className={`flex-1 h-7 text-[11px] gap-1 text-white ${
                                hasNextStage
                                  ? 'bg-blue-600 hover:bg-blue-700'
                                  : 'bg-gray-300 cursor-not-allowed'
                              }`}
                            >
                              {isPreviewing
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <CreditCard className="h-3 w-3" />
                              }
                              {hasNextStage ? 'Cobrar' : 'Último'}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleMarkPaid(receipt.id)}
                              disabled={isLoading || isPending}
                              className="flex-1 h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {isLoading
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <CheckCircle2 className="h-3 w-3" />
                              }
                              Cobrado
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Paid receipts (collapsible) */}
      {filteredPaid.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowPaid(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            {showPaid
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />
            }
            Cobrados este período ({filteredPaid.length})
          </button>
          {showPaid && (
            <ul className="mt-2 space-y-1.5">
              {filteredPaid.map(receipt => (
                <li
                  key={receipt.id}
                  onClick={() => router.push(`/accounts/${receipt.account_id}`)}
                  className="rounded-lg border bg-gray-50 border-gray-200 px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div>
                    <p className="text-sm text-gray-700">{receipt.account_name}</p>
                    <p className="text-xs text-gray-400">
                      {receipt.insurer ?? '—'} · {receipt.policy_number ?? 'S/N'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-700">{formatMXN(receipt.amount)}</p>
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> Cobrado
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Per-card preview/send dialog */}
      <Dialog open={previewOpen} onOpenChange={v => { if (!isPending) { setPreviewOpen(v); if (!v) setPreviewData(null) } }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Vista previa — {previewData?.accountName}
            </DialogTitle>
          </DialogHeader>

          {previewData && (
            <div className="space-y-4 text-sm">
              <p className="text-gray-500">
                Destinatario: <strong>{previewData.recipientName}</strong>
                {previewData.email && (
                  <span className="text-gray-400 ml-1">· {previewData.email.to}</span>
                )}
              </p>
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700 text-xs font-medium">
                Avanzará a: <strong>{previewData.nextStageName}</strong>
              </div>

              {previewData.hasEmail ? (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Correo electrónico
                  </label>
                  <input
                    value={editSubject}
                    onChange={e => setEditSubject(e.target.value)}
                    placeholder="Asunto"
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-colors"
                  />
                  <textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={8}
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y transition-colors font-mono leading-relaxed"
                  />
                </div>
              ) : (
                <p className="text-gray-400 text-xs">Esta etapa no envía correo electrónico.</p>
              )}

              {previewData.hasWhatsApp && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                    WhatsApp · {previewData.whatsapp?.to}
                  </label>
                  <textarea
                    value={editWA}
                    onChange={e => setEditWA(e.target.value)}
                    rows={4}
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y transition-colors"
                  />
                </div>
              )}

              {!previewData.hasEmail && !previewData.hasWhatsApp && (
                <p className="text-amber-600 text-xs flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Sin canales configurados para esta etapa — solo se avanzará la etapa.
                </p>
              )}

              {sendError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {sendError}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setPreviewOpen(false); setPreviewData(null) }}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSendConfirm}
              disabled={isPending}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {previewData?.hasEmail || previewData?.hasWhatsApp
                ? 'Enviar y avanzar etapa'
                : 'Avanzar etapa'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk confirmation dialog — DOUBLE confirmation */}
      <Dialog open={!!bulkAction} onOpenChange={v => { if (!v && !bulkLoading) setBulkAction(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {bulkAction === 'cobrar' ? 'Cobrar masivo' : 'Marcar cobrados'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-700">
              {bulkAction === 'cobrar'
                ? `Se enviará la notificación de cobro a ${selected.length} recibo${selected.length !== 1 ? 's' : ''} y se avanzará su etapa.`
                : `Se marcarán ${selected.length} recibo${selected.length !== 1 ? 's' : ''} como cobrado${selected.length !== 1 ? 's' : ''} sin enviar notificación.`
              }
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Esta acción no se puede deshacer. Confirma solo si estás seguro.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkAction(null)} disabled={bulkLoading}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={bulkLoading}
              className={bulkAction === 'cobrar'
                ? 'bg-blue-600 hover:bg-blue-700 text-white gap-1.5'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5'
              }
              onClick={handleBulkConfirm}
            >
              {bulkLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
