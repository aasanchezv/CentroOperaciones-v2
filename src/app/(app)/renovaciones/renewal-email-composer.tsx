'use client'

import { useState, useRef, useTransition, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button }   from '@/components/ui/button'
import { Loader2, Paperclip, X, ChevronDown, ChevronUp, Mail } from 'lucide-react'
import { sendRenewalEmail, advanceStage } from '@/app/actions/renewal-actions'
import { renderRenewalTemplate } from '@/lib/collection-vars'
import type { RenewalVars } from '@/lib/collection-vars'

// ─── Types ─────────────────────────────────────────────────────

interface Template {
  id:            string
  name:          string
  subject_email: string | null
  body_email:    string | null
}

export interface RenewalEmailComposerProps {
  open:                 boolean
  onClose:              () => void
  onSent?:              (renewalId: string) => void
  renewalId:            string
  accountName:          string
  stageEmailTemplateId?: string | null
  toEmail?:             string | null
  agentEmail?:          string | null
  templates:            Template[]
  vars:                 Partial<RenewalVars>
  accountContacts?:     { id: string; full_name: string; email: string }[]
}

// ─── Component ─────────────────────────────────────────────────

export function RenewalEmailComposer({
  open,
  onClose,
  onSent,
  renewalId,
  accountName,
  stageEmailTemplateId,
  toEmail,
  agentEmail,
  templates,
  vars,
  accountContacts,
}: RenewalEmailComposerProps) {
  const defaultTemplate = stageEmailTemplateId
    ? templates.find(t => t.id === stageEmailTemplateId)
    : templates[0]

  const defaultSubject = defaultTemplate?.subject_email
    ? renderRenewalTemplate(defaultTemplate.subject_email, vars as RenewalVars)
    : `Renovación de póliza — ${vars.aseguradora ?? 'Aseguradora'}`

  const defaultBody = defaultTemplate?.body_email
    ? renderRenewalTemplate(defaultTemplate.body_email, vars as RenewalVars)
    : `Estimado/a ${vars.nombre ?? 'cliente'},\n\nNos comunicamos con respecto a la renovación de su póliza.\n\nQuedamos a sus órdenes.\n\n${vars.ejecutivo ?? ''}`

  // ── Contact-based recipient selection ──────────────────────
  const contactsWithEmail = (accountContacts ?? []).filter(c => !!c.email)
  const isContactMode     = contactsWithEmail.length > 0

  function getInitPrimaryId(contacts: typeof contactsWithEmail, primaryEmail: string | null | undefined) {
    if (contacts.length === 0) return null
    if (primaryEmail) {
      const match = contacts.find(c => c.email === primaryEmail)
      if (match) return match.id
    }
    return contacts[0].id
  }

  const [selectedIds,  setSelectedIds]  = useState<string[]>(() => {
    const pid = getInitPrimaryId(contactsWithEmail, toEmail)
    return pid ? [pid] : []
  })

  // Derived from selectedIds
  const primaryContact   = contactsWithEmail.find(c => c.id === selectedIds[0]) ?? null
  const extraContactCCs  = selectedIds.slice(1)
    .map(id => contactsWithEmail.find(c => c.id === id)?.email!)
    .filter(Boolean)

  // Effective "to" address
  const toFinal = isContactMode ? (primaryContact?.email ?? '') : undefined

  function toggleContact(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const [to,           setTo]           = useState(toEmail ?? '')
  const [cc,           setCc]           = useState('')
  const [ccSelf,       setCcSelf]       = useState(!!agentEmail)
  const [subject,      setSubject]      = useState(defaultSubject)
  const [body,         setBody]         = useState(defaultBody)
  const [previewOpen,  setPreviewOpen]  = useState(false)
  const [attachment,   setAttachment]   = useState<{ filename: string; base64: string } | null>(null)
  const [sending,      setSending]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [success,      setSuccess]      = useState(false)
  const [,             startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset state when renewal changes
  useEffect(() => {
    if (!open) return
    const cwEmail = (accountContacts ?? []).filter(c => !!c.email)
    const pid = getInitPrimaryId(cwEmail, toEmail)
    setSelectedIds(pid ? [pid] : [])
    setTo(toEmail ?? '')
    setCc('')
    setCcSelf(!!agentEmail)
    setSubject(defaultSubject)
    setBody(defaultBody)
    setAttachment(null)
    setError(null)
    setSuccess(false)
    setPreviewOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, renewalId])

  function handleTemplateChange(templateId: string) {
    const tpl = templates.find(t => t.id === templateId)
    if (!tpl) return
    if (tpl.subject_email) setSubject(renderRenewalTemplate(tpl.subject_email, vars as RenewalVars))
    if (tpl.body_email)    setBody(renderRenewalTemplate(tpl.body_email, vars as RenewalVars))
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setAttachment({ filename: file.name, base64: result.split(',')[1] })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // All CCs: extra selected contacts + agent self-CC + manual CC
  const allCCs = [
    ...extraContactCCs,
    ...(ccSelf && agentEmail ? [agentEmail] : []),
    ...(!ccSelf && cc.trim() ? [cc.trim()] : []),
  ].filter(Boolean)

  async function handleSend() {
    const recipient = isContactMode ? toFinal : to.trim()
    if (!recipient)      { setError('Selecciona un destinatario o escribe un correo'); return }
    if (!subject.trim()) { setError('El asunto no puede estar vacío');  return }
    if (!body.trim())    { setError('El cuerpo del email no puede estar vacío'); return }

    setSending(true)
    setError(null)

    startTransition(async () => {
      const res = await sendRenewalEmail({
        renewalId,
        to:      recipient,
        cc:      allCCs.length > 0 ? allCCs : undefined,
        subject: subject.trim(),
        body:    body.trim(),
        ...(attachment ? { attachment } : {}),
      })

      setSending(false)
      if ('error' in res) {
        setError(res.error)
      } else {
        // Advance to next pipeline stage automatically
        try { await advanceStage(renewalId) } catch { /* no-op if already at last stage */ }
        onSent?.(renewalId)
        setSuccess(true)
        setTimeout(onClose, 1500)
      }
    })
  }

  const previewHtml = body.replace(/\n/g, '<br />')

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-500" />
            Enviar correo — {accountName}
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="text-green-500 text-4xl">✓</div>
            <p className="text-sm font-medium text-gray-700">Correo enviado · etapa avanzada</p>
          </div>
        ) : (
          <div className="space-y-4 pt-5">
            {/* Template selector */}
            {templates.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plantilla</label>
                <select
                  className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                  defaultValue={defaultTemplate?.id ?? ''}
                  onChange={e => handleTemplateChange(e.target.value)}
                >
                  <option value="">Sin plantilla</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Para / Destinatarios */}
            {isContactMode ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Destinatarios
                  <span className="ml-1 font-normal text-gray-400">— el primero va en Para, el resto en CC</span>
                </label>
                <div className="space-y-1.5">
                  {contactsWithEmail.map(contact => {
                    const isSelected = selectedIds.includes(contact.id)
                    const isPrimary  = selectedIds[0] === contact.id
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => toggleContact(contact.id)}
                        className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-xs transition-colors ${
                          isSelected
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && (
                            <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        <span className="flex-1 font-medium text-left truncate">{contact.full_name}</span>
                        <span className="font-mono text-[11px] text-gray-400 truncate">{contact.email}</span>
                        {isSelected && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                            isPrimary ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {isPrimary ? 'Para' : 'CC'}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {!primaryContact && (
                  <p className="text-xs text-amber-600 mt-1.5">Selecciona al menos un destinatario</p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Para</label>
                <input
                  type="email"
                  className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="cliente@email.com"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                />
              </div>
            )}

            {/* CC — toggle mi correo + campo manual */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">CC (copia)</label>

              {/* Toggle "enviar copia a mi correo" */}
              {agentEmail && (
                <button
                  type="button"
                  onClick={() => setCcSelf(v => !v)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-xs transition-colors ${
                    ccSelf
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                    ccSelf ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'
                  }`}>
                    {ccSelf && (
                      <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span className="font-medium">Copiarme a mí</span>
                  <span className="text-[11px] text-gray-400 font-mono truncate">{agentEmail}</span>
                </button>
              )}

              {/* Campo manual CC — solo cuando el toggle está OFF */}
              {!ccSelf && (
                <input
                  type="email"
                  className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="otra@email.com (opcional)"
                  value={cc}
                  onChange={e => setCc(e.target.value)}
                />
              )}
            </div>

            {/* Asunto */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
              <input
                type="text"
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>

            {/* Cuerpo */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuerpo</label>
              <textarea
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                rows={8}
                value={body}
                onChange={e => setBody(e.target.value)}
              />
            </div>

            {/* Adjunto */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Adjunto (opcional)</label>
              {attachment ? (
                <div className="flex items-center gap-2 text-sm text-gray-700 border border-gray-200 rounded-md px-3 py-2 bg-gray-50">
                  <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="flex-1 truncate">{attachment.filename}</span>
                  <button onClick={() => setAttachment(null)} className="text-gray-400 hover:text-red-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-md px-3 py-2 hover:border-gray-400 hover:text-gray-700 transition-colors w-full"
                >
                  <Paperclip className="h-4 w-4" />
                  Seleccionar archivo
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                className="hidden"
                onChange={handleFile}
              />
            </div>

            {/* Vista previa */}
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setPreviewOpen(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Vista previa
                {previewOpen
                  ? <ChevronUp   className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />
                }
              </button>
              {previewOpen && (
                <div
                  className="px-4 py-3 text-sm text-gray-700 bg-gray-50 border-t border-gray-100 leading-relaxed max-h-48 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>
            )}

            {/* Acciones */}
            <div className="flex gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onClose}
                disabled={sending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {sending ? 'Enviando…' : 'Enviar correo'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
