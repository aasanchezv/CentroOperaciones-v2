'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Mail, CheckCircle2, XCircle, Clock, Send, ChevronDown, ChevronRight,
  AlertCircle, Loader2, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  updateMovementStatus,
  sendMovementFollowUp,
  type MovementTypeInput,
} from '@/app/actions/movement-actions'
import type { PolicyMovement } from '@/types/database.types'

// Suppress unused import warning — only used for type inference in actions
type _MI = MovementTypeInput

// ─── Types & Helpers ──────────────────────────────────────────

interface InsurerInfo {
  id:         string
  name:       string
  short_name: string | null
  email:      string | null
}

interface Props {
  initialMovements: PolicyMovement[]
  insurers:         InsurerInfo[]
  userRole:         string
}

const STATUS_LABELS: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  draft:     { label: 'Borrador',   cls: 'bg-gray-100 text-gray-600',   Icon: Clock       },
  sent:      { label: 'Enviado',    cls: 'bg-blue-100 text-blue-700',   Icon: Send        },
  confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  rejected:  { label: 'Rechazado', cls: 'bg-red-100 text-red-700',     Icon: XCircle     },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatMXN(v: unknown) {
  const n = Number(v)
  if (!v || isNaN(n)) return null
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

function renderFieldValues(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ')
}

function buildEmailBody(
  movements: PolicyMovement[],
  agentName: string,
  insurerName: string,
): string {
  const date = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const lines = movements.map((mv, i) => {
    const fields = Object.entries(mv.field_values ?? {})
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `   - ${k}: ${v}`)
      .join('\n')
    return `${i + 1}. ${mv.movement_type_name}\n   Póliza: ${mv.policy_number ?? 'S/N'}\n${fields ? fields + '\n' : ''}`
  })

  return `Estimado ejecutivo de ${insurerName},\n\nPor medio de la presente le solicito atención a los siguientes movimientos pendientes (${date}):\n\n${lines.join('\n')}\nQuedo en espera de su confirmación.\n\nAtentamente,\n${agentName}`
}

// ─── Main Component ───────────────────────────────────────────

export function MovementsClient({ initialMovements, insurers, userRole }: Props) {
  const router = useRouter()
  const [movements, setMovements] = useState(initialMovements)
  const [query, setQuery]         = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [isPending, startTransition]    = useTransition()
  const [loadingId, setLoadingId]       = useState<string | null>(null)

  // Follow-up email dialog
  const [followUpOpen,  setFollowUpOpen]  = useState(false)
  const [followUpInsurer, setFollowUpInsurer] = useState<string>('')
  const [followUpIds,   setFollowUpIds]   = useState<string[]>([])
  const [emailTo,       setEmailTo]       = useState('')
  const [emailSubject,  setEmailSubject]  = useState('')
  const [emailBody,     setEmailBody]     = useState('')
  const [sendError,     setSendError]     = useState<string | null>(null)
  const [sendSuccess,   setSendSuccess]   = useState(false)

  // Collapsed insurer groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [showResolved, setShowResolved] = useState(false)

  const q = query.trim().toLowerCase()

  const pendingMovements = useMemo(() =>
    movements.filter(m => m.status === 'draft' || m.status === 'sent'),
    [movements]
  )
  const resolvedMovements = useMemo(() =>
    movements.filter(m => m.status === 'confirmed' || m.status === 'rejected'),
    [movements]
  )

  const filteredPending = useMemo(() => {
    if (!q) return pendingMovements
    return pendingMovements.filter(m =>
      (m.movement_type_name ?? '').toLowerCase().includes(q) ||
      (m.insurer ?? '').toLowerCase().includes(q) ||
      (m.policy_number ?? '').toLowerCase().includes(q)
    )
  }, [pendingMovements, q])

  // Group pending by insurer
  const groupedByInsurer = useMemo(() => {
    const groups = new Map<string, PolicyMovement[]>()
    for (const m of filteredPending) {
      const key = m.insurer
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filteredPending])

  function toggleGroup(insurer: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(insurer)) next.delete(insurer)
      else next.add(insurer)
      return next
    })
  }

  function handleStatusChange(mvId: string, status: 'sent' | 'confirmed' | 'rejected') {
    setLoadingId(mvId)
    startTransition(async () => {
      const result = await updateMovementStatus(mvId, status)
      setLoadingId(null)
      if ('success' in result) {
        setMovements(prev => prev.map(m =>
          m.id === mvId ? { ...m, status } : m
        ))
      }
    })
  }

  function openFollowUp(insurer: string, mvIds: string[]) {
    const insurerInfo = insurers.find(i =>
      (i.short_name?.toLowerCase() === insurer.toLowerCase()) ||
      (i.name.toLowerCase() === insurer.toLowerCase())
    )
    const toEmail = insurerInfo?.email ?? ''
    const insurerMovements = movements.filter(m => mvIds.includes(m.id))
    const subject = `Seguimiento movimientos pendientes — ${insurer} — ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`
    const body = buildEmailBody(insurerMovements, 'Murguía Seguros', insurer)

    setFollowUpInsurer(insurer)
    setFollowUpIds(mvIds)
    setEmailTo(toEmail)
    setEmailSubject(subject)
    setEmailBody(body)
    setSendError(null)
    setSendSuccess(false)
    setFollowUpOpen(true)
  }

  function handleSendFollowUp() {
    setSendError(null)
    startTransition(async () => {
      const result = await sendMovementFollowUp({
        movementIds: followUpIds,
        to:          emailTo,
        subject:     emailSubject,
        body:        emailBody,
      })
      if ('error' in result) {
        setSendError(result.error)
        return
      }
      setSendSuccess(true)
      setMovements(prev => prev.map(m =>
        followUpIds.includes(m.id) ? { ...m, status: 'sent' } : m
      ))
      setTimeout(() => { setFollowUpOpen(false); setSendSuccess(false) }, 1500)
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por tipo, aseguradora o # póliza…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/20 transition-colors"
          />
        </div>
      </div>

      {/* Pending — grouped by insurer */}
      {filteredPending.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
          <p className="text-sm text-gray-500">
            {q ? 'Sin resultados para esta búsqueda' : 'Sin movimientos pendientes'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByInsurer.map(([insurer, mvs]) => {
            const collapsed = collapsedGroups.has(insurer)
            const draftIds  = mvs.filter(m => m.status === 'draft' || m.status === 'sent').map(m => m.id)
            return (
              <div key={insurer} className="bg-white rounded-xl border overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                  <button
                    onClick={() => toggleGroup(insurer)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-800 hover:text-gray-900"
                  >
                    {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {insurer}
                    <span className="ml-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full px-2 py-0.5">
                      {mvs.length}
                    </span>
                  </button>
                  {draftIds.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => openFollowUp(insurer, draftIds)}
                      className="gap-1.5 h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Enviar seguimiento
                    </Button>
                  )}
                </div>

                {/* Movement rows */}
                {!collapsed && (
                  <div className="divide-y">
                    {mvs.map(mv => {
                      const statusInfo = STATUS_LABELS[mv.status] ?? STATUS_LABELS.draft
                      const StatusIcon = statusInfo.Icon
                      const isLoading = loadingId === mv.id

                      return (
                        <div
                          key={mv.id}
                          className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                        >
                          {/* Status icon */}
                          <div className={`mt-0.5 shrink-0 rounded-full p-1 ${statusInfo.cls}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                          </div>

                          {/* Content */}
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => mv.account_id && router.push(`/accounts/${mv.account_id}`)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-gray-900">{mv.movement_type_name}</p>
                                <p className="text-xs text-gray-500">
                                  {mv.policy_number ? `Póliza ${mv.policy_number}` : 'Sin número'}
                                  {' · '}
                                  {formatDate(mv.created_at)}
                                </p>
                                {Object.keys(mv.field_values ?? {}).length > 0 && (
                                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">
                                    {renderFieldValues(mv.field_values)}
                                  </p>
                                )}
                              </div>
                              <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.cls}`}>
                                <StatusIcon className="h-3 w-3" />
                                {statusInfo.label}
                              </span>
                            </div>
                          </div>

                          {/* Status actions */}
                          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                            ) : (
                              <>
                                {mv.status !== 'confirmed' && (
                                  <button
                                    onClick={() => handleStatusChange(mv.id, 'confirmed')}
                                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 rounded hover:bg-emerald-50"
                                  >
                                    Confirmar
                                  </button>
                                )}
                                {mv.status !== 'rejected' && mv.status !== 'confirmed' && (
                                  <button
                                    onClick={() => handleStatusChange(mv.id, 'rejected')}
                                    className="text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50"
                                  >
                                    Rechazar
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Resolved collapsible */}
      {resolvedMovements.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowResolved(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            {showResolved ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Confirmados / Rechazados ({resolvedMovements.length})
          </button>
          {showResolved && (
            <div className="mt-2 bg-white rounded-xl border divide-y">
              {resolvedMovements.map(mv => {
                const statusInfo = STATUS_LABELS[mv.status] ?? STATUS_LABELS.draft
                const StatusIcon = statusInfo.Icon
                return (
                  <div key={mv.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={`shrink-0 rounded-full p-1 ${statusInfo.cls}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                    </div>
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => mv.account_id && router.push(`/accounts/${mv.account_id}`)}
                    >
                      <p className="text-sm text-gray-700">{mv.movement_type_name}</p>
                      <p className="text-xs text-gray-400">
                        {mv.insurer} · {mv.policy_number ?? 'S/N'} · {formatDate(mv.created_at)}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.cls}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Follow-up email dialog */}
      <Dialog open={followUpOpen} onOpenChange={v => { if (!isPending) { setFollowUpOpen(v) } }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seguimiento a {followUpInsurer}</DialogTitle>
          </DialogHeader>

          {sendSuccess ? (
            <div className="flex items-center gap-2 py-6 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <p className="text-sm">Correo enviado. Movimientos marcados como Enviados.</p>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Para *</label>
                <input
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  placeholder="email@aseguradora.com"
                  type="email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Asunto</label>
                <input
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Mensaje</label>
                <textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  rows={12}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 resize-y transition-colors font-mono text-xs leading-relaxed"
                />
              </div>
              {sendError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {sendError}
                </p>
              )}
            </div>
          )}

          {!sendSuccess && (
            <DialogFooter>
              <Button variant="ghost" onClick={() => setFollowUpOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button
                onClick={handleSendFollowUp}
                disabled={isPending || !emailTo}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Mail className="h-4 w-4" />
                Enviar seguimiento
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
