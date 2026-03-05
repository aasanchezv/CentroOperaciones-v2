'use client'

import { Mail, MessageCircle, PhoneCall, CheckCircle2, XCircle, ChevronRight, RefreshCw } from 'lucide-react'

interface Event {
  id: string
  action: string
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  actor_id: string | null
  stage_id: string | null
}

interface Props {
  events: Event[]
}

const actionConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  email_sent:     { label: 'Email enviado',       icon: <Mail className="h-3.5 w-3.5" />,             color: 'text-blue-500 bg-blue-50 border-blue-200' },
  whatsapp_sent:  { label: 'WhatsApp enviado',     icon: <MessageCircle className="h-3.5 w-3.5" />,    color: 'text-green-600 bg-green-50 border-green-200' },
  call_attempted: { label: 'Llamada registrada',   icon: <PhoneCall className="h-3.5 w-3.5" />,       color: 'text-orange-500 bg-orange-50 border-orange-200' },
  confirmed:      { label: 'Cliente confirmó',     icon: <CheckCircle2 className="h-3.5 w-3.5" />,    color: 'text-green-600 bg-green-50 border-green-200' },
  closed:         { label: 'Renovación cerrada',   icon: <XCircle className="h-3.5 w-3.5" />,         color: 'text-gray-500 bg-gray-50 border-gray-200' },
  stage_advanced: { label: 'Stage avanzado',       icon: <ChevronRight className="h-3.5 w-3.5" />,    color: 'text-gray-400 bg-gray-50 border-gray-200' },
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function RenewalTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-5">
        <p className="text-xs font-medium text-gray-500 mb-1">Historial</p>
        <p className="text-sm text-gray-400">Sin actividad registrada</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border p-5">
      <p className="text-xs font-medium text-gray-500 mb-4">Historial de actividad</p>
      <div className="space-y-3">
        {[...events].reverse().map(event => {
          const config = actionConfig[event.action] ?? {
            label: event.action,
            icon: <RefreshCw className="h-3.5 w-3.5" />,
            color: 'text-gray-500 bg-gray-50 border-gray-200',
          }
          const meta = event.metadata
          const attempt = meta?.attempt_number as number | undefined

          return (
            <div key={event.id} className="flex items-start gap-3">
              <span className={`flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full border text-xs ${config.color}`}>
                {config.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">
                  {config.label}
                  {attempt !== undefined && ` (intento ${attempt})`}
                </p>
                {event.notes && (
                  <p className="text-xs text-gray-500 mt-0.5">{event.notes}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{formatTime(event.created_at)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
