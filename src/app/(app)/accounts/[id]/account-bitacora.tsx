'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Activity, Mail, MessageCircle, Phone, Globe, StickyNote,
  Plus, Loader2, RefreshCw, Zap, User, ArrowDownLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAccountHistory, type HistoryEntry, type HistorySource } from '@/app/actions/cc-history-actions'
import { QuickLogSheet } from './quick-log-sheet'

// ── Helpers ────────────────────────────────────────────────────────────────────

function stripHtml(html: string | null): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours   = Math.floor(diff / 3_600_000)
  const days    = Math.floor(diff / 86_400_000)

  if (minutes < 2)   return 'Ahora'
  if (minutes < 60)  return `Hace ${minutes} min`
  if (hours < 24)    return `Hace ${hours} h`
  if (days < 7)      return `Hace ${days} día${days !== 1 ? 's' : ''}`

  return new Date(iso).toLocaleDateString('es-MX', {
    day:   'numeric',
    month: 'short',
    year:  new Date(iso).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

// ── Badges & icons ─────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<HistorySource, { label: string; cls: string }> = {
  agent:     { label: 'Agente',     cls: 'bg-slate-100 text-slate-600' },
  cobranza:  { label: 'Cobranza',   cls: 'bg-amber-100 text-amber-700' },
  renovacion:{ label: 'Renovación', cls: 'bg-blue-100 text-blue-700'   },
  portal:    { label: 'Portal',     cls: 'bg-indigo-100 text-indigo-700'},
  manual:    { label: 'Manual',     cls: 'bg-violet-100 text-violet-700'},
}

function ChannelIcon({ channel }: { channel: string }) {
  const cls = 'h-4 w-4 shrink-0'
  if (channel === 'email')    return <Mail          className={cn(cls, 'text-blue-500')}   />
  if (channel === 'whatsapp') return <MessageCircle className={cn(cls, 'text-green-500')}  />
  if (channel === 'phone')    return <Phone         className={cn(cls, 'text-purple-500')} />
  if (channel === 'portal')   return <Globe         className={cn(cls, 'text-indigo-500')} />
  return <StickyNote className={cn(cls, 'text-gray-400')} />
}

function AutoBadge({ entry }: { entry: HistoryEntry }) {
  if (entry.source === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full px-1.5 py-0.5">
        <User className="h-2.5 w-2.5" /> Manual
      </span>
    )
  }
  if (entry.direction === 'inbound') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 rounded-full px-1.5 py-0.5">
        <ArrowDownLeft className="h-2.5 w-2.5" /> Recibido
      </span>
    )
  }
  if (entry.template_name) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5">
        <Zap className="h-2.5 w-2.5" /> Automatizado
      </span>
    )
  }
  return null
}

// ── Filter pill ────────────────────────────────────────────────────────────────

type FilterKey = 'all' | HistorySource

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'Todo'       },
  { key: 'agent',    label: 'Mensajes'   },
  { key: 'cobranza', label: 'Cobranza'   },
  { key: 'renovacion', label: 'Renovaciones' },
  { key: 'portal',   label: 'Portal'     },
  { key: 'manual',   label: 'Manual'     },
]

// ── BitacoraEntry ──────────────────────────────────────────────────────────────

function BitacoraEntry({ entry }: { entry: HistoryEntry }) {
  const src = SOURCE_CONFIG[entry.source]
  const body = stripHtml(entry.body)

  return (
    <div className={cn(
      'flex gap-3 px-5 py-4 hover:bg-gray-50/60 transition-colors',
      entry.direction === 'inbound'    && 'border-l-2 border-green-200',
      entry.source    === 'manual'     && 'border-l-2 border-violet-200',
      entry.template_name              && 'border-l-2 border-amber-200',
    )}>
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        <ChannelIcon channel={entry.channel} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Source badge */}
          <span className={cn('text-[10px] font-semibold rounded-full px-1.5 py-0.5', src.cls)}>
            {src.label}
          </span>
          {/* Auto/manual/received badge */}
          <AutoBadge entry={entry} />
          {/* Template name */}
          {entry.template_name && (
            <span className="text-[10px] text-gray-400 italic truncate max-w-[160px]">
              &ldquo;{entry.template_name}&rdquo;
            </span>
          )}
        </div>

        {/* Subject */}
        {entry.subject && (
          <p className="text-xs font-medium text-gray-700 truncate">{entry.subject}</p>
        )}

        {/* Body */}
        {body && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{body}</p>
        )}

        {/* Sender + time */}
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          {entry.sender_name && (
            <span>
              {entry.direction === 'inbound' ? 'De:' : 'Por:'} {entry.sender_name}
            </span>
          )}
          <span className="ml-auto shrink-0">{relativeDate(entry.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

// ── AccountBitacora ────────────────────────────────────────────────────────────

interface Props {
  accountId: string
}

export function AccountBitacora({ accountId }: Props) {
  const [entries,       setEntries]       = useState<HistoryEntry[]>([])
  const [loading,       setLoading]       = useState(true)
  const [filter,        setFilter]        = useState<FilterKey>('all')
  const [showLogSheet,  setShowLogSheet]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAccountHistory(accountId)
      setEntries(data)
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => { void load() }, [load])

  const filtered = filter === 'all'
    ? entries
    : entries.filter(e => e.source === filter)

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-gray-400" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Bitácora de cliente</h2>
            {!loading && (
              <p className="text-xs text-gray-400 mt-0.5">
                {entries.length} evento{entries.length !== 1 ? 's' : ''} registrado{entries.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            title="Actualizar"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowLogSheet(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Registrar actividad
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="px-5 py-2.5 border-b bg-gray-50/50 flex gap-1.5 overflow-x-auto scrollbar-hide">
        {FILTERS.map(f => {
          const count = f.key === 'all'
            ? entries.length
            : entries.filter(e => e.source === f.key).length
          if (f.key !== 'all' && count === 0) return null
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                filter === f.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-500 hover:text-gray-700 border border-gray-200'
              )}
            >
              {f.label}
              <span className={cn('text-[10px]', filter === f.key ? 'text-white/70' : 'text-gray-400')}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Cargando historial…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-300">
          <Activity className="h-7 w-7 mb-2" />
          <p className="text-sm text-gray-400">
            {entries.length === 0 ? 'Sin interacciones registradas' : 'Sin eventos en este filtro'}
          </p>
          {entries.length === 0 && (
            <p className="text-xs mt-0.5 text-gray-400">
              Registra la primera actividad con el botón de arriba
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y max-h-[600px] overflow-y-auto">
          {filtered.map(entry => (
            <BitacoraEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Quick log sheet */}
      <QuickLogSheet
        accountId={accountId}
        open={showLogSheet}
        onClose={() => setShowLogSheet(false)}
        onSaved={entry => {
          setEntries(prev => [entry, ...prev])
          setFilter('all')
        }}
      />
    </div>
  )
}
