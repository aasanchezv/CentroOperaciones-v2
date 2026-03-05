'use client'

import { useState, useTransition } from 'react'
import { logCallAttempt, advanceStage } from '@/app/actions/renewal-actions'
import { Button }   from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import { Mail, MessageCircle, PhoneCall, ChevronRight, Loader2, CheckCircle2, Eye, Send } from 'lucide-react'

interface Stage {
  id: string
  name: string
  sort_order: number
  send_email: boolean
  send_whatsapp: boolean
  requires_new_policy: boolean
}

interface Props {
  renewalId: string
  stage: Stage | null
  hasNewPolicy: boolean
  callAttempts: number
  clientConfirmed: boolean
  accountId: string
  policyId: string
  emailSentAt: string | null
  whatsappSentAt: string | null
}

function sentLabel(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  return isToday
    ? `Enviado hoy ${time}`
    : `Enviado ${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} ${time}`
}

export function RenewalStageActions({
  renewalId,
  stage,
  hasNewPolicy,
  callAttempts,
  clientConfirmed,
  emailSentAt,
  whatsappSentAt,
}: Props) {
  const [, startTransition] = useTransition()
  const [sendingEmail, setSendingEmail]       = useState(false)
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [callNotes, setCallNotes]             = useState('')
  const [showCallInput, setShowCallInput]     = useState(false)
  const [loggingCall, setLoggingCall]         = useState(false)

  const [localEmailSentAt, setLocalEmailSentAt]       = useState(emailSentAt)
  const [localWhatsAppSentAt, setLocalWhatsAppSentAt] = useState(whatsappSentAt)

  // Email preview state
  const [previewOpen, setPreviewOpen]     = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData]     = useState<{ subject: string; html: string; to: string | null; toName: string } | null>(null)

  if (!stage) return null

  async function handleNotify(channel: 'email' | 'whatsapp') {
    if (channel === 'email') setSendingEmail(true)
    else setSendingWhatsApp(true)

    try {
      const res = await fetch(`/api/renewals/${renewalId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Error al enviar')
      }
      const now = new Date().toISOString()
      if (channel === 'email') { setLocalEmailSentAt(now); setPreviewOpen(false) }
      else setLocalWhatsAppSentAt(now)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      if (channel === 'email') setSendingEmail(false)
      else setSendingWhatsApp(false)
    }
  }

  async function handleEmailPreview() {
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/renewals/${renewalId}/preview`)
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Error al generar vista previa')
      }
      const data = await res.json() as { subject: string; html: string; to: string | null; toName: string }
      setPreviewData(data)
      setPreviewOpen(true)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setPreviewLoading(false)
    }
  }

  function handleLogCall() {
    if (!callNotes.trim()) return
    setLoggingCall(true)
    startTransition(async () => {
      try {
        await logCallAttempt(renewalId, callNotes)
        setCallNotes('')
        setShowCallInput(false)
      } catch (e) {
        alert((e as Error).message)
      } finally {
        setLoggingCall(false)
      }
    })
  }

  function handleAdvance() {
    startTransition(async () => {
      try {
        await advanceStage(renewalId)
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  const canEmail    = stage.send_email    && (!stage.requires_new_policy || hasNewPolicy)
  const canWhatsApp = stage.send_whatsapp && (!stage.requires_new_policy || hasNewPolicy)

  return (
    <div className="bg-white rounded-xl border p-5 space-y-4">
      <p className="text-sm font-medium text-gray-700">
        Acciones — <span className="text-blue-600">{stage.name}</span>
      </p>

      {stage.requires_new_policy && !hasNewPolicy && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
          ⚠ Vincule la nueva póliza antes de enviar
        </p>
      )}

      <div className="flex flex-wrap gap-3 items-start">

        {/* ── Correo ── */}
        {stage.send_email && (
          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={previewLoading || !canEmail}
              onClick={handleEmailPreview}
              className="gap-1.5"
            >
              {previewLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Eye className="h-4 w-4" />
              }
              {previewLoading ? 'Cargando…' : 'Ver correo'}
            </Button>
            {localEmailSentAt && (
              <span className="flex items-center gap-1 text-xs text-green-700">
                <CheckCircle2 className="h-3 w-3" />
                {sentLabel(localEmailSentAt)}
              </span>
            )}
          </div>
        )}

        {/* ── WhatsApp ── */}
        {stage.send_whatsapp && (
          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={sendingWhatsApp || !canWhatsApp}
              onClick={() => handleNotify('whatsapp')}
              className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
            >
              {sendingWhatsApp
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <MessageCircle className="h-4 w-4" />
              }
              {sendingWhatsApp ? 'Enviando…' : 'Enviar WhatsApp'}
            </Button>
            {localWhatsAppSentAt && (
              <span className="flex items-center gap-1 text-xs text-green-700">
                <CheckCircle2 className="h-3 w-3" />
                {sentLabel(localWhatsAppSentAt)}
              </span>
            )}
          </div>
        )}

        {/* ── Llamada (stage sin email ni WA) ── */}
        {!stage.send_email && !stage.send_whatsapp && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={callAttempts >= 2}
              onClick={() => setShowCallInput(!showCallInput)}
            >
              <PhoneCall className="h-4 w-4" />
              Registrar llamada {callAttempts > 0 ? `(${callAttempts}/2)` : ''}
            </Button>
            {callAttempts >= 2 && (
              <p className="text-xs text-gray-500 self-center">Máx. 2 intentos registrados</p>
            )}
          </>
        )}

        {/* ── Avanzar stage ── */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAdvance}
          className="gap-1.5 text-gray-400 ml-auto"
        >
          Siguiente stage
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {showCallInput && (
        <div className="space-y-2 pt-1">
          <Textarea
            placeholder="Notas del intento de llamada (respondió, no contestó, buzón…)"
            value={callNotes}
            onChange={e => setCallNotes(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={loggingCall || !callNotes.trim()} onClick={handleLogCall}>
              {loggingCall && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCallInput(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {clientConfirmed && (
        <p className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5" />
          El cliente ya confirmó la recepción de su póliza
        </p>
      )}

      {/* ── Sheet de preview de email ── */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="text-sm font-medium">
              Vista previa del correo
            </SheetTitle>
            {previewData && (
              <div className="space-y-0.5 mt-1">
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Para:</span>{' '}
                  {previewData.toName ? `${previewData.toName} <${previewData.to}>` : (previewData.to ?? '—')}
                </p>
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Asunto:</span> {previewData.subject}
                </p>
              </div>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-auto px-6 py-4">
            {previewData ? (
              <div
                className="prose prose-sm max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: previewData.html }}
              />
            ) : (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            )}
          </div>

          <SheetFooter className="px-6 py-4 border-t flex flex-row gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={sendingEmail}
              onClick={() => handleNotify('email')}
              className="gap-1.5"
            >
              {sendingEmail
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />
              }
              {sendingEmail ? 'Enviando…' : 'Confirmar y enviar'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
