'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import {
  Play, Mail, Phone, Loader2, ChevronDown, CheckCircle2, MessageSquare, Flag, Square, CheckSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  startRenewal, logCallAttempt, startBulkRenewals, closeRenewal,
} from '@/app/actions/renewal-actions'
import { RenewalEmailComposer } from './renewal-email-composer'
import type { PolicyBranch, RenewalStatus } from '@/types/database.types'
import type { RenewalVars } from '@/lib/collection-vars'
import { BRANCH_LABELS, formatDate, calcDaysUntil, renderRenewalTemplate } from '@/lib/collection-vars'

// ── Tipos ──────────────────────────────────────────────────────

interface Stage {
  id:                    string
  name:                  string
  sort_order:            number
  send_email?:           boolean
  send_whatsapp?:        boolean
  email_template_id?:    string | null
  whatsapp_template_id?: string | null
}

interface Template {
  id:            string
  name:          string
  subject_email: string | null
  body_email:    string | null
  body_whatsapp: string | null
}

interface PolicyNested {
  id:            string
  policy_number: string | null
  insurer:       string
  branch:        PolicyBranch
  start_date:    string | null
  end_date:      string | null
  premium:       number | null
  tomador:       { full_name: string; email: string | null; phone?: string | null } | { full_name: string; email: string | null; phone?: string | null }[] | null
}

interface AccountNested {
  id:           string
  name:         string
  account_code: string
  contacts?:    { id: string; full_name: string; email: string | null }[] | null
}

interface RenewalRow {
  id:                  string
  status:              RenewalStatus
  client_confirmed_at: string | null
  call_attempts:       number
  updated_at:          string
  current_stage_id:    string | null
  policy:              PolicyNested | PolicyNested[] | null
  account:             AccountNested | AccountNested[] | null
  assigned_profile:    { id: string; full_name: string | null; email: string } | null
  stage:               Stage | Stage[] | null
}

interface CandidateRow {
  id:            string
  policy_number: string | null
  insurer:       string
  branch:        PolicyBranch
  end_date:      string | null
  premium:       number | null
  account_id:    string
  account:       AccountNested | AccountNested[] | null
  tomador:       { full_name: string } | { full_name: string }[] | null
}

export interface RenewalKanbanProps {
  candidates:        CandidateRow[]
  inProgress:        RenewalRow[]
  completed:         RenewalRow[]
  stages:            Stage[]
  templates:         Template[]
  currentUserId:     string
  currentUserEmail?: string | null
}

interface ComposerTarget {
  renewalId:            string
  accountName:          string
  stageEmailTemplateId: string | null | undefined
  toEmail:              string | null
  agentEmail:           string | null | undefined
  vars:                 Partial<RenewalVars>
  accountContacts:      { id: string; full_name: string; email: string }[]
}

// ── Helpers ────────────────────────────────────────────────────

const BRANCH_LABEL: Record<PolicyBranch, string> = {
  gmm: 'GMM', vida: 'Vida', auto: 'Autos', rc: 'RC',
  danos: 'Daños', transporte: 'Transp.', fianzas: 'Fianzas',
  ap: 'AP', tecnicos: 'Téc.', otro: 'Otro',
}

const STATUS_LABEL: Record<RenewalStatus, string> = {
  in_progress:             'En proceso',
  changes_requested:       'Cambios',
  cancelled:               'Cancelada',
  renewed_pending_payment: 'Pend. pago',
  renewed_paid:            'Renovada ✓',
}

const STATUS_CLASS: Record<RenewalStatus, string> = {
  in_progress:             'bg-blue-50 text-blue-700',
  changes_requested:       'bg-amber-50 text-amber-700',
  cancelled:               'bg-red-50 text-red-600',
  renewed_pending_payment: 'bg-orange-50 text-orange-700',
  renewed_paid:            'bg-green-50 text-green-700',
}

function getPolicy(r: RenewalRow): PolicyNested | null {
  return (Array.isArray(r.policy) ? r.policy[0] : r.policy) ?? null
}

function getAccount(r: RenewalRow): AccountNested | null {
  return (Array.isArray(r.account) ? r.account[0] : r.account) ?? null
}

function getCandidateAccount(c: CandidateRow): AccountNested | null {
  return (Array.isArray(c.account) ? c.account[0] : c.account) ?? null
}

function getStage(r: RenewalRow): Stage | null {
  return (Array.isArray(r.stage) ? r.stage[0] : r.stage) ?? null
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '—'
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000)     return `$${Math.round(amount / 1_000)}k`
  return `$${amount.toLocaleString('es-MX')}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso + 'T12:00:00').getTime() - Date.now()) / 86_400_000)
}

function ExpiryBadge({ endDate }: { endDate: string | null }) {
  const days = daysUntil(endDate)
  if (days === null) return <span className="text-gray-400 text-[10px]">—</span>
  if (days < 0)  return <span className="text-[10px] font-semibold text-red-600">Vencida</span>
  if (days === 0) return <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1 rounded">Hoy</span>
  if (days <= 5)  return <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1 rounded">{days}d</span>
  if (days <= 15) return <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1 rounded">{days}d</span>
  if (days <= 30) return <span className="text-[10px] text-amber-600">{days}d</span>
  return <span className="text-[10px] text-gray-400">{days}d</span>
}

function formatDateShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function buildWaHref(phone: string, body: string | null): string {
  const clean = phone.replace(/\D/g, '')
  const num   = clean.startsWith('52') ? clean : `52${clean}`
  const text  = body ? `?text=${encodeURIComponent(body)}` : ''
  return `https://wa.me/${num}${text}`
}

// ── KanbanColumn ───────────────────────────────────────────────

function KanbanColumn({
  header,
  count,
  headerColor,
  children,
  onSelectAll,
  allSelected,
  someSelected,
}: {
  header:        string
  count:         number
  headerColor:   string
  children:      React.ReactNode
  onSelectAll?:  () => void
  allSelected?:  boolean
  someSelected?: boolean
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-gray-50/50 flex-1 min-w-[220px]">
      {/* Header */}
      <div className={cn('px-3 py-2.5 flex items-center justify-between rounded-t-xl border-b', headerColor)}>
        <div className="flex items-center gap-1.5 min-w-0">
          {onSelectAll && count > 0 && (
            <button onClick={onSelectAll} className="text-gray-400 hover:text-indigo-500 transition-colors shrink-0" title={allSelected ? 'Deseleccionar' : 'Seleccionar todos'}>
              {allSelected
                ? <CheckSquare className="h-3.5 w-3.5 text-indigo-500" />
                : someSelected
                  ? <CheckSquare className="h-3.5 w-3.5 text-indigo-300" />
                  : <Square className="h-3.5 w-3.5" />
              }
            </button>
          )}
          <span className="text-xs font-semibold text-gray-700 truncate">{header}</span>
        </div>
        <span className="text-[10px] bg-white/80 text-gray-600 rounded-full px-1.5 py-0.5 font-bold leading-none shrink-0 ml-1">
          {count}
        </span>
      </div>
      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto" style={{ maxHeight: '520px' }}>
        {children}
        {count === 0 && (
          <div className="text-center text-[11px] text-gray-400 py-8 px-2">Sin renovaciones</div>
        )}
      </div>
    </div>
  )
}

// ── CandidateCard ──────────────────────────────────────────────

function CandidateCard({
  candidate,
  onStart,
  onBulkSelect,
  isSelected,
  starting,
}: {
  candidate:    CandidateRow
  onStart:      (policyId: string) => void
  onBulkSelect: (id: string) => void
  isSelected:   boolean
  starting:     boolean
}) {
  const account = getCandidateAccount(candidate)
  const tomador = Array.isArray(candidate.tomador) ? candidate.tomador[0] : candidate.tomador

  return (
    <div className={cn(
      'bg-white rounded-xl border shadow-sm p-3 hover:shadow-md transition-shadow',
      isSelected && 'border-emerald-400 bg-emerald-50/30'
    )}>
      {/* Checkbox + client name + expiry */}
      <div className="flex items-start gap-1.5 mb-1">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 mt-0.5 rounded border-gray-300 text-emerald-600 shrink-0 cursor-pointer"
          checked={isSelected}
          onChange={() => onBulkSelect(candidate.id)}
        />
        <div className="flex-1 min-w-0 flex items-start justify-between gap-1">
          <p className="text-xs font-semibold text-gray-900 leading-tight truncate">
            {account?.name ?? '—'}
          </p>
          <ExpiryBadge endDate={candidate.end_date} />
        </div>
      </div>

      {/* Policy info */}
      <p className="text-[11px] text-gray-500 ml-5 mb-0.5">
        {BRANCH_LABEL[candidate.branch]} · {candidate.insurer}
      </p>
      {candidate.policy_number && (
        <p className="text-[10px] text-gray-400 font-mono ml-5 mb-0.5">{candidate.policy_number}</p>
      )}
      {tomador && (
        <p className="text-[10px] text-gray-400 ml-5 mb-1 truncate">{tomador.full_name}</p>
      )}
      {candidate.premium && (
        <p className="text-[11px] text-gray-500 ml-5 mb-2 font-medium">{formatCurrency(candidate.premium)}</p>
      )}
      {candidate.end_date && (
        <p className="text-[10px] text-gray-400 ml-5 mb-2">Vence: {formatDateShort(candidate.end_date)}</p>
      )}

      {/* Iniciar button */}
      <Button
        size="sm"
        className="w-full gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7"
        onClick={() => onStart(candidate.id)}
        disabled={starting}
      >
        {starting
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <Play className="h-3 w-3" />
        }
        Iniciar renovación
      </Button>
    </div>
  )
}

// ── RenewalCard ────────────────────────────────────────────────

function RenewalCard({
  renewal,
  stages,
  templates,
  agentEmail,
  onLogCall,
  onOpenComposer,
  onCloseRenewal,
  onBulkSelect,
  isSelected,
  loggingCall,
}: {
  renewal:         RenewalRow
  stages:          Stage[]
  templates:       Template[]
  agentEmail?:     string | null
  onLogCall:        (id: string) => void
  onOpenComposer:   (target: ComposerTarget) => void
  onCloseRenewal:   (id: string, accountName: string) => void
  onBulkSelect?:    (id: string) => void
  isSelected?:      boolean
  loggingCall:      boolean
}) {
  const policy  = getPolicy(renewal)
  const account = getAccount(renewal)
  const stage   = getStage(renewal)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tomador = policy?.tomador ? (Array.isArray(policy.tomador) ? (policy.tomador as any)[0] : policy.tomador) : null

  // Contact info al scope del componente (usado por email y WA)
  const clientEmail = tomador?.email ?? null
  const clientPhone = (tomador as { phone?: string | null } | null)?.phone ?? null

  // Find next stage for display
  const currentStageIdx = stages.findIndex(s => s.id === renewal.current_stage_id)
  const nextStage       = currentStageIdx >= 0 ? stages[currentStageIdx + 1] : null

  // Vars base (reutilizados por email y WA)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ejecutivoName = renewal.assigned_profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((Array.isArray(renewal.assigned_profile) ? (renewal.assigned_profile as any)[0] : renewal.assigned_profile)?.full_name ?? '')
    : ''

  const baseVars: Partial<RenewalVars> = {
    nombre:           tomador?.full_name ?? account?.name ?? '',
    aseguradora:      policy?.insurer    ?? '',
    numero_poliza:    policy?.policy_number ?? '',
    vencimiento:      formatDate(policy?.end_date),
    prima_anterior:   String(policy?.premium ?? ''),
    ejecutivo:        ejecutivoName,
    fecha_hoy:        new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
    ramo:             BRANCH_LABELS[policy?.branch ?? ''] ?? '',
    cuenta:           account?.name ?? '',
    inicio_vigencia:  formatDate(policy?.start_date),
    dias_vencimiento: calcDaysUntil(policy?.end_date),
    telefono_cliente: clientPhone ?? '',
    email_cliente:    clientEmail ?? '',
  }

  // WhatsApp — renderizar plantilla y construir wa.me href
  const waTemplate = stage?.whatsapp_template_id
    ? templates.find(t => t.id === stage.whatsapp_template_id)
    : null
  const waBody = waTemplate?.body_whatsapp
    ? renderRenewalTemplate(waTemplate.body_whatsapp, baseVars as RenewalVars)
    : null
  const hasWA  = !!(stage?.send_whatsapp && clientPhone)
  const waHref = hasWA ? buildWaHref(clientPhone!, waBody) : null

  function handleOpenComposer() {
    // Gather all account contacts with emails; prefer tomador first
    const allContacts = account?.contacts?.filter(c => !!c.email) ?? []
    const primaryEmail = clientEmail ?? allContacts[0]?.email ?? null

    onOpenComposer({
      renewalId:            renewal.id,
      accountName:          account?.name ?? '—',
      stageEmailTemplateId: stage?.email_template_id,
      toEmail:              primaryEmail,
      agentEmail:           agentEmail,
      vars:                 baseVars,
      accountContacts:      allContacts as { id: string; full_name: string; email: string }[],
    })
  }

  return (
    <div className={cn(
      'bg-white rounded-xl border shadow-sm p-3 hover:shadow-md transition-shadow',
      isSelected && 'border-indigo-400 bg-indigo-50/20',
    )}>
      {/* Checkbox + Client + expiry */}
      <div className="flex items-start gap-1.5 mb-1">
        {onBulkSelect && (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 mt-0.5 rounded border-gray-300 text-indigo-600 shrink-0 cursor-pointer"
            checked={isSelected ?? false}
            onChange={() => onBulkSelect(renewal.id)}
          />
        )}
        <div className="flex-1 min-w-0 flex items-start justify-between gap-1">
          <Link
            href={`/renovaciones/${renewal.id}`}
            className="text-xs font-semibold text-gray-900 leading-tight hover:text-blue-600 truncate"
          >
            {account?.name ?? '—'}
          </Link>
          <ExpiryBadge endDate={policy?.end_date ?? null} />
        </div>
      </div>

      {/* Policy info */}
      <p className="text-[11px] text-gray-500 mb-0.5">
        {BRANCH_LABEL[(policy?.branch ?? 'otro') as PolicyBranch]} · {policy?.insurer ?? '—'}
      </p>
      {policy?.policy_number && (
        <p className="text-[10px] text-gray-400 font-mono mb-0.5">{policy.policy_number}</p>
      )}
      {policy?.premium && (
        <p className="text-[11px] text-gray-500 font-medium mb-1">{formatCurrency(policy.premium)}</p>
      )}
      {policy?.end_date && (
        <p className="text-[10px] text-gray-400 mb-1">Vence: {formatDateShort(policy.end_date)}</p>
      )}

      {/* Call attempts */}
      {renewal.call_attempts > 0 && (
        <p className="text-[10px] text-gray-400 mb-1.5 flex items-center gap-1">
          <Phone className="h-2.5 w-2.5" />
          {renewal.call_attempts} llamada{renewal.call_attempts !== 1 ? 's' : ''}
        </p>
      )}

      {/* Confirmed */}
      {renewal.client_confirmed_at && (
        <p className="text-[10px] text-green-600 mb-1.5 flex items-center gap-1">
          <CheckCircle2 className="h-2.5 w-2.5" /> Confirmado
        </p>
      )}

      {/* Next stage hint */}
      {nextStage && (
        <p className="text-[10px] text-gray-400 mb-1.5">
          Sig.: {nextStage.name}
        </p>
      )}

      {/* Actions — 2×2 grid cuando el stage tiene email+WA, fila de 3 si solo email */}
      <div className={cn(
        'pt-1.5 border-t border-gray-100 mt-1',
        hasWA ? 'grid grid-cols-2 gap-1' : 'flex items-center gap-1',
      )}>
        {/* Enviar correo */}
        <button
          onClick={handleOpenComposer}
          title={stage?.send_email ? `Plantilla: ${stage.name}` : 'Enviar correo'}
          className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <Mail className="h-3 w-3" />
          Correo
        </button>

        {/* WhatsApp — solo si stage.send_whatsapp y hay teléfono */}
        {hasWA && (
          <a
            href={waHref!}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir WhatsApp con plantilla"
            className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            WA
          </a>
        )}

        {/* Registrar llamada */}
        <button
          onClick={() => onLogCall(renewal.id)}
          disabled={loggingCall}
          title="Registrar llamada"
          className={cn(
            'flex items-center justify-center gap-0.5 py-1.5 rounded-lg text-[11px] bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors',
            !hasWA && 'px-2',
          )}
        >
          {loggingCall
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Phone className="h-3 w-3" />
          }
          <span>+1</span>
        </button>

        {/* Ver detalle */}
        <Link
          href={`/renovaciones/${renewal.id}`}
          className={cn(
            'flex items-center justify-center py-1.5 rounded-lg text-[11px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors',
            !hasWA && 'px-2',
          )}
        >
          Ver →
        </Link>
      </div>

      {/* Terminar renovación */}
      <button
        onClick={() => onCloseRenewal(renewal.id, account?.name ?? '—')}
        className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-900 hover:bg-blue-800 text-white transition-colors"
      >
        <Flag className="h-3 w-3" />
        Terminar renovación
      </button>
    </div>
  )
}

// ── CloseRenewalDialog ─────────────────────────────────────────

type CloseStatus = 'changes_requested' | 'cancelled' | 'renewed_pending_payment' | 'renewed_paid'

const CLOSE_OPTIONS: Array<{ status: CloseStatus; label: string; className: string }> = [
  { status: 'changes_requested',       label: 'Pidió cambios',         className: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100' },
  { status: 'cancelled',               label: 'Cliente canceló',       className: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' },
  { status: 'renewed_pending_payment', label: 'Renovada · pend. pago', className: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' },
  { status: 'renewed_paid',            label: 'Renovada y pagada',     className: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' },
]

function CloseRenewalDialog({
  target,
  onClose,
  onDone,
}: {
  target:  { id: string; accountName: string } | null
  onClose: () => void
  onDone:  (renewalId: string) => void
}) {
  const [picked,     setPicked]     = useState<CloseStatus | null>(null)
  const [notes,      setNotes]      = useState('')
  const [insurer,    setInsurer]    = useState('')
  const [changeType, setChangeType] = useState('')
  const [dueDate,    setDueDate]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Reset when a new target opens
  useEffect(() => {
    if (target) {
      setPicked(null); setNotes(''); setInsurer(''); setChangeType(''); setDueDate(''); setError(null); setSaving(false)
    }
  }, [target?.id])

  async function handleConfirm() {
    if (!target || !picked) return
    setSaving(true)
    setError(null)
    try {
      await closeRenewal(target.id, {
        status: picked,
        notes:  notes.trim() || undefined,
        ...(picked === 'changes_requested' && insurer.trim()
          ? { task: { insurer: insurer.trim(), change_type: changeType.trim(), due_date: dueDate } }
          : {}
        ),
      })
      onDone(target.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const pickedOption = CLOSE_OPTIONS.find(o => o.status === picked)

  return (
    <Dialog open={!!target} onOpenChange={v => { if (!v && !saving) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Flag className="h-4 w-4 text-blue-900 shrink-0" />
            Terminar renovación
            {target && <span className="text-gray-400 font-normal text-xs truncate">— {target.accountName}</span>}
          </DialogTitle>
        </DialogHeader>

        {!picked ? (
          /* Step 1: Pick status */
          <div className="grid grid-cols-2 gap-2 py-2">
            {CLOSE_OPTIONS.map(opt => (
              <button
                key={opt.status}
                onClick={() => setPicked(opt.status)}
                className={cn('border rounded-xl px-3 py-3 text-xs font-semibold text-left transition-colors leading-snug', opt.className)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          /* Step 2: Confirm + optional fields */
          <div className="space-y-3 py-2">
            {/* Status chip + change */}
            <div className="flex items-center gap-2">
              <span className={cn('text-xs font-semibold px-3 py-1 rounded-full border', pickedOption?.className ?? '')}>
                {pickedOption?.label}
              </span>
              <button className="text-xs text-gray-400 hover:text-gray-600 underline-offset-2 hover:underline" onClick={() => setPicked(null)} disabled={saving}>
                cambiar
              </button>
            </div>

            {/* Task fields — only for changes_requested */}
            {picked === 'changes_requested' && (
              <div className="space-y-2 border rounded-lg p-3 bg-amber-50/50">
                <p className="text-[11px] font-medium text-amber-700">Tarea de seguimiento (opcional)</p>
                <input
                  placeholder="Aseguradora"
                  value={insurer}
                  onChange={e => setInsurer(e.target.value)}
                  className="w-full text-xs border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white"
                />
                <input
                  placeholder="Tipo de cambio solicitado"
                  value={changeType}
                  onChange={e => setChangeType(e.target.value)}
                  className="w-full text-xs border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white"
                />
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full text-xs border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas (opcional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Comentarios adicionales…"
                className="w-full text-xs border rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>
            )}
          </div>
        )}

        {picked && (
          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-blue-900 hover:bg-blue-800 text-white gap-1.5"
              disabled={saving}
              onClick={handleConfirm}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />}
              Confirmar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── CompletadasSection ─────────────────────────────────────────

function CompletadasSection({ completed }: { completed: RenewalRow[] }) {
  const [open, setOpen] = useState(false)

  const renovadas = completed.filter(
    r => r.status === 'renewed_paid' || r.status === 'renewed_pending_payment'
  )

  return (
    <div className="rounded-xl border bg-gray-50/50 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="font-medium text-gray-700">Completadas</span>
          <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 leading-none">{completed.length}</span>
          {renovadas.length > 0 && (
            <span className="text-xs text-green-600">{renovadas.length} renovadas</span>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="divide-y max-h-72 overflow-y-auto border-t">
          {completed.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Sin renovaciones completadas</p>
          )}
          {completed.map(r => {
            const policy  = getPolicy(r)
            const account = getAccount(r)
            return (
              <Link
                key={r.id}
                href={`/renovaciones/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{account?.name ?? '—'}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {BRANCH_LABEL[(policy?.branch ?? 'otro') as PolicyBranch]} · {policy?.insurer ?? '—'}
                    {policy?.policy_number ? ` · ${policy.policy_number}` : ''}
                  </p>
                </div>
                <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', STATUS_CLASS[r.status])}>
                  {STATUS_LABEL[r.status]}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── RenewalKanban (main) ───────────────────────────────────────

export function RenewalKanban({
  candidates,
  inProgress,
  completed,
  stages,
  templates,
  currentUserEmail,
}: RenewalKanbanProps) {
  const [localCandidates, setLocalCandidates] = useState(candidates)
  const [localInProgress, setLocalInProgress] = useState(inProgress)
  const [starting,        setStarting]        = useState<string | null>(null)
  const [loggingCall,     setLoggingCall]     = useState<string | null>(null)
  // Candidate bulk selection (policy IDs)
  const [selected,        setSelected]        = useState<string[]>([])
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [isBulkStarting,  setIsBulkStarting]  = useState(false)
  // In-progress renewal bulk selection (renewal IDs)
  const [selectedRenewals,     setSelectedRenewals]     = useState<string[]>([])
  const [bulkCallLoading,      setBulkCallLoading]      = useState(false)
  const [showBulkCloseConfirm, setShowBulkCloseConfirm] = useState(false)
  const [bulkClosePicked,      setBulkClosePicked]      = useState<CloseStatus | null>(null)
  const [bulkCloseLoading,     setBulkCloseLoading]     = useState(false)
  const [composer,        setComposer]        = useState<ComposerTarget | null>(null)
  const [closingTarget,   setClosingTarget]   = useState<{ id: string; accountName: string } | null>(null)
  const [, startTransition]                   = useTransition()

  // Sync on period/filter change
  useEffect(() => { setLocalCandidates(candidates); setSelected([]) }, [candidates])
  useEffect(() => { setLocalInProgress(inProgress) },                   [inProgress])

  // Sort candidates by end_date ASC (most urgent first)
  const sortedCandidates = [...localCandidates].sort((a, b) =>
    (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999')
  )

  // ── Actions ──────────────────────────────────────────────────

  function handleStart(policyId: string) {
    setStarting(policyId)
    startTransition(async () => {
      try {
        await startRenewal(policyId)
      } catch (e) {
        alert((e as Error).message)
      } finally {
        setStarting(null)
      }
    })
  }

  async function handleBulkStart() {
    setIsBulkStarting(true)
    try {
      await startBulkRenewals(selected)
      setSelected([])
      setShowBulkConfirm(false)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setIsBulkStarting(false)
    }
  }

  function handleLogCall(renewalId: string) {
    setLoggingCall(renewalId)
    // Optimistic update
    setLocalInProgress(prev =>
      prev.map(r => r.id === renewalId
        ? { ...r, call_attempts: (r.call_attempts ?? 0) + 1 }
        : r
      )
    )
    startTransition(async () => {
      try {
        await logCallAttempt(renewalId, '')
      } catch {
        // Revert
        setLocalInProgress(prev =>
          prev.map(r => r.id === renewalId
            ? { ...r, call_attempts: Math.max((r.call_attempts ?? 1) - 1, 0) }
            : r
          )
        )
      } finally {
        setLoggingCall(null)
      }
    })
  }

  function handleSent(renewalId: string) {
    // Optimistic: advance current_stage_id to next stage
    setLocalInProgress(prev =>
      prev.map(r => {
        if (r.id !== renewalId) return r
        const currentIdx = stages.findIndex(s => s.id === r.current_stage_id)
        const nextStageId = currentIdx >= 0 ? (stages[currentIdx + 1]?.id ?? null) : null
        return { ...r, current_stage_id: nextStageId }
      })
    )
  }

  function handleCloseDone(renewalId: string) {
    // Optimistic: remove from inProgress (it's now a completed renewal)
    setLocalInProgress(prev => prev.filter(r => r.id !== renewalId))
    setClosingTarget(null)
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectRenewal(id: string) {
    setSelectedRenewals(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAllInStage(stageId: string) {
    const stageIds = localInProgress.filter(r => r.current_stage_id === stageId).map(r => r.id)
    const allIn = stageIds.every(id => selectedRenewals.includes(id))
    if (allIn) {
      setSelectedRenewals(prev => prev.filter(id => !stageIds.includes(id)))
    } else {
      setSelectedRenewals(prev => [...new Set([...prev, ...stageIds])])
    }
  }

  function clearBulkRenewals() {
    setSelectedRenewals([])
    setBulkClosePicked(null)
    setShowBulkCloseConfirm(false)
  }

  // Bulk +1 Llamada for selected renewals
  async function handleBulkLogCall() {
    if (selectedRenewals.length === 0) return
    setBulkCallLoading(true)
    // Optimistic update
    setLocalInProgress(prev =>
      prev.map(r => selectedRenewals.includes(r.id)
        ? { ...r, call_attempts: (r.call_attempts ?? 0) + 1 }
        : r
      )
    )
    try {
      for (const id of selectedRenewals) {
        await logCallAttempt(id, '')
      }
    } catch { /* non-critical */ }
    setBulkCallLoading(false)
  }

  // Bulk close renewals with a single picked status
  async function handleBulkClose() {
    if (!bulkClosePicked || selectedRenewals.length === 0) return
    setBulkCloseLoading(true)
    try {
      for (const id of selectedRenewals) {
        await closeRenewal(id, { status: bulkClosePicked })
      }
      // Optimistic: remove closed from inProgress
      setLocalInProgress(prev => prev.filter(r => !selectedRenewals.includes(r.id)))
      clearBulkRenewals()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBulkCloseLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Bulk action bar — candidates */}
      {selected.length > 0 && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-emerald-700 font-medium">
            {selected.length} póliza{selected.length !== 1 ? 's' : ''} por iniciar
          </span>
          <Button
            size="sm"
            className="ml-auto gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => selected.length === 1 ? handleStart(selected[0]) : setShowBulkConfirm(true)}
            disabled={starting !== null || isBulkStarting}
          >
            <Play className="h-3 w-3" />
            Iniciar {selected.length}
          </Button>
          <button className="text-xs text-emerald-600 hover:text-emerald-800" onClick={() => setSelected([])}>
            Cancelar
          </button>
        </div>
      )}

      {/* Bulk action bar — in-progress renewals */}
      {selectedRenewals.length > 0 && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-indigo-700 font-medium">
            {selectedRenewals.length} renovación{selectedRenewals.length !== 1 ? 'es' : ''} seleccionada{selectedRenewals.length !== 1 ? 's' : ''}
          </span>
          {/* +1 Llamada */}
          <Button
            size="sm"
            className="ml-auto gap-1.5 bg-gray-700 hover:bg-gray-800 text-white text-xs"
            onClick={handleBulkLogCall}
            disabled={bulkCallLoading}
          >
            {bulkCallLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />}
            +1 Llamada ({selectedRenewals.length})
          </Button>
          {/* Terminar masivo */}
          <Button
            size="sm"
            className="gap-1.5 bg-blue-900 hover:bg-blue-800 text-white text-xs"
            onClick={() => setShowBulkCloseConfirm(true)}
          >
            <Flag className="h-3 w-3" />
            Terminar ({selectedRenewals.length})
          </Button>
          <button className="text-xs text-indigo-500 hover:text-indigo-700" onClick={clearBulkRenewals}>
            Cancelar
          </button>
        </div>
      )}

      {/* Kanban — scroll horizontal */}
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: '400px' }}>
        {/* Columna: Por iniciar */}
        <KanbanColumn
          header="Por iniciar"
          count={sortedCandidates.length}
          headerColor="bg-blue-50 border-blue-100"
          onSelectAll={() => {
            const ids = sortedCandidates.map(c => c.id)
            const allIn = ids.every(id => selected.includes(id))
            if (allIn) setSelected(prev => prev.filter(id => !ids.includes(id)))
            else setSelected(prev => [...new Set([...prev, ...ids])])
          }}
          allSelected={sortedCandidates.length > 0 && sortedCandidates.every(c => selected.includes(c.id))}
          someSelected={sortedCandidates.some(c => selected.includes(c.id)) && !sortedCandidates.every(c => selected.includes(c.id))}
        >
          {sortedCandidates.map(c => (
            <CandidateCard
              key={c.id}
              candidate={c}
              onStart={handleStart}
              onBulkSelect={toggleSelect}
              isSelected={selected.includes(c.id)}
              starting={starting === c.id || isBulkStarting}
            />
          ))}
        </KanbanColumn>

        {/* Columnas por stage */}
        {stages.map((stage, idx) => {
          const cards = localInProgress
            .filter(r => r.current_stage_id === stage.id)
            .sort((a, b) => {
              const ad = getPolicy(a)?.end_date ?? '9999'
              const bd = getPolicy(b)?.end_date ?? '9999'
              return ad.localeCompare(bd)
            })

          const cardIds     = cards.map(r => r.id)
          const allSel      = cardIds.length > 0 && cardIds.every(id => selectedRenewals.includes(id))
          const someSel     = cardIds.some(id => selectedRenewals.includes(id)) && !allSel

          // Color intensity increases toward last stages (more urgent)
          const isLate = idx >= stages.length - 2
          const headerColor = isLate
            ? 'bg-orange-50 border-orange-100'
            : 'bg-indigo-50 border-indigo-100'

          return (
            <KanbanColumn
              key={stage.id}
              header={stage.name}
              count={cards.length}
              headerColor={headerColor}
              onSelectAll={() => toggleSelectAllInStage(stage.id)}
              allSelected={allSel}
              someSelected={someSel}
            >
              {cards.map(r => (
                <RenewalCard
                  key={r.id}
                  renewal={r}
                  stages={stages}
                  templates={templates}
                  agentEmail={currentUserEmail}
                  onLogCall={handleLogCall}
                  onOpenComposer={setComposer}
                  onCloseRenewal={(id, name) => setClosingTarget({ id, accountName: name })}
                  onBulkSelect={toggleSelectRenewal}
                  isSelected={selectedRenewals.includes(r.id)}
                  loggingCall={loggingCall === r.id}
                />
              ))}
            </KanbanColumn>
          )
        })}
      </div>

      {/* Completadas — colapsable */}
      <CompletadasSection completed={completed} />

      {/* Bulk confirm dialog */}
      <Dialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar {selected.length} renovaciones</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 space-y-3">
            <p>¿Confirmas que deseas iniciar la renovación para estas pólizas?</p>
            <ul className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50">
              {candidates
                .filter(c => selected.includes(c.id))
                .map(c => {
                  const account = getCandidateAccount(c)
                  return (
                    <li key={c.id} className="text-xs text-gray-700 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-medium">{account?.name ?? '—'}</span>
                      {c.policy_number && <span className="text-gray-400">· {c.policy_number}</span>}
                      {c.end_date && (
                        <span className="ml-auto text-gray-400">{formatDateShort(c.end_date)}</span>
                      )}
                    </li>
                  )
                })}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkConfirm(false)} disabled={isBulkStarting}>
              Cancelar
            </Button>
            <Button
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={isBulkStarting}
              onClick={handleBulkStart}
            >
              {isBulkStarting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Play className="h-3.5 w-3.5" />
              }
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email composer */}
      {composer && (
        <RenewalEmailComposer
          open={!!composer}
          onClose={() => setComposer(null)}
          onSent={handleSent}
          renewalId={composer.renewalId}
          accountName={composer.accountName}
          stageEmailTemplateId={composer.stageEmailTemplateId}
          toEmail={composer.toEmail}
          agentEmail={composer.agentEmail}
          templates={templates}
          vars={composer.vars}
          accountContacts={composer.accountContacts}
        />
      )}

      {/* Close renewal dialog */}
      <CloseRenewalDialog
        target={closingTarget}
        onClose={() => setClosingTarget(null)}
        onDone={handleCloseDone}
      />

      {/* Bulk close dialog — double confirmation */}
      <Dialog open={showBulkCloseConfirm} onOpenChange={v => { if (!v && !bulkCloseLoading) setShowBulkCloseConfirm(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Flag className="h-4 w-4 text-blue-900" />
              Terminar {selectedRenewals.length} renovación{selectedRenewals.length !== 1 ? 'es' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {!bulkClosePicked ? (
              <div className="grid grid-cols-2 gap-2">
                {CLOSE_OPTIONS.map(opt => (
                  <button
                    key={opt.status}
                    onClick={() => setBulkClosePicked(opt.status)}
                    className={cn('border rounded-xl px-3 py-3 text-xs font-semibold text-left transition-colors leading-snug', opt.className)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-semibold px-3 py-1 rounded-full border',
                    CLOSE_OPTIONS.find(o => o.status === bulkClosePicked)?.className ?? '')}>
                    {CLOSE_OPTIONS.find(o => o.status === bulkClosePicked)?.label}
                  </span>
                  <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setBulkClosePicked(null)} disabled={bulkCloseLoading}>
                    cambiar
                  </button>
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
                  <Flag className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Se cerrará{selectedRenewals.length !== 1 ? 'n' : ''} {selectedRenewals.length} renovación{selectedRenewals.length !== 1 ? 'es' : ''}. Esta acción no se puede deshacer.
                </p>
              </div>
            )}
          </div>
          {bulkClosePicked && (
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowBulkCloseConfirm(false)} disabled={bulkCloseLoading}>Cancelar</Button>
              <Button
                size="sm"
                className="bg-blue-900 hover:bg-blue-800 text-white gap-1.5"
                disabled={bulkCloseLoading}
                onClick={handleBulkClose}
              >
                {bulkCloseLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flag className="h-3 w-3" />}
                Confirmar
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
