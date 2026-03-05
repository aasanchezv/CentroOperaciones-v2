'use client'

import { useRef, useEffect, useState, KeyboardEvent } from 'react'
import { Sparkles, X, Trash2, Send, Loader2 } from 'lucide-react'
import { useAgent } from '@/context/agent-context'

// ─── Markdown helper ──────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^·\s+(.*)$/gm, '<li>$1</li>')
    .replace(/^-\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul class="list-none space-y-0.5 my-1">${m}</ul>`)
    .replace(/\n/g, '<br />')
}

// ─── Quick chips ──────────────────────────────────────────────────────────────

const QUICK_CHIPS = [
  { label: 'Recibos urgentes',      message: '¿Qué recibos de cobranza son urgentes?' },
  { label: 'Mis renovaciones',      message: '¿Cuáles son mis renovaciones en proceso?' },
  { label: 'Pólizas por vencer',    message: '¿Qué pólizas vencen en los próximos 30 días?' },
  { label: 'Mis tareas pendientes', message: '¿Qué tareas tengo pendientes?' },
  { label: 'Crear tarea',           message: 'Quiero crear una nueva tarea' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentBubble() {
  const { isOpen, messages, loading, personaName, setOpen, sendMessage, clearChat } = useAgent()
  const [input, setInput]       = useState('')
  const messagesEndRef           = useRef<HTMLDivElement>(null)
  const inputRef                 = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    await sendMessage(text)
  }

  function handleChip(msg: string) {
    sendMessage(msg)
  }

  const unreadCount = !isOpen ? messages.filter(m => m.role === 'assistant').length : 0

  return (
    <>
      {/* ── Chat card ── */}
      {isOpen && (
        <div
          className="fixed bottom-[88px] right-6 z-50 flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl"
          style={{ width: 380, maxHeight: 560, minHeight: 400 }}
          role="dialog"
          aria-label={`Chat con ${personaName}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 bg-gradient-to-r from-violet-600 to-violet-700 rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-white">{personaName}</span>
              <span className="text-[10px] text-violet-200 bg-violet-800/40 rounded-full px-1.5 py-0.5">IA</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  title="Limpiar conversación"
                  className="p-1.5 rounded-lg text-violet-200 hover:bg-white/10 transition-colors"
                  aria-label="Limpiar conversación"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                title="Cerrar"
                className="p-1.5 rounded-lg text-violet-200 hover:bg-white/10 transition-colors"
                aria-label="Cerrar copiloto"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {messages.length === 0 && !loading && (
              <div className="space-y-4 pt-2">
                <div className="text-center">
                  <div className="mx-auto h-10 w-10 rounded-full bg-violet-50 flex items-center justify-center mb-2">
                    <Sparkles className="h-5 w-5 text-violet-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">¡Hola! Soy {personaName}</p>
                  <p className="text-xs text-gray-400 mt-1">¿En qué puedo ayudarte hoy?</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CHIPS.map(chip => (
                    <button
                      key={chip.label}
                      onClick={() => handleChip(chip.message)}
                      className="text-xs rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700 hover:bg-violet-100 transition-colors font-medium"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={[
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                ].join(' ')}
              >
                <div
                  className={[
                    'max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm',
                  ].join(' ')}
                >
                  {msg.role === 'assistant' ? (
                    <div
                      className="prose-sm"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-gray-100 px-3 py-2.5">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje…"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white transition-colors disabled:opacity-50"
                style={{ maxHeight: 96, overflowY: 'auto' }}
                aria-label="Mensaje para el copiloto"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Enviar mensaje"
              >
                {loading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-center text-[10px] text-gray-300">
              Enter para enviar · Shift+Enter para nueva línea
            </p>
          </div>
        </div>
      )}

      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen(!isOpen)}
        className={[
          'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all',
          isOpen
            ? 'bg-violet-700 hover:bg-violet-800'
            : 'bg-violet-600 hover:bg-violet-700 hover:shadow-xl hover:scale-105',
        ].join(' ')}
        aria-label={isOpen ? 'Cerrar copiloto' : `Abrir ${personaName}`}
        title={isOpen ? 'Cerrar' : personaName}
      >
        {isOpen
          ? <X className="h-6 w-6 text-white" />
          : <Sparkles className="h-6 w-6 text-white" />}

        {/* Unread badge */}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </>
  )
}
