'use client'

import { useState, useTransition, useMemo } from 'react'
import { CreditCard, Mail, MessageCircle, Eye, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { sendCollectionNotice, type CollectionTemplate } from '@/app/actions/collection-actions'
import { renderTemplate, formatMXN, formatDate, type CollectionVars } from '@/lib/collection-vars'

// ─── Types ────────────────────────────────────────────────────

interface Policy {
  id:            string
  policy_number: string | null
  insurer:       string | null
  premium:       number | null
  end_date:      string | null
  branch:        string
  contacts?: { full_name: string; email: string | null; phone: string | null } | null
}

interface CobrarDialogProps {
  policy:      Policy
  accountName: string
  executiveName: string
  templates:   CollectionTemplate[]
}

// ─── Component ───────────────────────────────────────────────

export function CobrarDialog({
  policy, accountName, executiveName, templates,
}: CobrarDialogProps) {
  const [open, setOpen]           = useState(false)
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id ?? '')
  const [channels, setChannels]   = useState<Set<'email' | 'whatsapp'>>(new Set(['email', 'whatsapp']))
  const [isPending, startTransition] = useTransition()
  const [result, setResult]       = useState<{ ok: boolean; sent?: string[]; error?: string } | null>(null)

  const tomador = (Array.isArray(policy.contacts)
    ? (policy.contacts as unknown as { full_name: string; email: string | null; phone: string | null }[])[0]
    : policy.contacts) as { full_name: string; email: string | null; phone: string | null } | null

  const selected = templates.find(t => t.id === selectedId)

  // Build vars for preview
  const vars: CollectionVars = useMemo(() => ({
    nombre:        tomador?.full_name ?? 'Cliente',
    monto:         formatMXN(policy.premium),
    numero_poliza: policy.policy_number ?? 'S/N',
    aseguradora:   policy.insurer ?? '—',
    vencimiento:   formatDate(policy.end_date),
    cuenta:        accountName,
    ejecutivo:     executiveName,
    fecha_hoy:     formatDate(new Date().toISOString()),
  }), [tomador, policy, accountName, executiveName])

  const previewWA    = selected?.body_whatsapp ? renderTemplate(selected.body_whatsapp, vars) : null
  const previewEmail = selected?.body_email     ? renderTemplate(selected.body_email,    vars) : null

  const hasEmail = !!tomador?.email
  const hasPhone = !!tomador?.phone
  const canSend  = channels.size > 0 && selectedId

  function toggleChannel(ch: 'email' | 'whatsapp') {
    setChannels(prev => {
      const next = new Set(prev)
      if (next.has(ch)) next.delete(ch)
      else               next.add(ch)
      return next
    })
  }

  function handleSubmit() {
    if (!canSend) return
    setResult(null)
    startTransition(async () => {
      const r = await sendCollectionNotice(
        policy.id,
        selectedId,
        Array.from(channels),
      )
      setResult(r)
      if (r.ok) {
        setTimeout(() => { setOpen(false); setResult(null) }, 1800)
      }
    })
  }

  if (templates.length === 0) return null

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setResult(null) }}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors shrink-0"
      >
        <CreditCard className="h-3.5 w-3.5" />
        Cobrar
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => !isPending && setOpen(false)}
        />
      )}

      {/* Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Cobrar póliza</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {policy.insurer ?? '—'} · {policy.policy_number ?? 'S/N'}
                  {policy.premium && ` · ${formatMXN(policy.premium)}`}
                </p>
              </div>
              {!isPending && (
                <button
                  onClick={() => setOpen(false)}
                  className="text-gray-300 hover:text-gray-500 transition-colors text-lg leading-none"
                >
                  ×
                </button>
              )}
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Template selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Plantilla de cobro</label>
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Preview */}
              {selected && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs font-medium text-gray-600">Vista previa</span>
                  </div>

                  {/* WhatsApp preview */}
                  {previewWA && (
                    <div className="rounded-lg bg-[#e7ffd9] border border-[#c8f0b0] p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <MessageCircle className="h-3.5 w-3.5 text-[#25d366]" />
                        <span className="text-[10px] font-semibold text-[#25d366] uppercase tracking-wide">WhatsApp</span>
                      </div>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{previewWA}</p>
                    </div>
                  )}

                  {/* Email preview */}
                  {previewEmail && (
                    <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Mail className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Correo</span>
                        {selected.subject_email && (
                          <span className="text-[10px] text-gray-400 ml-1">
                            — {renderTemplate(selected.subject_email, vars)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{previewEmail}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Channel toggles */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Enviar por</label>
                <div className="flex gap-2">
                  {/* WhatsApp */}
                  <button
                    type="button"
                    disabled={!hasPhone || !selected?.body_whatsapp}
                    onClick={() => toggleChannel('whatsapp')}
                    className={[
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors flex-1',
                      channels.has('whatsapp') && hasPhone && selected?.body_whatsapp
                        ? 'bg-[#e7ffd9] border-[#25d366] text-[#128c7e]'
                        : 'bg-gray-50 border-gray-200 text-gray-300',
                      (!hasPhone || !selected?.body_whatsapp) && 'opacity-50 cursor-not-allowed',
                    ].join(' ')}
                    title={!hasPhone ? 'El tomador no tiene teléfono registrado' : !selected?.body_whatsapp ? 'Esta plantilla no tiene mensaje de WhatsApp' : undefined}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                    {tomador?.phone && <span className="text-gray-400 font-normal">{tomador.phone}</span>}
                    {!hasPhone && <AlertTriangle className="h-3 w-3 text-amber-400 ml-auto" />}
                  </button>

                  {/* Email */}
                  <button
                    type="button"
                    disabled={!hasEmail || !selected?.body_email}
                    onClick={() => toggleChannel('email')}
                    className={[
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors flex-1',
                      channels.has('email') && hasEmail && selected?.body_email
                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-300',
                      (!hasEmail || !selected?.body_email) && 'opacity-50 cursor-not-allowed',
                    ].join(' ')}
                    title={!hasEmail ? 'El tomador no tiene correo registrado' : !selected?.body_email ? 'Esta plantilla no tiene cuerpo de correo' : undefined}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Correo
                    {tomador?.email && <span className="text-gray-400 font-normal truncate">{tomador.email}</span>}
                    {!hasEmail && <AlertTriangle className="h-3 w-3 text-amber-400 ml-auto" />}
                  </button>
                </div>
              </div>

              {/* Result feedback */}
              {result && (
                <div className={`rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2 ${result.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {result.ok
                    ? <><CheckCircle2 className="h-4 w-4 shrink-0" /> Enviado por {result.sent?.join(' y ')}</>
                    : <><AlertTriangle className="h-4 w-4 shrink-0" /> {result.error}</>
                  }
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSend || isPending || channels.size === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                {isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                  : <><CreditCard className="h-4 w-4" /> Enviar</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
