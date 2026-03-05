'use client'

import { useState, useTransition } from 'react'
import Link                        from 'next/link'
import { Plus, Rocket, Clock, CheckCircle2, Loader2, AlertCircle, FileText } from 'lucide-react'
import type { GtmProcess }         from '@/app/actions/gtm-actions'
import { NewProcessDialog }        from './new-process-dialog'

// ─── Status helpers ───────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft:          'Borrador',
  sending:        'Enviando',
  waiting:        'Esperando respuestas',
  analyzing:      'Analizando',
  proposal_ready: 'Propuesta lista',
  completed:      'Completado',
  cancelled:      'Cancelado',
}

const STATUS_COLOR: Record<string, string> = {
  draft:          'bg-gray-100 text-gray-600',
  sending:        'bg-blue-100 text-blue-700',
  waiting:        'bg-amber-100 text-amber-700',
  analyzing:      'bg-purple-100 text-purple-700',
  proposal_ready: 'bg-green-100 text-green-700',
  completed:      'bg-emerald-100 text-emerald-700',
  cancelled:      'bg-red-100 text-red-600',
}

// ─── KPI Card ─────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon }: { label: string; value: number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-4 space-y-1">
      <div className="flex items-center gap-2 text-gray-400">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ─── Process Row ──────────────────────────────────────────────

function ProcessRow({ process }: { process: GtmProcess }) {
  const statusLabel = STATUS_LABEL[process.status] ?? process.status
  const statusColor = STATUS_COLOR[process.status] ?? 'bg-gray-100 text-gray-600'
  const pct         = process.insurer_count > 0
    ? Math.round((process.responded_count / process.insurer_count) * 100)
    : 0

  return (
    <Link
      href={`/go-to-market/${process.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors border-b last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-900 truncate">{process.title}</p>
          {process.branch && (
            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">
              {process.branch}
            </span>
          )}
        </div>
        {process.account_name && (
          <p className="text-xs text-gray-500 mt-0.5">{process.account_name}</p>
        )}
      </div>

      {/* Progress */}
      <div className="w-32 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">{process.responded_count}/{process.insurer_count} respondieron</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Status */}
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusColor}`}>
        {statusLabel}
      </span>

      {/* Deadline */}
      {process.deadline_at && (
        <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(process.deadline_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
        </span>
      )}

      {/* Assigned */}
      {process.assigned_name && (
        <span className="text-xs text-gray-400 shrink-0 hidden md:block truncate max-w-[100px]">
          {process.assigned_name}
        </span>
      )}
    </Link>
  )
}

// ─── Main Panel ───────────────────────────────────────────────

interface GtmPanelProps {
  initialProcesses: GtmProcess[]
  insurers:          { id: string; name: string; logo_url: string | null }[]
  profiles:          { id: string; full_name: string }[]
  currentUserId:     string
  currentUserRole:   string
}

export function GtmPanel({
  initialProcesses, insurers, profiles, currentUserId, currentUserRole,
}: GtmPanelProps) {
  const [processes,   setProcesses]   = useState(initialProcesses)
  const [showNew,     setShowNew]     = useState(false)
  const [filter,      setFilter]      = useState<'all' | 'active' | 'done'>('all')
  const [,            startTransition] = useTransition()

  // KPIs
  const active   = processes.filter(p => ['sending','waiting','analyzing'].includes(p.status)).length
  const ready    = processes.filter(p => p.status === 'proposal_ready').length
  const pending  = processes.filter(p => p.status === 'waiting')
    .reduce((sum, p) => sum + (p.insurer_count - p.responded_count), 0)
  const done     = processes.filter(p => ['proposal_ready','completed'].includes(p.status)).length

  const filtered = processes.filter(p => {
    if (filter === 'active') return ['draft','sending','waiting','analyzing','proposal_ready'].includes(p.status)
    if (filter === 'done')   return ['completed','cancelled'].includes(p.status)
    return true
  })

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Procesos activos"
          value={active}
          icon={<Rocket className="h-3.5 w-3.5" />}
          sub="en curso"
        />
        <KpiCard
          label="Propuestas listas"
          value={ready}
          icon={<FileText className="h-3.5 w-3.5" />}
          sub="para generar PDF"
        />
        <KpiCard
          label="Respuestas pendientes"
          value={pending}
          icon={<Clock className="h-3.5 w-3.5" />}
          sub="de aseguradoras"
        />
        <KpiCard
          label="Completados"
          value={done}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          sub="propuesta generada"
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {[['all','Todos'],['active','Activos'],['done','Completados']] .map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v as typeof filter)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                filter === v ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#0A2F6B] px-3 py-2 text-xs font-medium text-white hover:bg-blue-900 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo proceso
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Rocket className="h-8 w-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Sin procesos GTM</p>
            <p className="text-xs text-gray-400 mt-1">Crea uno con el botón de arriba.</p>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="hidden md:flex items-center gap-4 px-4 py-2 border-b bg-gray-50 text-xs text-gray-400 font-medium">
              <span className="flex-1">Proceso</span>
              <span className="w-32">Progreso</span>
              <span className="w-28">Estado</span>
              <span className="w-20">Deadline</span>
              <span className="w-24">Asignado</span>
            </div>
            {filtered.map(p => <ProcessRow key={p.id} process={p} />)}
          </div>
        )}
      </div>

      {showNew && (
        <NewProcessDialog
          insurers={insurers}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={() => setShowNew(false)}
          onCreated={newProcess => {
            setProcesses(prev => [newProcess, ...prev])
            setShowNew(false)
          }}
        />
      )}
    </div>
  )
}
