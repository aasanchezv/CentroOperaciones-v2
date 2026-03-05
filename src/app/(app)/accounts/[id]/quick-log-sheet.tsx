'use client'

import { useState, useTransition } from 'react'
import {
  Phone, Users, StickyNote, MessageCircle, Mail,
  ChevronDown, Loader2, X,
} from 'lucide-react'
import { logActivity, type ActivityType, type LogActivityPayload } from '@/app/actions/activity-actions'
import type { HistoryEntry } from '@/app/actions/cc-history-actions'

// ── Constantes ─────────────────────────────────────────────────────────────────

const ACTIVITY_TYPES: {
  value: ActivityType
  label: string
  defaultDirection: 'inbound' | 'outbound'
  icon: React.ReactNode
}[] = [
  { value: 'call',     label: 'Llamada saliente', defaultDirection: 'outbound', icon: <Phone        className="h-3.5 w-3.5" /> },
  { value: 'call',     label: 'Llamada entrante', defaultDirection: 'inbound',  icon: <Phone        className="h-3.5 w-3.5" /> },
  { value: 'meeting',  label: 'Reunión',           defaultDirection: 'outbound', icon: <Users        className="h-3.5 w-3.5" /> },
  { value: 'note',     label: 'Nota interna',      defaultDirection: 'outbound', icon: <StickyNote   className="h-3.5 w-3.5" /> },
  { value: 'whatsapp', label: 'WhatsApp enviado',  defaultDirection: 'outbound', icon: <MessageCircle className="h-3.5 w-3.5" /> },
  { value: 'whatsapp', label: 'WhatsApp recibido', defaultDirection: 'inbound',  icon: <MessageCircle className="h-3.5 w-3.5" /> },
  { value: 'email',    label: 'Email enviado',     defaultDirection: 'outbound', icon: <Mail         className="h-3.5 w-3.5" /> },
  { value: 'email',    label: 'Email recibido',    defaultDirection: 'inbound',  icon: <Mail         className="h-3.5 w-3.5" /> },
]

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  accountId: string
  open:      boolean
  onClose:   () => void
  onSaved:   (entry: HistoryEntry) => void
}

// ── QuickLogSheet ──────────────────────────────────────────────────────────────

export function QuickLogSheet({ accountId, open, onClose, onSaved }: Props) {
  const [selectedIdx,   setSelectedIdx]   = useState(0)
  const [body,          setBody]          = useState('')
  const [durationMin,   setDurationMin]   = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [showTypeMenu,  setShowTypeMenu]  = useState(false)

  const selected = ACTIVITY_TYPES[selectedIdx]
  const isCall   = selected.value === 'call'

  function handleClose() {
    if (isPending) return
    setBody('')
    setDurationMin('')
    setError(null)
    setSelectedIdx(0)
    onClose()
  }

  function handleSave() {
    const trimmed = body.trim()
    if (!trimmed) { setError('El contenido no puede estar vacío.'); return }
    setError(null)

    const payload: LogActivityPayload = {
      type:             selected.value,
      direction:        selected.defaultDirection,
      body:             trimmed,
      duration_seconds: isCall && durationMin ? Math.round(Number(durationMin) * 60) : undefined,
    }

    startTransition(async () => {
      try {
        const entry = await logActivity(accountId, payload)
        onSaved(entry)
        handleClose()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        onClick={handleClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl border-t max-w-lg mx-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-6 pt-2 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Registrar actividad</h3>
            <button
              onClick={handleClose}
              disabled={isPending}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Type selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTypeMenu(v => !v)}
              className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 bg-white hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="text-gray-400">{selected.icon}</span>
                {selected.label}
              </span>
              <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
            </button>

            {showTypeMenu && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
                {ACTIVITY_TYPES.map((t, i) => (
                  <button
                    key={`${t.value}-${t.defaultDirection}`}
                    type="button"
                    onClick={() => { setSelectedIdx(i); setShowTypeMenu(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                      i === selectedIdx ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-700'
                    }`}
                  >
                    <span className="text-gray-400">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Duration (solo para llamadas) */}
          {isCall && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">
                Duración <span className="text-gray-400">(minutos, opcional)</span>
              </label>
              <input
                type="number"
                min={0}
                max={600}
                placeholder="ej: 15"
                value={durationMin}
                onChange={e => setDurationMin(e.target.value)}
                className="w-32 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Notas / contenido <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={4}
              placeholder={
                selected.value === 'call'     ? 'Resumen de la llamada…'
                : selected.value === 'meeting'  ? 'Temas tratados, acuerdos…'
                : selected.value === 'note'     ? 'Nota interna…'
                : selected.value === 'whatsapp' ? 'Resumen del mensaje…'
                : 'Contenido del email…'
              }
              value={body}
              onChange={e => setBody(e.target.value)}
              className="w-full text-sm border rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-100">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !body.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</>
                : 'Registrar'
              }
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
