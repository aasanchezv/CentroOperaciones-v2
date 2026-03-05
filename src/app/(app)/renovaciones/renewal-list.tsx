'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { startRenewal }  from '@/app/actions/renewal-actions'
import { Badge }    from '@/components/ui/badge'
import { Button }   from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  RefreshCw, AlertTriangle, CheckCircle2, Clock, PhoneCall,
  ChevronRight, Play, Mail, Search, Loader2,
} from 'lucide-react'
import type { PolicyBranch, RenewalStatus } from '@/types/database.types'
import { RenewalEmailComposer } from './renewal-email-composer'
import type { RenewalVars }    from '@/lib/collection-vars'

// ─── Types ────────────────────────────────────────────────────

interface Stage { id: string; name: string; sort_order: number }

interface Template {
  id:            string
  name:          string
  subject_email: string | null
  body_email:    string | null
}

interface RenewalRow {
  id: string
  status: RenewalStatus
  client_confirmed_at: string | null
  call_attempts: number
  updated_at: string
  policy: {
    id: string; policy_number: string | null; insurer: string; branch: PolicyBranch
    end_date: string | null; premium: number | null
    tomador: { full_name: string; email: string | null } | null
  } | null
  account: {
    id: string; name: string; account_code: string
    contacts?: { id: string; full_name: string; email: string | null }[] | null
  } | null
  assigned_profile: { id: string; full_name: string | null; email: string } | null
  stage: { id: string; name: string; sort_order: number; email_template_id: string | null } | null
}

interface CandidateRow {
  id: string
  policy_number: string | null
  insurer: string
  branch: PolicyBranch
  end_date: string | null
  account_id: string
  account: { id: string; name: string; account_code: string } | null
  tomador: { full_name: string } | null
}

export interface RenewalListProps {
  renewals:          RenewalRow[]
  candidates:        CandidateRow[]
  stages:            Stage[]
  currentUserId:     string
  currentUserEmail?: string | null
  templates:         Template[]
  filterDate?:       string | null
}

// ─── Helpers ──────────────────────────────────────────────────

const branchLabel: Record<PolicyBranch, string> = {
  gmm: 'GMM', vida: 'Vida', auto: 'Autos', rc: 'RC',
  danos: 'Daños', transporte: 'Transp.', fianzas: 'Fianzas',
  ap: 'AP', tecnicos: 'Técnicos', otro: 'Otro',
}

const statusLabel: Record<RenewalStatus, string> = {
  in_progress:             'En proceso',
  changes_requested:       'Cambios solicitados',
  cancelled:               'Cancelada',
  renewed_pending_payment: 'Pendiente de pago',
  renewed_paid:            'Renovada ✓',
}

const statusClass: Record<RenewalStatus, string> = {
  in_progress:             'bg-blue-50 text-blue-700 border-blue-200',
  changes_requested:       'bg-amber-50 text-amber-700 border-amber-200',
  cancelled:               'bg-red-50 text-red-600 border-red-200',
  renewed_pending_payment: 'bg-orange-50 text-orange-700 border-orange-200',
  renewed_paid:            'bg-green-50 text-green-700 border-green-200',
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDateFull(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function ExpiryBadge({ endDate }: { endDate: string | null }) {
  const days = daysUntil(endDate)
  if (days === null) return <span className="text-gray-400 text-xs">—</span>
  if (days < 0)   return <span className="text-xs font-medium text-red-600">Vencida hace {Math.abs(days)}d</span>
  if (days <= 5)  return <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{days}d restantes</span>
  if (days <= 15) return <span className="text-xs font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{days}d restantes</span>
  if (days <= 30) return <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{days}d restantes</span>
  return <span className="text-xs text-gray-500">{days}d restantes</span>
}

// ─── Composer state ────────────────────────────────────────────

interface ComposerTarget {
  renewalId:            string
  accountName:          string
  stageEmailTemplateId: string | null | undefined
  toEmail:              string | null
  agentEmail:           string | null | undefined
  accountContacts:      { id: string; full_name: string; email: string }[]
  vars:                 Partial<RenewalVars>
}

// ─── Component ────────────────────────────────────────────────

const TABS = ['Por iniciar', 'En proceso', 'Completadas'] as const
type Tab = typeof TABS[number]

export function RenewalList({ renewals, candidates, stages, currentUserId, currentUserEmail, templates, filterDate }: RenewalListProps) {
  const [tab,              setTab]             = useState<Tab>('Por iniciar')
  const [, startTransition]                    = useTransition()
  const [starting,         setStarting]        = useState<string | null>(null)
  const [composer,         setComposer]        = useState<ComposerTarget | null>(null)
  const [query,            setQuery]           = useState('')
  const [selected,         setSelected]        = useState<string[]>([])
  const [showBulkConfirm,  setShowBulkConfirm] = useState(false)
  const [isBulkStarting,   setIsBulkStarting]  = useState(false)

  const inProgress = renewals.filter(r => r.status === 'in_progress')
  const completed  = renewals.filter(r => r.status !== 'in_progress')
  const q          = query.trim().toLowerCase()

  // ─── Filtered lists ──────────────────────────────────────────

  const visibleCandidates = (() => {
    let list = filterDate
      ? candidates.filter(p => p.end_date === filterDate)
      : candidates
    if (q) list = list.filter(p => {
      const account = Array.isArray(p.account) ? p.account[0] : p.account
      const name    = (account?.name ?? '').toLowerCase()
      const pol     = (p.policy_number ?? '').toLowerCase()
      return name.includes(q) || pol.includes(q)
    })
    return list
  })()

  const visibleInProgress = (() => {
    let list = filterDate
      ? inProgress.filter(r => {
          const pol = Array.isArray(r.policy) ? r.policy[0] : r.policy
          return (pol as { end_date: string | null } | null)?.end_date === filterDate
        })
      : inProgress
    if (q) list = list.filter(r => {
      const account = Array.isArray(r.account) ? r.account[0] : r.account
      const policy  = Array.isArray(r.policy)  ? r.policy[0]  : r.policy
      const name    = (account?.name ?? '').toLowerCase()
      const pol     = ((policy as { policy_number: string | null } | null)?.policy_number ?? '').toLowerCase()
      return name.includes(q) || pol.includes(q)
    })
    return list
  })()

  // ─── Actions ─────────────────────────────────────────────────

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
      await Promise.all(selected.map(id => startRenewal(id)))
      setSelected([])
      setShowBulkConfirm(false)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setIsBulkStarting(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function openComposer(r: RenewalRow) {
    const policy  = Array.isArray(r.policy)  ? r.policy[0]  : r.policy
    const account = Array.isArray(r.account) ? r.account[0] : r.account
    const stage   = Array.isArray(r.stage)   ? r.stage[0]   : r.stage
    const tomador = policy ? (Array.isArray(policy.tomador) ? policy.tomador[0] : policy.tomador) : null

    // Gather contacts with emails; prefer tomador first
    const allContacts = ((account?.contacts ?? []) as { id: string; full_name: string; email: string | null }[])
      .filter(c => !!c.email)
      .map(c => ({ id: c.id, full_name: c.full_name, email: c.email! }))
    const primaryEmail = tomador?.email ?? allContacts[0]?.email ?? null

    setComposer({
      renewalId:            r.id,
      accountName:          account?.name ?? '—',
      stageEmailTemplateId: stage?.email_template_id,
      toEmail:              primaryEmail,
      agentEmail:           currentUserEmail ?? null,
      accountContacts:      allContacts,
      vars: {
        nombre:          tomador?.full_name ?? account?.name ?? '',
        aseguradora:     policy?.insurer    ?? '',
        numero_poliza:   policy?.policy_number ?? '',
        vencimiento:     policy?.end_date ?? '',
        prima_anterior:  String(policy?.premium ?? ''),
        ejecutivo:       r.assigned_profile
          ? (Array.isArray(r.assigned_profile) ? r.assigned_profile[0]?.full_name : r.assigned_profile?.full_name) ?? ''
          : '',
        fecha_hoy: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
      },
    })
  }

  return (
    <>
      <div>
        {/* Search bar */}
        <div className="px-6 pt-4 pb-2">
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
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-2 border-b">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelected([]) }}
              className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
              <span className="ml-1.5 text-xs rounded-full px-1.5 py-0.5 bg-gray-100 text-gray-500">
                {t === 'Por iniciar'
                  ? visibleCandidates.length
                  : t === 'En proceso'
                    ? visibleInProgress.length
                    : completed.length
                }
              </span>
            </button>
          ))}
        </div>

        {/* ─── Por iniciar ─────────────────────────────── */}
        {tab === 'Por iniciar' && (
          <div>
            {/* Bulk action bar */}
            {selected.length > 0 && (
              <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center gap-3">
                <span className="text-xs text-emerald-700 font-medium">
                  {selected.length} póliza{selected.length !== 1 ? 's' : ''} seleccionada{selected.length !== 1 ? 's' : ''}
                </span>
                <Button
                  size="sm"
                  className="ml-auto gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    if (selected.length === 1) {
                      handleStart(selected[0])
                      setSelected([])
                    } else {
                      setShowBulkConfirm(true)
                    }
                  }}
                  disabled={starting !== null || isBulkStarting}
                >
                  <Play className="h-3 w-3" />
                  Iniciar {selected.length} seleccionada{selected.length !== 1 ? 's' : ''}
                </Button>
                <button
                  className="text-xs text-emerald-600 hover:text-emerald-800"
                  onClick={() => setSelected([])}
                >
                  Cancelar
                </button>
              </div>
            )}

            <div className="divide-y">
              {visibleCandidates.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-12">
                  {q || filterDate ? 'Sin resultados para este filtro' : 'No hay pólizas próximas a vencer'}
                </p>
              )}
              {visibleCandidates.map(p => {
                const account  = Array.isArray(p.account) ? p.account[0] : p.account
                const tomador  = Array.isArray(p.tomador) ? p.tomador[0] : p.tomador
                const isChecked = selected.includes(p.id)

                return (
                  <div key={p.id} className={`flex items-center gap-4 px-6 py-4 transition-colors ${isChecked ? 'bg-emerald-50/60' : 'hover:bg-gray-50'}`}>
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0 cursor-pointer"
                      checked={isChecked}
                      onChange={() => toggleSelect(p.id)}
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{account?.name ?? '—'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {branchLabel[p.branch]} · {p.insurer}
                        {p.policy_number ? ` · ${p.policy_number}` : ''}
                      </p>
                      {tomador && <p className="text-xs text-gray-400 mt-0.5">Tomador: {tomador.full_name}</p>}
                    </div>

                    {/* Expiry — date + badge */}
                    <div className="text-right shrink-0">
                      {p.end_date && (
                        <p className="text-sm font-semibold text-gray-900">{formatDateFull(p.end_date)}</p>
                      )}
                      <ExpiryBadge endDate={p.end_date} />
                    </div>

                    {/* Iniciar button */}
                    <Button
                      size="sm"
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                      disabled={starting === p.id || isBulkStarting}
                      onClick={() => handleStart(p.id)}
                    >
                      {starting === p.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Play className="h-3 w-3" />
                      }
                      {starting === p.id ? 'Iniciando…' : 'Iniciar renovación'}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── En proceso ──────────────────────────────── */}
        {tab === 'En proceso' && (
          <div className="divide-y">
            {visibleInProgress.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">
                {q || filterDate ? 'Sin resultados para este filtro' : 'No hay renovaciones en proceso'}
              </p>
            )}
            {visibleInProgress.map(r => {
              const policy  = Array.isArray(r.policy)  ? r.policy[0]  : r.policy
              const account = Array.isArray(r.account) ? r.account[0] : r.account
              const stage   = Array.isArray(r.stage)   ? r.stage[0]   : r.stage
              const tomador = policy ? (Array.isArray(policy.tomador) ? policy.tomador[0] : policy.tomador) : null

              return (
                <div key={r.id} className="flex items-center gap-3 px-6 py-4 hover:bg-gray-50 transition-colors group">
                  {/* Link area (clickable) */}
                  <Link
                    href={`/renovaciones/${r.id}`}
                    className="flex flex-1 items-center gap-4 min-w-0"
                  >
                    {/* Cliente + póliza */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{account?.name ?? '—'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {branchLabel[(policy?.branch ?? 'otro') as PolicyBranch]} · {policy?.insurer ?? '—'}
                        {policy?.policy_number ? ` · ${policy.policy_number}` : ''}
                      </p>
                      {tomador && <p className="text-xs text-gray-400 mt-0.5">Tomador: {tomador.full_name}</p>}
                    </div>

                    {/* Vencimiento */}
                    <div className="w-16 text-right shrink-0">
                      <ExpiryBadge endDate={policy?.end_date ?? null} />
                    </div>

                    {/* Stage actual */}
                    <div className="w-36 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <StageIcon stage={stage} stageCount={stages.length} />
                        <span className="text-xs text-gray-600 truncate">{stage?.name ?? '—'}</span>
                      </div>
                      {r.client_confirmed_at && (
                        <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Confirmado
                        </p>
                      )}
                    </div>

                    {/* Status */}
                    <Badge variant="outline" className={`text-xs shrink-0 ${statusClass[r.status]}`}>
                      {statusLabel[r.status]}
                    </Badge>

                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
                  </Link>

                  {/* Email button (outside Link) */}
                  <button
                    onClick={() => openComposer(r)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors shrink-0"
                    title="Enviar correo"
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ─── Completadas ─────────────────────────────── */}
        {tab === 'Completadas' && (
          <div className="divide-y">
            {completed.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-12">Sin renovaciones completadas</p>
            )}
            {completed.map(r => {
              const policy  = Array.isArray(r.policy)  ? r.policy[0]  : r.policy
              const account = Array.isArray(r.account) ? r.account[0] : r.account

              return (
                <Link
                  key={r.id}
                  href={`/renovaciones/${r.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{account?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {branchLabel[(policy?.branch ?? 'otro') as PolicyBranch]} · {policy?.insurer ?? '—'}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${statusClass[r.status]}`}>
                    {statusLabel[r.status]}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500" />
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Bulk confirmation dialog ─────────────────────────── */}
      <Dialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar {selected.length} renovaciones</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 space-y-3">
            <p>¿Confirmas que deseas iniciar la renovación para estas pólizas?</p>
            <ul className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50">
              {candidates
                .filter(p => selected.includes(p.id))
                .map(p => {
                  const account = Array.isArray(p.account) ? p.account[0] : p.account
                  return (
                    <li key={p.id} className="text-xs text-gray-700 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-medium">{account?.name ?? '—'}</span>
                      {p.policy_number && <span className="text-gray-400">· {p.policy_number}</span>}
                      {p.end_date && (
                        <span className="ml-auto text-gray-400">{formatDateFull(p.end_date)}</span>
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

      {/* Email Composer Sheet */}
      {composer && (
        <RenewalEmailComposer
          open={!!composer}
          onClose={() => setComposer(null)}
          renewalId={composer.renewalId}
          accountName={composer.accountName}
          stageEmailTemplateId={composer.stageEmailTemplateId}
          toEmail={composer.toEmail}
          agentEmail={composer.agentEmail}
          accountContacts={composer.accountContacts}
          templates={templates}
          vars={composer.vars}
        />
      )}
    </>
  )
}

function StageIcon({ stage, stageCount }: { stage: { sort_order: number } | null; stageCount: number }) {
  if (!stage) return <Clock className="h-3.5 w-3.5 text-gray-400" />
  const order = stage.sort_order
  if (order >= stageCount) return <PhoneCall    className="h-3.5 w-3.5 text-red-500"    />
  if (order >= 3)          return <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
  return                          <RefreshCw     className="h-3.5 w-3.5 text-blue-500"  />
}
