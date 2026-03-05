'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Trophy, XCircle, Clock, FileText, ChevronRight, Trash2, Pencil, ArrowRight, Search } from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import {
  createCotizacion,
  updateCotizacion,
  updateCotizacionStage,
  deleteCotizacion,
  convertQuotationToPolicy,
  type CreateCotizacionData,
  type UpdateCotizacionData,
} from '@/app/actions/cotizacion-actions'
import type { QuotationStage } from '@/types/database.types'

// ─── Types ──────────────────────────────────────────────────

interface QuotationRow {
  id:                      string
  stage_id:                string | null
  status:                  string         // legacy fallback
  insurer:                 string | null
  branch:                  string | null
  estimated_premium:       number | null
  notes:                   string | null
  expires_at:              string | null
  delivery_due_at:         string | null
  probable_contractor:     string | null
  requester_is_contractor: boolean
  created_at:              string
  account:                 { id: string; name: string } | null
  contact:                 { id: string; full_name: string } | null
  assignee:                { id: string; full_name: string } | null
  requester:               { id: string; name: string } | null
}

interface AccountOption {
  id:   string
  name: string
}

interface RequesterOption {
  id:   string
  name: string
}

interface CotizacionBoardProps {
  quotations: QuotationRow[]
  accounts:   AccountOption[]
  requesters: RequesterOption[]
  slaHours:   number | null
  canCreate:  boolean
  canManage:  boolean          // solo admin/ops: editar + convertir a póliza
  stages:     QuotationStage[]
}

// ─── Color map ───────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  amber:   'text-amber-600   bg-amber-50   border-amber-200',
  blue:    'text-blue-600    bg-blue-50    border-blue-200',
  emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  red:     'text-red-600     bg-red-50     border-red-200',
  violet:  'text-violet-600  bg-violet-50  border-violet-200',
  orange:  'text-orange-600  bg-orange-50  border-orange-200',
  gray:    'text-gray-600    bg-gray-50    border-gray-200',
}

const BRANCH_OPTIONS = ['gmm', 'autos', 'vida', 'daños', 'rc', 'otro'] as const

function stageColorClass(color: string) {
  return COLOR_MAP[color] ?? COLOR_MAP.gray
}

function stageIcon(stage: QuotationStage) {
  if (stage.is_won)  return <Trophy  className="h-3.5 w-3.5" />
  if (stage.is_lost) return <XCircle className="h-3.5 w-3.5" />
  return <Clock className="h-3.5 w-3.5" />
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '—'
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000)     return `$${Math.round(amount / 1_000)}k`
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount)
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

// ─── Compute transitions ──────────────────────────────────────
// Para una cotización devuelve los stages a los que puede avanzar:
// → siguiente stage en sort_order + todos los stages is_won/is_lost que no sean el actual

function getTransitions(quot: QuotationRow, stages: QuotationStage[]): QuotationStage[] {
  const active = stages.filter(s => s.is_active).sort((a, b) => a.sort_order - b.sort_order)
  const idx    = active.findIndex(s => s.id === quot.stage_id)

  const result: QuotationStage[] = []
  const added = new Set<string>()

  // Siguiente stage
  if (idx >= 0 && idx < active.length - 1) {
    const next = active[idx + 1]
    result.push(next)
    added.add(next.id)
  }

  // Stages is_won / is_lost que no sean el actual ni el ya añadido
  for (const s of active) {
    if (!added.has(s.id) && s.id !== quot.stage_id && (s.is_won || s.is_lost)) {
      result.push(s)
      added.add(s.id)
    }
  }

  return result
}

// ─── Edit Quotation Sheet ────────────────────────────────────

function EditCotizacionSheet({
  quot,
  requesters,
}: {
  quot:       QuotationRow
  requesters: RequesterOption[]
}) {
  const [open, setOpen]                                    = useState(false)
  const [isPending, startTransition]                       = useTransition()
  const [error, setError]                                  = useState<string | null>(null)
  const [requesterIsContractor, setRequesterIsContractor]  = useState(quot.requester_is_contractor)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const data: UpdateCotizacionData = {
      insurer:                  fd.get('insurer')            as string || undefined,
      branch:                   fd.get('branch')             as string || undefined,
      estimated_premium:        fd.get('estimated_premium')
        ? Number(fd.get('estimated_premium')) : null,
      notes:                    fd.get('notes')              as string || undefined,
      expires_at:               fd.get('expires_at')         as string || undefined,
      requested_by_id:          (fd.get('requested_by_id') as string) || null,
      requester_is_contractor:  requesterIsContractor,
      probable_contractor:      requesterIsContractor
        ? undefined : (fd.get('probable_contractor') as string || undefined),
      delivery_due_at:          fd.get('delivery_due_at')   as string || undefined,
    }
    setError(null)
    startTransition(async () => {
      const result = await updateCotizacion(quot.id, data)
      if ('error' in result) {
        setError(result.error)
      } else {
        setOpen(false)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="text-gray-300 hover:text-blue-500 transition-colors shrink-0" title="Editar cotización">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar cotización</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Aseguradora</label>
            <Input name="insurer" defaultValue={quot.insurer ?? ''} placeholder="Ej. Qualitas, GNP" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Ramo</label>
            <select
              name="branch"
              defaultValue={quot.branch ?? ''}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">Seleccionar</option>
              {BRANCH_OPTIONS.map(b => (
                <option key={b} value={b}>{b.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Prima estimada (MXN)</label>
              <Input
                name="estimated_premium"
                type="number"
                min="0"
                step="0.01"
                defaultValue={quot.estimated_premium ?? ''}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Vence el</label>
              <Input name="expires_at" type="date" defaultValue={quot.expires_at?.split('T')[0] ?? ''} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Fecha de entrega</label>
            <Input
              name="delivery_due_at"
              type="datetime-local"
              defaultValue={quot.delivery_due_at ? quot.delivery_due_at.slice(0, 16) : ''}
            />
          </div>

          {requesters.length > 0 && (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Solicitado por</label>
                <select
                  name="requested_by_id"
                  defaultValue={quot.requester?.id ?? ''}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">No especificado</option>
                  {requesters.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setRequesterIsContractor(v => !v)}
                className={[
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs w-full transition-all',
                  requesterIsContractor
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300',
                ].join(' ')}
              >
                <span className="text-base">{requesterIsContractor ? '✓' : '○'}</span>
                <span>El solicitante es el contratante</span>
              </button>
              {!requesterIsContractor && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">Contratante probable</label>
                  <Input
                    name="probable_contractor"
                    defaultValue={quot.probable_contractor ?? ''}
                    placeholder="Nombre del contratante probable"
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Notas</label>
            <Textarea name="notes" defaultValue={quot.notes ?? ''} rows={3} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 gap-2" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── QuotationCard ───────────────────────────────────────────

function QuotationCard({
  quot,
  allStages,
  requesters,
  canManage,
}: {
  quot:       QuotationRow
  allStages:  QuotationStage[]
  requesters: RequesterOption[]
  canManage:  boolean
}) {
  const router                       = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isConverting, startConvert] = useTransition()
  const [showAll, setShowAll]        = useState(false)
  const expired      = isExpired(quot.expires_at)
  const transitions  = getTransitions(quot, allStages)
  const active       = allStages.filter(s => s.is_active && s.id !== quot.stage_id).sort((a, b) => a.sort_order - b.sort_order)
  const currentStage = allStages.find(s => s.id === quot.stage_id)
  const isWon        = currentStage?.is_won ?? false

  function handleStage(stageId: string) {
    setShowAll(false)
    startTransition(async () => {
      await updateCotizacionStage(quot.id, stageId)
    })
  }

  function handleDelete() {
    if (!confirm('¿Eliminar esta cotización?')) return
    startTransition(async () => {
      await deleteCotizacion(quot.id)
    })
  }

  function handleConvert() {
    if (!quot.account?.id) {
      alert('La cotización necesita una cuenta vinculada para crear la póliza')
      return
    }
    startConvert(async () => {
      const result = await convertQuotationToPolicy(quot.id)
      if ('error' in result) {
        alert(result.error)
      } else {
        router.push(`/accounts/${result.accountId}`)
      }
    })
  }

  return (
    <div className={`rounded-xl border bg-white p-3.5 shadow-sm space-y-2 ${isPending ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {quot.account ? (
            <Link
              href={`/accounts/${quot.account.id}`}
              className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline line-clamp-1"
            >
              {quot.account.name}
            </Link>
          ) : (
            <span className="text-sm font-medium text-gray-400">Sin cuenta</span>
          )}
          {quot.contact && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{quot.contact.full_name}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canManage && <EditCotizacionSheet quot={quot} requesters={requesters} />}
          <button
            onClick={handleDelete}
            className="text-gray-300 hover:text-red-500 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {quot.insurer && (
          <span className="text-[11px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5">
            {quot.insurer}
          </span>
        )}
        {quot.branch && (
          <span className="text-[11px] bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5 uppercase">
            {quot.branch}
          </span>
        )}
      </div>

      {/* Premium */}
      {quot.estimated_premium != null && (
        <p className="text-base font-semibold text-gray-800">
          {formatCurrency(quot.estimated_premium)}
        </p>
      )}

      {/* Requester */}
      {quot.requester && (
        <p className="text-xs text-gray-400">
          Pedida por: <span className="text-gray-600">{quot.requester.name}</span>
          {quot.requester_is_contractor && ' · es el contratante'}
          {!quot.requester_is_contractor && quot.probable_contractor && ` · contratante: ${quot.probable_contractor}`}
        </p>
      )}

      {/* Expiration & delivery */}
      {quot.expires_at && (
        <p className={`text-xs ${expired ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          {expired ? 'Vencida' : 'Vence'} {formatDate(quot.expires_at)}
        </p>
      )}
      {quot.delivery_due_at && (
        <p className={`text-xs ${new Date(quot.delivery_due_at) < new Date() ? 'text-red-500 font-medium' : 'text-amber-600'}`}>
          Entregar {formatDate(quot.delivery_due_at)}
        </p>
      )}

      {/* Transitions */}
      {(transitions.length > 0 || active.length > 0) && (
        <div className="pt-1 border-t">
          {/* Quick transitions */}
          {transitions.length > 0 && !showAll && (
            <div className="flex flex-wrap items-center gap-1.5">
              {transitions.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleStage(s.id)}
                  disabled={isPending}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50"
                >
                  <ChevronRight className="h-3 w-3" />
                  {s.name}
                </button>
              ))}
              {active.length > transitions.length && (
                <button
                  onClick={() => setShowAll(true)}
                  className="text-xs text-gray-300 hover:text-gray-500"
                >
                  más…
                </button>
              )}
            </div>
          )}

          {/* All stages dropdown */}
          {showAll && (
            <div className="space-y-0.5">
              {active.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleStage(s.id)}
                  disabled={isPending}
                  className="flex w-full items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded px-1 py-0.5 transition-colors disabled:opacity-50"
                >
                  {stageIcon(s)}
                  {s.name}
                </button>
              ))}
              <button
                onClick={() => setShowAll(false)}
                className="text-xs text-gray-300 hover:text-gray-500 px-1"
              >
                cerrar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Convertir a póliza (solo admin/ops en stages ganados) */}
      {canManage && isWon && quot.account?.id && (
        <div className="pt-2 border-t">
          <button
            onClick={handleConvert}
            disabled={isConverting}
            className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-2 py-1.5 border border-emerald-200 transition-colors disabled:opacity-50"
          >
            {isConverting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ArrowRight className="h-3.5 w-3.5" />
            }
            Crear póliza
          </button>
        </div>
      )}
    </div>
  )
}

// ─── New Quotation Form ──────────────────────────────────────

function NewCotizacionForm({
  accounts,
  requesters,
  slaHours,
  onClose,
}: {
  accounts:   AccountOption[]
  requesters: RequesterOption[]
  slaHours:   number | null
  onClose:    () => void
}) {
  const [isPending, startTransition]               = useTransition()
  const [error, setError]                          = useState<string | null>(null)
  const [requesterIsContractor, setRequesterIsContractor] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    // Calcular delivery_due_at desde SLA si no se especifica
    let delivery_due_at: string | undefined
    if (slaHours) {
      const d = new Date()
      d.setHours(d.getHours() + slaHours)
      delivery_due_at = d.toISOString()
    }

    const data: CreateCotizacionData = {
      account_id:               fd.get('account_id')        as string || undefined,
      insurer:                  fd.get('insurer')            as string || undefined,
      branch:                   fd.get('branch')             as string || undefined,
      estimated_premium:        fd.get('estimated_premium')
        ? Number(fd.get('estimated_premium')) : undefined,
      notes:                    fd.get('notes')              as string || undefined,
      expires_at:               fd.get('expires_at')         as string || undefined,
      requested_by_id:          fd.get('requested_by_id')    as string || undefined,
      requester_is_contractor:  requesterIsContractor,
      probable_contractor:      requesterIsContractor ? undefined : (fd.get('probable_contractor') as string || undefined),
      delivery_due_at,
    }
    setError(null)
    startTransition(async () => {
      const result = await createCotizacion(data)
      if ('error' in result) {
        setError(result.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      {error && (
        <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">Cuenta</label>
        <select name="account_id" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
          <option value="">Sin cuenta</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Solicitante interno */}
      {requesters.length > 0 && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Solicitado por</label>
            <select name="requested_by_id" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="">No especificado</option>
              {requesters.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setRequesterIsContractor(v => !v)}
            className={[
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs w-full transition-all',
              requesterIsContractor
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300',
            ].join(' ')}
          >
            <span className="text-base">{requesterIsContractor ? '✓' : '○'}</span>
            <span>El solicitante es el contratante</span>
          </button>

          {!requesterIsContractor && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Contratante probable</label>
              <Input name="probable_contractor" placeholder="Nombre del contratante probable" />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Aseguradora</label>
          <Input name="insurer" placeholder="Ej. Qualitas, GNP" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Ramo</label>
          <select name="branch" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">Seleccionar</option>
            {BRANCH_OPTIONS.map(b => (
              <option key={b} value={b}>{b.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Prima estimada (MXN)</label>
          <Input name="estimated_premium" type="number" min="0" step="0.01" placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Vence el</label>
          <Input name="expires_at" type="date" />
        </div>
      </div>

      {slaHours && (
        <p className="text-xs text-gray-400 bg-gray-50 rounded px-3 py-2">
          SLA: se calculará fecha de entrega {slaHours}h desde ahora al guardar
        </p>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">Notas</label>
        <Textarea name="notes" placeholder="Observaciones opcionales..." rows={3} />
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1 gap-2" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Crear cotización
        </Button>
      </div>
    </form>
  )
}

// ─── Summary bar ─────────────────────────────────────────────

function SummaryBar({ quotations, stages }: { quotations: QuotationRow[]; stages: QuotationStage[] }) {
  const wonIds  = new Set(stages.filter(s => s.is_won).map(s => s.id))
  const lostIds = new Set(stages.filter(s => s.is_lost).map(s => s.id))

  const won        = quotations.filter(q => q.stage_id && wonIds.has(q.stage_id))
  const open       = quotations.filter(q => !q.stage_id || (!wonIds.has(q.stage_id) && !lostIds.has(q.stage_id)))
  const wonPremium = won.reduce((acc, q) => acc + (q.estimated_premium ?? 0), 0)
  const openPremium = open.reduce((acc, q) => acc + (q.estimated_premium ?? 0), 0)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Abiertas',          value: open.length,             sub: `${formatCurrency(openPremium)} en potencia` },
        { label: 'Ganadas',           value: won.length,              sub: `${formatCurrency(wonPremium)} asegurado`    },
        { label: 'Tasa de cierre',    value: quotations.length > 0 ? `${Math.round((won.length / quotations.length) * 100)}%` : '—', sub: 'ganadas/total' },
        { label: 'Total',             value: quotations.length,       sub: 'cotizaciones'                               },
      ].map(s => (
        <div key={s.label} className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-400">{s.label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{s.value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Main board ──────────────────────────────────────────────

export function CotizacionBoard({ quotations, accounts, requesters, slaHours, canCreate, canManage, stages }: CotizacionBoardProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query,     setQuery]     = useState('')

  const activeStages = stages
    .filter(s => s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)

  const filteredQuotations = query.trim()
    ? quotations.filter(q => {
        const q2 = query.trim().toLowerCase()
        const name = (q.account?.name ?? '').toLowerCase()
        return name.includes(q2) || (q.insurer ?? '').toLowerCase().includes(q2)
      })
    : quotations

  // Agrupar quotations por stage_id (con fallback a status legacy)
  function byStage(stageId: string) {
    return filteredQuotations.filter(q => {
      if (q.stage_id) return q.stage_id === stageId
      // fallback: matchear por nombre del stage con el status legacy
      const stage = stages.find(s => s.id === stageId)
      return stage ? stage.name.toLowerCase() === q.status.toLowerCase() : false
    })
  }

  const gridCols =
    activeStages.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' :
    activeStages.length <= 3 ? 'grid-cols-1 sm:grid-cols-3' :
    activeStages.length <= 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' :
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-500" />
            Cotizaciones
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{filteredQuotations.length} cotizaciones{query.trim() ? ' encontradas' : ' en total'}</p>
        </div>
        {canCreate && (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Nueva cotización
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Nueva cotización</SheetTitle>
              </SheetHeader>
              <NewCotizacionForm
                accounts={accounts}
                requesters={requesters}
                slaHours={slaHours}
                onClose={() => setSheetOpen(false)}
              />
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* Summary */}
      <SummaryBar quotations={filteredQuotations} stages={stages} />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por cliente o aseguradora…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20 transition-colors"
        />
      </div>

      {/* Kanban */}
      {filteredQuotations.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-gray-50 p-12 text-center">
          <FileText className="h-10 w-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-400">
            {query.trim() ? 'Sin resultados para esta búsqueda' : 'Sin cotizaciones aún'}
          </p>
          {canCreate && !query.trim() && (
            <p className="text-xs text-gray-300 mt-1">
              Crea tu primera cotización con el botón de arriba
            </p>
          )}
        </div>
      ) : (
        <div className={`grid ${gridCols} gap-4`}>
          {activeStages.map(stage => {
            const items = byStage(stage.id)
            return (
              <div key={stage.id}>
                <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium mb-3 ${stageColorClass(stage.color)}`}>
                  {stageIcon(stage)}
                  {stage.name}
                  <span className="ml-0.5 opacity-60">({items.length})</span>
                </div>
                <div className="space-y-2">
                  {items.map(q => (
                    <QuotationCard key={q.id} quot={q} allStages={stages} requesters={requesters} canManage={canManage} />
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-xl border border-dashed p-4 text-center">
                      <p className="text-xs text-gray-300">Sin cotizaciones</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
