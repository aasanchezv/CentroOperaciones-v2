'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { MessageCircle, X, Send, RefreshCw, User } from 'lucide-react'
import {
  getPortalChat,
  sendPortalMessage,
  type PortalMessage,
} from '@/app/actions/portal-chat-actions'

interface Props {
  accountId: string
  agentName: string | null
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour:   '2-digit',
    minute: '2-digit',
  })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (
    d.getDate()     === today.getDate()   &&
    d.getMonth()    === today.getMonth()  &&
    d.getFullYear() === today.getFullYear()
  ) {
    return 'Hoy'
  }
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function groupByDate(messages: PortalMessage[]): { date: string; items: PortalMessage[] }[] {
  const groups = new Map<string, PortalMessage[]>()
  for (const m of messages) {
    const key = m.created_at.slice(0, 10)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }))
}

export function PortalChat({ accountId, agentName }: Props) {
  const [open,         setOpen]         = useState(false)
  const [messages,     setMessages]     = useState<PortalMessage[]>([])
  const [convId,       setConvId]       = useState<string>('')
  const [body,         setBody]         = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [loaded,       setLoaded]       = useState(false)
  const [hasPending,   setHasPending]   = useState(false)
  const [isPending,    startTransition] = useTransition()
  const [aiEnabled,    setAiEnabled]    = useState(false)
  const [isAiTyping,   setIsAiTyping]   = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)

  // Scroll al final cuando cambien los mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cargar / refrescar mensajes (silent=true no muestra spinner)
  async function loadChat(silent = false) {
    if (!silent) setLoaded(false)
    const data = await getPortalChat(accountId)
    setConvId(data.conversationId)
    setAiEnabled(data.aiEnabled)
    const prevCount = messages.length
    setMessages(data.messages)
    setLoaded(true)
    setHasPending(data.messages.some(m => m.direction === 'outbound'))
    // If AI was typing and new messages arrived, stop typing indicator
    if (isAiTyping && data.messages.length > prevCount) {
      setIsAiTyping(false)
    }
  }

  // Siempre recargar al abrir — así el cliente ve respuestas nuevas
  function handleOpen() {
    setOpen(true)
    loadChat(!loaded)   // primer apertura: muestra spinner; reaperturas: silencioso
  }

  function handleClose() {
    setOpen(false)
    setHasPending(false)
  }

  async function handleRefresh() {
    await loadChat(true)
  }

  // Polling: 3s cuando AI está escribiendo, 10s normal
  useEffect(() => {
    if (!open) return
    const interval = isAiTyping ? 3_000 : 10_000
    const id = setInterval(() => { void loadChat(true) }, interval)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountId, isAiTyping])

  function handleSend() {
    if (!body.trim() || isPending) return
    const text = body.trim()
    setBody('')
    setError(null)

    // Optimistic update
    const optimistic: PortalMessage = {
      id:          crypto.randomUUID(),
      direction:   'inbound',
      body:        text,
      sender_name: 'Tú',
      created_at:  new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    startTransition(async () => {
      const res = await sendPortalMessage(accountId, text)
      if (res.error) {
        setError(res.error)
        // Revertir optimistic
        setMessages(prev => prev.filter(m => m.id !== optimistic.id))
        return
      }

      // Si AI está habilitado: mostrar indicador y disparar endpoint
      if (aiEnabled) {
        setIsAiTyping(true)
        // Auto-timeout: dejar de mostrar "escribiendo" a los 15s
        setTimeout(() => setIsAiTyping(false), 15_000)
        // Llamar al endpoint AI (fire-and-forget desde cliente)
        fetch('/api/portal/ai-respond', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ accountId }),
        }).catch(() => { setIsAiTyping(false) })
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const grouped = groupByDate(messages)

  return (
    <>
      {/* ── Chat window ───────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden no-print"
          style={{
            width: '320px',
            height: '480px',
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.1)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ background: 'linear-gradient(135deg, #071428 0%, #092E18 100%)' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                <MessageCircle className="h-3.5 w-3.5 text-white/80" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white leading-tight">Consultas</p>
                {agentName && (
                  <p className="text-[10px] text-white/50 leading-tight">{agentName}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="p-1 text-white/40 hover:text-white transition-colors"
                title="Actualizar"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleClose}
                className="p-1 text-white/40 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" style={{ background: '#f9fafb' }}>
            {!loaded ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-xs text-gray-400">Cargando…</div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                <MessageCircle className="h-8 w-8 text-gray-200" />
                <p className="text-xs font-medium text-gray-500">¿Tienes alguna pregunta?</p>
                <p className="text-[11px] text-gray-400">
                  Escríbenos — tu agente{agentName ? ` ${agentName}` : ''} te responderá.
                </p>
              </div>
            ) : (
              grouped.map(({ date, items }) => (
                <div key={date} className="space-y-2">
                  {/* Date divider */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatDate(items[0].created_at)}
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  {items.map(m => (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-0.5 ${m.direction === 'inbound' ? 'items-end' : 'items-start'}`}
                    >
                      {m.direction === 'outbound' && (
                        <div className="flex items-center gap-1 px-1">
                          <User className="h-2.5 w-2.5 text-gray-400" />
                          <span className="text-[10px] text-gray-400">{m.sender_name ?? 'Agente'}</span>
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          m.direction === 'inbound'
                            ? 'rounded-br-sm text-blue-900'
                            : 'rounded-bl-sm text-gray-800'
                        }`}
                        style={{
                          background: m.direction === 'inbound'
                            ? 'linear-gradient(135deg, #dbeafe 0%, #e0f2fe 100%)'
                            : '#ffffff',
                          border:     m.direction === 'outbound' ? '1px solid #e5e7eb' : 'none',
                          boxShadow:  '0 1px 2px rgba(0,0,0,0.06)',
                        }}
                      >
                        {m.body}
                      </div>
                      <span className="text-[10px] text-gray-400 px-1">
                        {formatTime(m.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
            {/* Typing indicator */}
            {isAiTyping && (
              <div className="flex flex-col gap-0.5 items-start">
                <div className="flex items-center gap-1 px-1">
                  <User className="h-2.5 w-2.5 text-gray-400" />
                  <span className="text-[10px] text-gray-400">Asistente</span>
                </div>
                <div
                  className="rounded-xl rounded-bl-sm px-3 py-2.5"
                  style={{ background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}
                >
                  <span className="flex gap-1 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-1.5 bg-red-50 border-t border-red-100">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Input */}
          <div
            className="shrink-0 px-3 py-2 border-t border-gray-100"
            style={{ background: '#fff' }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe tu consulta…"
                rows={2}
                disabled={isPending}
                className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 leading-relaxed"
                style={{ maxHeight: '80px' }}
              />
              <button
                onClick={handleSend}
                disabled={!body.trim() || isPending}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #5BA42A 0%, #092E18 100%)' }}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">Enter para enviar · Shift+Enter para nueva línea</p>
          </div>
        </div>
      )}

      {/* ── Trigger bubble ────────────────────────────────────────── */}
      <button
        onClick={open ? handleClose : handleOpen}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 no-print"
        style={{ background: 'linear-gradient(135deg, #071428 0%, #092E18 100%)' }}
        aria-label="Chat con tu agente"
      >
        {open ? (
          <X className="h-5 w-5 text-white" />
        ) : (
          <>
            <MessageCircle className="h-5 w-5 text-white" />
            {/* Badge de mensajes del agente no leídos */}
            {hasPending && (
              <span
                className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: '#ef4444' }}
              >
                !
              </span>
            )}
          </>
        )}
      </button>
    </>
  )
}
