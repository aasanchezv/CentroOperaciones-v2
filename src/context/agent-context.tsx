'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}

interface AgentContextValue {
  isOpen:      boolean
  messages:    ChatMessage[]
  loading:     boolean
  personaName: string
  setOpen:     (v: boolean) => void
  sendMessage: (text: string) => Promise<void>
  clearChat:   () => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AgentContext = createContext<AgentContextValue | null>(null)

const STORAGE_KEY   = 'agent_chat_history'
const MAX_HISTORY   = 20

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AgentProvider({
  children,
  personaName = 'Copiloto IA',
}: {
  children:     ReactNode
  personaName?: string
}) {
  const pathname = usePathname()

  const [isOpen,   setIsOpen]   = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading,  setLoading]  = useState(false)

  // Restaurar historial desde sessionStorage al montar
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) setMessages(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  // Persistir historial en sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch { /* ignore */ }
  }, [messages])

  function setOpen(v: boolean) { setIsOpen(v) }

  function clearChat() {
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setMessages([])
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = messages.slice(-MAX_HISTORY)
      const res = await fetch('/api/agent/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message:     text.trim(),
          history,
          currentPage: pathname,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: err.error ?? 'Ocurrió un error al procesar tu mensaje.' },
        ])
        return
      }

      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Error de conexión. Intenta de nuevo.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <AgentContext.Provider value={{
      isOpen, messages, loading, personaName,
      setOpen, sendMessage, clearChat,
    }}>
      {children}
    </AgentContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext)
  if (!ctx) throw new Error('useAgent must be used within AgentProvider')
  return ctx
}
