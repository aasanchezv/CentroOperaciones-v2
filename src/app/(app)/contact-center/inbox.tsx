'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge }    from '@/components/ui/badge'
import { Button }   from '@/components/ui/button'
import { Textarea }  from '@/components/ui/textarea'
import { cn }       from '@/lib/utils'
import {
  MessageCircle, Mail, Phone, Globe, CheckCircle2, Loader2, RefreshCw,
  Circle, Lock, Tag, Clock, AlertTriangle, ChevronDown,
  RotateCcw, Zap, User, ExternalLink,
} from 'lucide-react'
import { replyPortalMessage }                       from '@/app/actions/portal-chat-actions'
import { getAccountHistory, type HistoryEntry }     from '@/app/actions/cc-history-actions'

// ── Tipos ────────────────────────────────────────────────────────

type Contact  = { id: string; full_name: string; email: string | null; phone: string | null } | null
type Account  = { id: string; name: string } | null
type Assignee = { id: string; full_name: string | null } | null

type Priority = 'low' | 'normal' | 'high' | 'urgent'
type Status   = 'open' | 'assigned' | 'resolved'

export interface ConversationRow {
  id:                 string
  channel:            'whatsapp' | 'email' | 'phone' | 'portal'
  status:             Status
  priority:           Priority
  tags:               string[]
  subject:            string | null
  last_message_at:    string
  unread_count:       number
  assigned_to:        string | null
  first_response_at:  string | null
  resolved_at:        string | null
  waiting_since:      string | null
  contact:            Contact
  account:            Account
  assignee:           Assignee
}

type MsgDirection = 'inbound' | 'outbound' | 'note'

interface Message {
  id:          string
  direction:   MsgDirection
  channel:     string
  body:        string | null
  subject:     string | null
  sender_name: string | null
  sent_by:     string | null
  created_at:  string
}

interface ConvEvent {
  id:         string
  event_type: string
  actor_id:   string | null
  metadata:   Record<string, unknown> | null
  created_at: string
}

interface Props {
  initialConversations: ConversationRow[]
  agents:               { id: string; full_name: string | null; role: string }[]
  currentUserId:        string
  isOpsOrAbove:         boolean
}

// ── Paleta de prioridades ─────────────────────────────────────────

const priorityConfig: Record<Priority, { label: string; dot: string; bar: string; badge: string }> = {
  low:    { label: 'Baja',     dot: 'bg-gray-300',   bar: 'bg-gray-200',   badge: 'text-gray-500 border-gray-200'   },
  normal: { label: 'Normal',   dot: 'bg-blue-400',   bar: 'bg-blue-50',    badge: 'text-blue-600 border-blue-200'   },
  high:   { label: 'Alta',     dot: 'bg-amber-400',  bar: 'bg-amber-50',   badge: 'text-amber-700 border-amber-200' },
  urgent: { label: 'Urgente',  dot: 'bg-red-500',    bar: 'bg-red-50',     badge: 'text-red-600 border-red-200'     },
}

// ── Helpers ───────────────────────────────────────────────────────

function channelIcon(channel: string, cls = 'h-4 w-4') {
  if (channel === 'whatsapp') return <MessageCircle className={cn(cls, 'text-green-600')} />
  if (channel === 'email')    return <Mail          className={cn(cls, 'text-blue-600')} />
  if (channel === 'portal')   return <Globe         className={cn(cls, 'text-indigo-600')} />
  return                             <Phone         className={cn(cls, 'text-purple-600')} />
}

function channelBadge(channel: string) {
  const cfg = {
    whatsapp: 'text-green-700 border-green-300',
    email:    'text-blue-700 border-blue-300',
    phone:    'text-purple-700 border-purple-300',
    portal:   'text-indigo-700 border-indigo-300',
  }[channel] ?? 'text-gray-600 border-gray-200'
  const label = { whatsapp: 'WA', email: 'Email', phone: 'Tel', portal: 'Portal' }[channel] ?? channel
  return <Badge variant="outline" className={cn('text-[10px] py-0', cfg)}>{label}</Badge>
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'ahora'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function waitingLabel(iso: string | null): { label: string; urgent: boolean } | null {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 5)  return { label: `${mins}m`, urgent: false }
  if (mins < 30) return { label: `${mins}m`, urgent: false }
  if (mins < 60) return { label: `${mins}m`, urgent: true  }
  const hrs = Math.floor(mins / 60)
  if (hrs < 4)  return { label: `${hrs}h ${mins % 60}m`, urgent: true }
  return { label: `${hrs}h`, urgent: true }
}

function msgTime(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    first_reply:    'Primera respuesta enviada',
    reply:          'Respuesta enviada',
    assigned:       'Conversación asignada',
    unassigned:     'Sin asignar',
    resolved:       'Conversación resuelta',
    reopened:       'Conversación reabierta',
    priority_changed: 'Prioridad actualizada',
  }
  return map[type] ?? type
}

function getContact(conv: ConversationRow): Contact {
  return (Array.isArray(conv.contact) ? (conv.contact as Contact[])[0] : conv.contact) ?? null
}
function getAccount(conv: ConversationRow): Account {
  return (Array.isArray(conv.account) ? (conv.account as Account[])[0] : conv.account) ?? null
}

// ── Componente principal ──────────────────────────────────────────

export function ContactCenterInbox({ initialConversations, agents, currentUserId, isOpsOrAbove }: Props) {
  const [conversations,  setConversations]  = useState<ConversationRow[]>(initialConversations)
  const [selected,       setSelected]       = useState<ConversationRow | null>(null)
  const [messages,       setMessages]       = useState<Message[]>([])
  const [events,         setEvents]         = useState<ConvEvent[]>([])
  const [loadingMsgs,    setLoadingMsgs]    = useState(false)
  const [reply,          setReply]          = useState('')
  const [subject,        setSubject]        = useState('')
  const [replyMode,      setReplyMode]      = useState<'reply' | 'note'>('reply')
  const [sending,        setSending]        = useState(false)
  const [sendError,      setSendError]      = useState<{ type: 'session_expired' | 'error'; msg: string } | null>(null)
  const [filterChannel,  setFilterChannel]  = useState<string>('all')
  const [filterMine,     setFilterMine]     = useState(false)
  const [showResolved,   setShowResolved]   = useState(false)
  const [priorityMenu,   setPriorityMenu]   = useState(false)
  const [showNotes,      setShowNotes]      = useState(true)
  const [detailTab,      setDetailTab]      = useState<'messages' | 'historial'>('messages')
  const [historial,      setHistorial]      = useState<HistoryEntry[]>([])
  const [loadingHist,    setLoadingHist]    = useState(false)
  const [, startTransition] = useTransition()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase       = createClient()

  // ── Realtime ──────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel('cc-inbox-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          const updated = payload.new as ConversationRow
          if (!updated?.id) return
          setConversations(prev => {
            const idx = prev.findIndex(c => c.id === updated.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], ...updated }
              return next.sort((a, b) =>
                new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
              )
            }
            // Nueva conversación — agregar sin reload
            return [updated, ...prev]
          })
          if (selected?.id === updated.id) {
            setSelected(prev => prev ? { ...prev, ...updated } : null)
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cc_messages' },
        (payload) => {
          const msg = payload.new as Message
          if (!msg?.id) return
          if (selected?.id) {
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev
              return [...prev, msg]
            })
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_events' },
        (payload) => {
          const ev = payload.new as ConvEvent
          if (!ev?.id) return
          setEvents(prev => [...prev, ev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  // Scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Cargar conversación ───────────────────────────────────────
  const loadConversation = useCallback(async (convId: string) => {
    setLoadingMsgs(true)
    const [{ data: msgs }, { data: evts }] = await Promise.all([
      supabase
        .from('cc_messages')
        .select('id, direction, channel, body, subject, sender_name, sent_by, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true }),
      supabase
        .from('conversation_events')
        .select('id, event_type, actor_id, metadata, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true }),
    ])
    setMessages((msgs ?? []) as Message[])
    setEvents((evts ?? []) as ConvEvent[])
    setLoadingMsgs(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Seleccionar conversación ──────────────────────────────────
  async function selectConversation(conv: ConversationRow) {
    setSelected(conv)
    setReply('')
    setReplyMode('reply')
    setSendError(null)
    setDetailTab('messages')
    setHistorial([])
    await loadConversation(conv.id)
    await markRead(conv.id)
  }

  async function loadHistorial(accountId: string) {
    if (historial.length > 0) return // ya cargado para esta conversación
    setLoadingHist(true)
    const data = await getAccountHistory(accountId)
    setHistorial(data)
    setLoadingHist(false)
  }

  function handleTabHistorial() {
    setDetailTab('historial')
    const acc = getAccount(selected!)
    if (acc) loadHistorial(acc.id)
  }

  async function markRead(convId: string) {
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', convId)
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c))
  }

  // ── Enviar reply / nota ───────────────────────────────────────
  async function handleSend() {
    if (!selected || !reply.trim()) return
    setSending(true)
    setSendError(null)
    try {
      if (replyMode === 'note') {
        // Nota interna — solo en DB, no sale al cliente
        await supabase.from('cc_messages').insert({
          conversation_id: selected.id,
          direction:       'note',
          channel:         selected.channel,
          body:            reply.trim(),
          sender_name:     agents.find(a => a.id === currentUserId)?.full_name ?? 'Ejecutivo',
          sent_by:         currentUserId,
          status:          'internal',
        })
        setReply('')
      } else if (selected.channel === 'portal') {
        // Canal portal — insertar directamente en DB (sin envío externo)
        const res = await replyPortalMessage(selected.id, reply.trim())
        if (res.error) {
          setSendError({ type: 'error', msg: res.error })
          return
        }
        setReply('')
      } else {
        const res = await fetch('/api/contact-center/reply', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            conversationId: selected.id,
            message:        reply.trim(),
            subject:        subject || undefined,
          }),
        })
        if (!res.ok) {
          const d = await res.json() as { error?: string; message?: string }
          if (d.error === 'session_expired') {
            setSendError({ type: 'session_expired', msg: d.message ?? 'Sesión WA expirada' })
          } else {
            setSendError({ type: 'error', msg: d.error ?? d.message ?? 'Error al enviar' })
          }
          return
        }
        setReply('')
      }
    } catch (e) {
      setSendError({ type: 'error', msg: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  // ── Asignar ───────────────────────────────────────────────────
  async function handleAssign(convId: string, agentId: string | null) {
    const now = new Date().toISOString()
    await supabase
      .from('conversations')
      .update({ assigned_to: agentId, status: agentId ? 'assigned' : 'open', updated_at: now })
      .eq('id', convId)
    await supabase.from('conversation_events').insert({
      conversation_id: convId,
      event_type:      agentId ? 'assigned' : 'unassigned',
      actor_id:        currentUserId,
      metadata:        { agent_id: agentId },
    })
    const updatedAssignee = agentId ? (agents.find(a => a.id === agentId) ?? null) : null
    setConversations(prev =>
      prev.map(c => c.id === convId
        ? { ...c, assigned_to: agentId, status: agentId ? 'assigned' : 'open', assignee: updatedAssignee as Assignee }
        : c
      )
    )
    if (selected?.id === convId) {
      setSelected(prev => prev ? {
        ...prev,
        assigned_to: agentId,
        status:      agentId ? 'assigned' : 'open',
        assignee:    updatedAssignee as Assignee,
      } : null)
    }
  }

  // ── Resolver ──────────────────────────────────────────────────
  async function handleResolve(convId: string) {
    const now = new Date().toISOString()
    startTransition(async () => {
      await supabase
        .from('conversations')
        .update({ status: 'resolved', resolved_at: now, waiting_since: null, updated_at: now })
        .eq('id', convId)
      await supabase.from('conversation_events').insert({
        conversation_id: convId,
        event_type:      'resolved',
        actor_id:        currentUserId,
        metadata:        {},
      })
      setConversations(prev => prev.map(c =>
        c.id === convId ? { ...c, status: 'resolved', resolved_at: now } : c
      ))
      if (selected?.id === convId) {
        setSelected(prev => prev ? { ...prev, status: 'resolved', resolved_at: now } : null)
      }
    })
  }

  // ── Reabrir ───────────────────────────────────────────────────
  async function handleReopen(convId: string) {
    const now = new Date().toISOString()
    await supabase
      .from('conversations')
      .update({ status: 'open', resolved_at: null, waiting_since: now, updated_at: now })
      .eq('id', convId)
    await supabase.from('conversation_events').insert({
      conversation_id: convId,
      event_type:      'reopened',
      actor_id:        currentUserId,
      metadata:        {},
    })
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, status: 'open', resolved_at: null } : c
    ))
    if (selected?.id === convId) {
      setSelected(prev => prev ? { ...prev, status: 'open', resolved_at: null } : null)
    }
  }

  // ── Cambiar prioridad ─────────────────────────────────────────
  async function handlePriority(convId: string, priority: Priority) {
    const now = new Date().toISOString()
    await supabase
      .from('conversations')
      .update({ priority, updated_at: now })
      .eq('id', convId)
    await supabase.from('conversation_events').insert({
      conversation_id: convId,
      event_type:      'priority_changed',
      actor_id:        currentUserId,
      metadata:        { priority },
    })
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, priority } : c))
    if (selected?.id === convId) {
      setSelected(prev => prev ? { ...prev, priority } : null)
    }
    setPriorityMenu(false)
  }

  // ── Filtros ───────────────────────────────────────────────────
  const filtered = conversations.filter(c => {
    if (!showResolved && c.status === 'resolved')   return false
    if (showResolved  && c.status !== 'resolved')   return false
    if (filterChannel !== 'all' && c.channel !== filterChannel) return false
    if (filterMine && c.assigned_to !== currentUserId)          return false
    return true
  })

  const totalUnread = conversations
    .filter(c => c.status !== 'resolved')
    .reduce((acc, c) => acc + (c.unread_count ?? 0), 0)

  // ── Render de lista de conversaciones ─────────────────────────

  function ConvItem({ conv }: { conv: ConversationRow }) {
    const isActive    = selected?.id === conv.id
    const contact     = getContact(conv)
    const account     = getAccount(conv)
    const pCfg        = priorityConfig[conv.priority ?? 'normal']
    const waiting     = waitingLabel(conv.waiting_since)

    return (
      <button
        onClick={() => selectConversation(conv)}
        className={cn(
          'w-full text-left px-3 py-3 transition-colors border-b border-gray-50 hover:bg-gray-50',
          isActive && 'bg-blue-50 border-r-2 border-r-blue-500',
          conv.priority === 'urgent' && 'border-l-2 border-l-red-400',
          conv.priority === 'high'   && 'border-l-2 border-l-amber-400',
        )}
      >
        {/* Fila principal */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-0.5', pCfg.dot)} />
            {channelIcon(conv.channel)}
            <span className={cn(
              'text-sm truncate',
              conv.unread_count > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
            )}>
              {contact?.full_name ?? account?.name ?? 'Desconocido'}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {waiting && (
              <span className={cn(
                'text-[10px] flex items-center gap-0.5',
                waiting.urgent ? 'text-red-500 font-semibold' : 'text-gray-400'
              )}>
                <Clock className="h-2.5 w-2.5" />{waiting.label}
              </span>
            )}
            {conv.unread_count > 0 && (
              <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </span>
            )}
          </div>
        </div>

        {/* Cuenta — solo si hay contacto distinto (si no, el nombre ya aparece arriba) */}
        {account && contact && (
          <p className="text-xs text-gray-400 truncate ml-3.5 mb-0.5">{account.name}</p>
        )}

        {/* Subject / asunto */}
        {conv.subject && (
          <p className="text-xs text-gray-500 truncate ml-3.5 mb-1 italic">{conv.subject}</p>
        )}

        {/* Tags */}
        {conv.tags?.length > 0 && (
          <div className="flex gap-1 flex-wrap ml-3.5 mb-1">
            {conv.tags.slice(0, 3).map(t => (
              <span key={t} className="text-[9px] bg-gray-100 text-gray-500 rounded px-1 py-0.5">{t}</span>
            ))}
          </div>
        )}

        {/* Badges fila */}
        <div className="flex items-center gap-1 ml-3.5">
          {channelBadge(conv.channel)}
          {conv.status === 'assigned' && conv.assignee && (
            <span className="text-[10px] text-orange-600 flex items-center gap-0.5">
              <User className="h-2.5 w-2.5" />
              {(conv.assignee as { full_name: string | null }).full_name?.split(' ')[0] ?? '—'}
            </span>
          )}
          <span className="text-[10px] text-gray-300 ml-auto">{timeAgo(conv.last_message_at)}</span>
        </div>
      </button>
    )
  }

  // ── Panel de notas internas ───────────────────────────────────

  function NotesPanel() {
    const noteMessages = messages.filter(m => m.direction === 'note')
    if (noteMessages.length === 0) return null
    return (
      <div className="border-t bg-yellow-50/40 shrink-0">
        <button
          onClick={() => setShowNotes(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-yellow-50 transition-colors"
        >
          <Lock className="h-3 w-3 text-yellow-600 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-yellow-700 flex-1">Notas internas</span>
          <span className="text-[10px] bg-yellow-200 text-yellow-800 rounded-full px-1.5 py-0.5 font-bold leading-none">
            {noteMessages.length}
          </span>
          <ChevronDown className={cn('h-3 w-3 text-yellow-500 transition-transform', showNotes && 'rotate-180')} />
        </button>
        {showNotes && (
          <div className="px-4 pb-3 space-y-2 max-h-40 overflow-y-auto">
            {noteMessages.map(m => (
              <div key={m.id} className="rounded-lg border border-yellow-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-semibold text-yellow-700">{m.sender_name ?? 'Ejecutivo'}</span>
                  <span className="text-[10px] text-gray-400">{msgTime(m.created_at)}</span>
                </div>
                <p className="text-xs text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Historial de comunicaciones ───────────────────────────────

  function HistorialPanel() {
    if (loadingHist) return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
      </div>
    )
    if (historial.length === 0) return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-8 text-gray-400">
        <MessageCircle className="h-8 w-8 text-gray-200" />
        <p className="text-sm">Sin comunicaciones registradas</p>
        <p className="text-xs">Aquí aparecerán todos los correos y mensajes enviados al cliente desde cobranza, renovaciones y Contact Center.</p>
      </div>
    )

    function sourceBadge(entry: HistoryEntry) {
      const cfg: Record<string, { label: string; cls: string }> = {
        agent:      { label: 'Agente',     cls: 'bg-gray-100 text-gray-600' },
        cobranza:   { label: 'Cobranza',   cls: 'bg-amber-100 text-amber-700' },
        renovacion: { label: 'Renovación', cls: 'bg-blue-100 text-blue-700' },
        portal:     { label: 'Portal',     cls: 'bg-indigo-100 text-indigo-700' },
      }
      const c = cfg[entry.source] ?? cfg.agent
      return <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', c.cls)}>{c.label}</span>
    }

    function typeBadge(entry: HistoryEntry) {
      if (entry.template_name) {
        return (
          <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
            <Zap className="h-2.5 w-2.5" />Automatizado
          </span>
        )
      }
      if (entry.source === 'agent' || entry.source === 'portal') {
        return (
          <span className={cn('text-[10px] flex items-center gap-0.5', entry.direction === 'inbound' ? 'text-green-600' : 'text-gray-400')}>
            <User className="h-2.5 w-2.5" />
            {entry.direction === 'inbound' ? 'Recibido' : 'Manual'}
          </span>
        )
      }
      return null
    }

    return (
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {historial.map(entry => (
          <div
            key={entry.id}
            className={cn(
              'rounded-xl border p-3 text-xs',
              entry.template_name
                ? 'bg-amber-50/40 border-amber-100'
                : entry.source === 'portal'
                  ? 'bg-indigo-50/30 border-indigo-100'
                  : entry.direction === 'inbound'
                    ? 'bg-green-50/30 border-green-100'
                    : 'bg-white border-gray-100'
            )}
          >
            {/* Fila de meta */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {channelIcon(entry.channel === 'email+whatsapp' ? 'email' : entry.channel, 'h-3.5 w-3.5')}
              {entry.channel === 'email+whatsapp' && channelIcon('whatsapp', 'h-3.5 w-3.5')}
              {sourceBadge(entry)}
              {typeBadge(entry)}
              {entry.template_name && (
                <span className="text-[10px] text-gray-500 italic truncate max-w-[140px]">
                  "{entry.template_name}"
                </span>
              )}
              <span className="ml-auto text-[10px] text-gray-400 shrink-0">
                {msgTime(entry.created_at)}
              </span>
            </div>
            {/* Remitente */}
            {entry.sender_name && (
              <p className="text-[10px] text-gray-400 mb-1">
                {entry.direction === 'inbound' ? 'De:' : 'Por:'} {entry.sender_name}
              </p>
            )}
            {/* Asunto */}
            {entry.subject && (
              <p className="font-semibold text-gray-700 mb-0.5 truncate">{entry.subject}</p>
            )}
            {/* Cuerpo */}
            {entry.body && (
              <p className="text-gray-600 line-clamp-3 leading-relaxed break-words">
                {entry.body.replace(/<[^>]*>/g, '').trim()}
              </p>
            )}
          </div>
        ))}
      </div>
    )
  }

  // ── Timeline de eventos ───────────────────────────────────────

  function EventTimeline() {
    if (events.length === 0) return null
    return (
      <div className="px-4 py-3 border-t bg-gray-50/60">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Actividad</p>
        <div className="space-y-1.5">
          {events.map(ev => (
            <div key={ev.id} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
              <span className="text-xs text-gray-500 flex-1">{eventLabel(ev.event_type)}</span>
              <span className="text-[10px] text-gray-300">{msgTime(ev.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Render mensajes ───────────────────────────────────────────

  function MessageBubble({ msg }: { msg: Message }) {
    const isOut  = msg.direction === 'outbound'
    const isNote = msg.direction === 'note'

    if (isNote) {
      return (
        <div className="flex justify-center">
          <div className="max-w-[85%] bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5 text-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <Lock className="h-3 w-3 text-yellow-600" />
              <span className="text-[10px] font-semibold text-yellow-700">Nota interna · {msg.sender_name ?? 'Ejecutivo'}</span>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap break-words">{msg.body}</p>
            <p className="text-[10px] text-yellow-400 mt-1 text-right">{msgTime(msg.created_at)}</p>
          </div>
        </div>
      )
    }

    return (
      <div className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
        <div className={cn(
          'max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
          isOut
            ? selected?.channel === 'whatsapp'
              ? 'bg-[#dcf8c6] text-gray-900'
              : 'bg-blue-500 text-white'
            : 'bg-white border border-gray-200 text-gray-900'
        )}>
          {!isOut && msg.sender_name && (
            <p className="text-[10px] font-semibold text-gray-400 mb-1">{msg.sender_name}</p>
          )}
          {msg.subject && (
            <p className={cn('text-xs font-semibold mb-1', isOut && selected?.channel !== 'whatsapp' ? 'text-blue-100' : 'text-gray-500')}>
              {msg.subject}
            </p>
          )}
          <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>
          <p className={cn('text-[10px] mt-1.5 text-right', isOut ? 'opacity-60' : 'text-gray-400')}>
            {msgTime(msg.created_at)}
          </p>
        </div>
      </div>
    )
  }

  // ── Render principal ──────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ════ Lista de conversaciones ════ */}
      <div className="w-80 flex-shrink-0 border-r flex flex-col bg-white shadow-sm">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              Contact Center
              {totalUnread > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {totalUnread}
                </span>
              )}
            </h2>
            <button
              onClick={() => window.location.reload()}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Recargar"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Filtros canal */}
          <div className="flex gap-1 flex-wrap">
            {(['all', 'whatsapp', 'email', 'phone', 'portal'] as const).map(ch => (
              <button
                key={ch}
                onClick={() => setFilterChannel(ch)}
                className={cn(
                  'px-2 py-1 rounded text-[11px] font-medium transition-colors',
                  filterChannel === ch ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                )}
              >
                {ch === 'all' ? 'Todos' : ch === 'whatsapp' ? 'WA' : ch === 'email' ? 'Email' : ch === 'phone' ? 'Tel' : 'Portal'}
              </button>
            ))}
          </div>

          {/* Filtros secundarios */}
          <div className="flex gap-2">
            {isOpsOrAbove && (
              <button
                onClick={() => setFilterMine(!filterMine)}
                className={cn(
                  'text-[11px] px-2 py-1 rounded transition-colors flex-1',
                  filterMine ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-400 hover:bg-gray-50'
                )}
              >
                {filterMine ? '✓ Mis conversaciones' : 'Todas'}
              </button>
            )}
            <button
              onClick={() => setShowResolved(!showResolved)}
              className={cn(
                'text-[11px] px-2 py-1 rounded transition-colors',
                showResolved ? 'bg-gray-100 text-gray-700 font-medium' : 'text-gray-400 hover:bg-gray-50'
              )}
            >
              {showResolved ? 'Resueltas' : 'Abiertas'}
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Circle className="h-8 w-8 mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Sin conversaciones</p>
            </div>
          ) : (
            filtered.map(conv => <ConvItem key={conv.id} conv={conv} />)
          )}
        </div>
      </div>

      {/* ════ Panel detalle ════ */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header conversación */}
          <div className={cn(
            'px-5 py-3 border-b flex items-start justify-between bg-white shadow-sm',
            priorityConfig[selected.priority ?? 'normal'].bar
          )}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {channelIcon(selected.channel, 'h-4 w-4')}
                <h3 className="font-semibold text-gray-900 text-sm">
                  {getContact(selected)?.full_name ?? getAccount(selected)?.name ?? 'Desconocido'}
                </h3>
                {channelBadge(selected.channel)}
                {/* Prioridad badge */}
                <div className="relative">
                  <button
                    onClick={() => setPriorityMenu(!priorityMenu)}
                    className={cn(
                      'text-[10px] font-semibold border rounded px-1.5 py-0.5 flex items-center gap-0.5 transition-colors hover:opacity-80',
                      priorityConfig[selected.priority ?? 'normal'].badge
                    )}
                  >
                    {selected.priority === 'urgent' && <AlertTriangle className="h-2.5 w-2.5" />}
                    {priorityConfig[selected.priority ?? 'normal'].label}
                    <ChevronDown className="h-2.5 w-2.5" />
                  </button>
                  {priorityMenu && (
                    <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                      {(['low', 'normal', 'high', 'urgent'] as Priority[]).map(p => (
                        <button
                          key={p}
                          onClick={() => handlePriority(selected.id, p)}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span className={cn('w-2 h-2 rounded-full', priorityConfig[p].dot)} />
                          {priorityConfig[p].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Tags */}
                {selected.tags?.map(t => (
                  <span key={t} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                    <Tag className="h-2.5 w-2.5" />{t}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {(() => {
                  const acc     = getAccount(selected)
                  const contact = getContact(selected)
                  if (!acc) return <span className="text-xs text-gray-400">—</span>
                  // Si no hay contacto el nombre de cuenta ya está en el h3, solo mostramos icono enlace
                  return contact ? (
                    <a
                      href={`/accounts/${acc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 transition-colors group"
                    >
                      {acc.name}
                      <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  ) : (
                    <a
                      href={`/accounts/${acc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      Ver perfil
                    </a>
                  )
                })()}
                {selected.channel === 'whatsapp' && (
                  <p className="text-xs text-gray-400">{getContact(selected)?.phone}</p>
                )}
                {selected.channel === 'email' && (
                  <p className="text-xs text-gray-400">{getContact(selected)?.email}</p>
                )}
                {/* SLA: tiempo de espera */}
                {selected.waiting_since && (() => {
                  const w = waitingLabel(selected.waiting_since)
                  return w ? (
                    <span className={cn(
                      'text-[10px] flex items-center gap-0.5 font-medium',
                      w.urgent ? 'text-red-500' : 'text-amber-500'
                    )}>
                      <Clock className="h-3 w-3" />
                      Esperando {w.label}
                    </span>
                  ) : null
                })()}
                {selected.first_response_at && (
                  <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                    <Zap className="h-3 w-3" />
                    1ª resp. {timeAgo(selected.first_response_at)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              {/* Asignar */}
              {isOpsOrAbove && (
                <select
                  value={selected.assigned_to ?? ''}
                  onChange={e => handleAssign(selected.id, e.target.value || null)}
                  className="text-xs border rounded-md px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Sin asignar</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.full_name ?? a.id}</option>
                  ))}
                </select>
              )}
              {/* Resolver / Reabrir */}
              {selected.status === 'resolved' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                  onClick={() => handleReopen(selected.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reabrir
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
                  onClick={() => handleResolve(selected.id)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Resolver
                </Button>
              )}
            </div>
          </div>

          {/* ── Tabs Conversación / Historial ──────────────────── */}
          <div className="flex border-b bg-white shrink-0">
            <button
              onClick={() => setDetailTab('messages')}
              className={cn(
                'px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                detailTab === 'messages'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              )}
            >
              Conversación
            </button>
            <button
              onClick={handleTabHistorial}
              className={cn(
                'px-4 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5',
                detailTab === 'historial'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              )}
            >
              Historial
              {historial.length > 0 && (
                <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 leading-none">
                  {historial.length}
                </span>
              )}
            </button>
          </div>

          {detailTab === 'historial' ? <HistorialPanel /> : (<>

          {/* Área de mensajes */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {loadingMsgs ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">Sin mensajes aún</p>
            ) : (
              messages.filter(m => m.direction !== 'note').map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Timeline de eventos */}
          <EventTimeline />

          {/* Panel de notas internas */}
          <NotesPanel />

          {/* Reply box */}
          {selected.status !== 'resolved' && (
            <div className="border-t bg-white p-4 space-y-2">

              {/* Banner de error de envío */}
              {sendError && (
                <div className={cn(
                  'rounded-lg px-3 py-2.5 text-xs flex items-start gap-2',
                  sendError.type === 'session_expired'
                    ? 'bg-amber-50 border border-amber-200 text-amber-800'
                    : 'bg-red-50 border border-red-200 text-red-700'
                )}>
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    {sendError.type === 'session_expired' ? (
                      <>
                        <p className="font-semibold mb-0.5">Sesión de WhatsApp expirada (ventana de 24 h)</p>
                        <p className="opacity-80">El cliente debe enviarte un mensaje primero para reabrir la sesión. Mientras tanto puedes dejar una <button className="underline font-medium" onClick={() => { setReplyMode('note'); setSendError(null) }}>nota interna</button>.</p>
                      </>
                    ) : (
                      <p>{sendError.msg}</p>
                    )}
                  </div>
                  <button onClick={() => setSendError(null)} className="opacity-50 hover:opacity-100 text-lg leading-none">×</button>
                </div>
              )}

              {/* Tabs responder/nota */}
              <div className="flex gap-1 mb-2">
                <button
                  onClick={() => setReplyMode('reply')}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-md font-medium transition-colors',
                    replyMode === 'reply'
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  )}
                >
                  Responder
                </button>
                <button
                  onClick={() => setReplyMode('note')}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1',
                    replyMode === 'note'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'text-gray-500 hover:bg-gray-100'
                  )}
                >
                  <Lock className="h-3 w-3" />
                  Nota interna
                </button>
              </div>

              {selected.channel === 'email' && replyMode === 'reply' && (
                <input
                  type="text"
                  placeholder="Asunto"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}

              <div className={cn(
                'rounded-lg border transition-colors',
                replyMode === 'note' ? 'border-yellow-300 bg-yellow-50/50' : 'border-gray-200 bg-white'
              )}>
                <Textarea
                  placeholder={
                    replyMode === 'note'
                      ? 'Nota interna (solo visible para el equipo)…'
                      : `Escribe una respuesta por ${selected.channel === 'whatsapp' ? 'WhatsApp' : selected.channel === 'email' ? 'email' : selected.channel === 'portal' ? 'portal web' : 'teléfono'}…`
                  }
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  rows={3}
                  className="border-0 resize-none bg-transparent focus-visible:ring-0 text-sm"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
                  }}
                />
                <div className="flex items-center justify-between px-3 py-2 border-t border-inherit">
                  <p className="text-[10px] text-gray-400">⌘+Enter para enviar</p>
                  <Button
                    size="sm"
                    onClick={handleSend}
                    disabled={sending || !reply.trim()}
                    className={cn(
                      'text-xs h-7 px-4',
                      replyMode === 'note'
                        ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                        : selected.channel === 'whatsapp'
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : ''
                    )}
                  >
                    {sending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : replyMode === 'note' ? 'Guardar nota' : 'Enviar'
                    }
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Si está resuelta — banner */}
          {selected.status === 'resolved' && (
            <div className="border-t bg-green-50 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Conversación resuelta</span>
                {selected.resolved_at && (
                  <span className="text-xs text-green-500">{timeAgo(selected.resolved_at)}</span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                onClick={() => handleReopen(selected.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reabrir
              </Button>
            </div>
          )}
          </>)}
        </div>

      ) : (
        /* Empty state */
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400 max-w-xs">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
              <MessageCircle className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500 mb-1">Selecciona una conversación</p>
            <p className="text-xs text-gray-400">
              {conversations.filter(c => c.status !== 'resolved').length} conversaciones abiertas
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
