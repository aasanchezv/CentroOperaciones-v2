'use client'

import { useState, useRef, useTransition } from 'react'
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react'
import {
  createCollectionTemplate,
  updateCollectionTemplate,
  deleteCollectionTemplate,
  type CollectionTemplate,
} from '@/app/actions/collection-actions'
import {
  COLLECTION_VAR_LABELS, COLLECTION_VAR_GROUPS,
  RENEWAL_VAR_LABELS,    RENEWAL_VAR_GROUPS,
} from '@/lib/collection-vars'
import type { CollectionVars, RenewalVars } from '@/lib/collection-vars'

// ─── Empty form ───────────────────────────────────────────────

const empty = {
  name:                  '',
  type:                  'cobranza' as 'cobranza' | 'renovacion',
  channel:               'both' as 'email' | 'whatsapp' | 'both',
  subject_email:         '',
  body_email:            '',
  body_whatsapp:         '',
  is_shared:             false,
  is_active:             true,
  conducto_cobro_filter: null as string | null,
}

// ─── Chip color map ───────────────────────────────────────────

const CHIP_COLORS: Record<string, string> = {
  indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300',
  blue:    'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300',
  amber:   'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300',
  gray:    'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300',
}

// ─── Form dialog ──────────────────────────────────────────────

type CursorField = 'subject_email' | 'body_email' | 'body_whatsapp'

function TemplateFormDialog({
  template,
  defaultType,
  trigger,
  onClose,
}: {
  template?:    CollectionTemplate
  defaultType?: 'cobranza' | 'renovacion'
  trigger:      React.ReactNode
  onClose?:     () => void
}) {
  const [open, setOpen]           = useState(false)
  const [form, setForm]           = useState<typeof empty>({
    ...empty,
    type: defaultType ?? 'cobranza',
    ...(template ? {
      name:                  template.name,
      type:                  (template.type as 'cobranza' | 'renovacion') ?? 'cobranza',
      channel:               template.channel as 'email' | 'whatsapp' | 'both',
      subject_email:         template.subject_email ?? '',
      body_email:            template.body_email    ?? '',
      body_whatsapp:         template.body_whatsapp ?? '',
      is_shared:             template.is_shared,
      is_active:             template.is_active,
      conducto_cobro_filter: template.conducto_cobro_filter ?? null,
    } : {}),
  })
  const [isPending, startTransition] = useTransition()
  const [error, setError]   = useState<string | null>(null)

  // ── Cursor tracking for variable insertion ─────────────────
  const cursorRef = useRef<{ field: CursorField; start: number; end: number } | null>(null)

  function trackCursor(field: CursorField) {
    return (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const el = e.currentTarget as HTMLTextAreaElement
      cursorRef.current = {
        field,
        start: el.selectionStart ?? 0,
        end:   el.selectionEnd   ?? 0,
      }
    }
  }

  function insertVar(key: string) {
    const tag  = `{${key}}`
    const info = cursorRef.current
    if (!info) {
      // No active field — append to first visible body
      if (showEmail) setForm(f => ({ ...f, body_email: (f.body_email ?? '') + tag }))
      else           setForm(f => ({ ...f, body_whatsapp: (f.body_whatsapp ?? '') + tag }))
      return
    }
    setForm(f => {
      const current = (f[info.field] ?? '') as string
      return { ...f, [info.field]: current.slice(0, info.start) + tag + current.slice(info.end) }
    })
    // Advance cursor ref after insertion
    cursorRef.current = { ...info, start: info.start + tag.length, end: info.start + tag.length }
  }

  function close() {
    setOpen(false)
    setError(null)
    onClose?.()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    if (form.channel !== 'whatsapp' && !form.body_email?.trim()) {
      setError('El cuerpo del correo es requerido'); return
    }
    if (form.channel !== 'email' && !form.body_whatsapp?.trim()) {
      setError('El mensaje de WhatsApp es requerido'); return
    }

    startTransition(async () => {
      try {
        if (template) {
          await updateCollectionTemplate(template.id, {
            name:                  form.name,
            type:                  form.type,
            channel:               form.channel,
            subject_email:         form.subject_email || null,
            body_email:            form.body_email    || null,
            body_whatsapp:         form.body_whatsapp || null,
            is_shared:             form.is_shared,
            is_active:             form.is_active,
            conducto_cobro_filter: form.conducto_cobro_filter,
          })
        } else {
          await createCollectionTemplate({
            name:                  form.name,
            type:                  form.type,
            channel:               form.channel,
            subject_email:         form.subject_email || null,
            body_email:            form.body_email    || null,
            body_whatsapp:         form.body_whatsapp || null,
            is_shared:             form.is_shared,
            is_active:             form.is_active,
            conducto_cobro_filter: form.conducto_cobro_filter,
          })
          setForm({ ...empty, type: defaultType ?? 'cobranza' })
        }
        close()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  const showEmail = form.channel === 'email' || form.channel === 'both'
  const showWA    = form.channel === 'whatsapp' || form.channel === 'both'

  const varGroups = form.type === 'renovacion' ? RENEWAL_VAR_GROUPS   : COLLECTION_VAR_GROUPS
  const varLabels = form.type === 'renovacion'
    ? RENEWAL_VAR_LABELS    as Record<string, string>
    : COLLECTION_VAR_LABELS as Record<string, string>

  return (
    <>
      <span onClick={() => setOpen(true)} className="cursor-pointer">{trigger}</span>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => !isPending && close()} />
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {template ? 'Editar plantilla' : 'Nueva plantilla'}
              </h2>
              {!isPending && (
                <button onClick={close} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
              )}
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto">

                {/* Nombre + tipo + canal */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1 space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Nombre *</label>
                    <input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Aviso de renovación"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Tipo</label>
                    <select
                      value={form.type}
                      onChange={e => setForm(f => ({ ...f, type: e.target.value as 'cobranza' | 'renovacion' }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="cobranza">Cobranza</option>
                      <option value="renovacion">Renovación</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Canal</label>
                    <select
                      value={form.channel}
                      onChange={e => setForm(f => ({ ...f, channel: e.target.value as 'email' | 'whatsapp' | 'both' }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="both">Email + WhatsApp</option>
                      <option value="email">Solo Email</option>
                      <option value="whatsapp">Solo WhatsApp</option>
                    </select>
                  </div>
                </div>

                {/* Conducto de cobro */}
                {form.type === 'cobranza' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Conducto de cobro</label>
                    <select
                      value={form.conducto_cobro_filter ?? 'all'}
                      onChange={e => setForm(f => ({ ...f, conducto_cobro_filter: e.target.value === 'all' ? null : e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="all">Todos los conductos</option>
                      <option value="domiciliado">Domiciliado</option>
                      <option value="no_domiciliado">No domiciliado / Pago directo</option>
                    </select>
                  </div>
                )}

                {/* ── Variables disponibles — D&D ──────────────────────── */}
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 pt-3 pb-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Variables
                    </p>
                    <p className="text-[10px] text-gray-400">
                      Clic para insertar · Arrastra al campo
                    </p>
                  </div>

                  {varGroups.map(group => (
                    <div key={group.label} className="space-y-1">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                        {group.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.keys.map(key => {
                          const label = varLabels[key as string] ?? key
                          return (
                            <button
                              key={key}
                              type="button"
                              draggable
                              onDragStart={e => {
                                e.dataTransfer.setData('text/plain', `{${key}}`)
                                e.dataTransfer.effectAllowed = 'copy'
                              }}
                              onClick={() => insertVar(key as string)}
                              title={label}
                              className={`
                                inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-mono
                                cursor-grab active:cursor-grabbing transition-colors select-none
                                ${CHIP_COLORS[group.color]}
                              `}
                            >
                              {`{${key}}`}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Email fields */}
                {showEmail && (
                  <div className="space-y-3 rounded-xl bg-blue-50 border border-blue-100 p-4">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Correo electrónico</p>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Asunto</label>
                      <input
                        value={form.subject_email ?? ''}
                        onChange={e => setForm(f => ({ ...f, subject_email: e.target.value }))}
                        onSelect={trackCursor('subject_email')}
                        onMouseUp={trackCursor('subject_email')}
                        onKeyUp={trackCursor('subject_email')}
                        onFocus={trackCursor('subject_email')}
                        placeholder={form.type === 'renovacion' ? 'Renovación de su póliza {numero_poliza}' : 'Aviso de pago — póliza {numero_poliza}'}
                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Cuerpo del correo *</label>
                      <textarea
                        rows={6}
                        value={form.body_email ?? ''}
                        onChange={e => setForm(f => ({ ...f, body_email: e.target.value }))}
                        onSelect={trackCursor('body_email')}
                        onMouseUp={trackCursor('body_email')}
                        onKeyUp={trackCursor('body_email')}
                        onFocus={trackCursor('body_email')}
                        placeholder={form.type === 'renovacion'
                          ? `Estimado {nombre},\n\nLe informamos que hemos iniciado el proceso de renovación de su póliza {numero_poliza} con {aseguradora}.\n\nAtentamente,\n{ejecutivo}`
                          : `Estimado {nombre},\n\nLe recordamos que su póliza {numero_poliza} con {aseguradora} tiene una prima de {monto}.\n\nAtentamente,\n{ejecutivo}`
                        }
                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* WhatsApp field */}
                {showWA && (
                  <div className="space-y-3 rounded-xl bg-[#f0fff4] border border-[#c8f0b0] p-4">
                    <p className="text-xs font-semibold text-[#128c7e] uppercase tracking-wide">WhatsApp</p>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Mensaje *</label>
                      <textarea
                        rows={4}
                        value={form.body_whatsapp ?? ''}
                        onChange={e => setForm(f => ({ ...f, body_whatsapp: e.target.value }))}
                        onSelect={trackCursor('body_whatsapp')}
                        onMouseUp={trackCursor('body_whatsapp')}
                        onKeyUp={trackCursor('body_whatsapp')}
                        onFocus={trackCursor('body_whatsapp')}
                        placeholder={form.type === 'renovacion'
                          ? `Hola {nombre}, le informamos que iniciamos la renovación de su póliza con {aseguradora}. Vigencia actual: {vencimiento}. Con gusto le atendemos. — {ejecutivo}`
                          : `Hola {nombre}, le recordamos que su póliza {numero_poliza} con {aseguradora} tiene una prima pendiente de {monto}. Vigencia: {vencimiento}. — {ejecutivo}`
                        }
                        className="w-full rounded-lg border border-[#c8f0b0] bg-white px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#25d366] resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Toggles */}
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_shared}
                      onChange={e => setForm(f => ({ ...f, is_shared: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                    <span className="text-xs text-gray-600">Compartir con el equipo</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                    <span className="text-xs text-gray-600">Activa</span>
                  </label>
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>

              <div className="px-6 py-4 border-t flex justify-end gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  {isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                    : template ? 'Guardar cambios' : 'Crear plantilla'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Delete button ────────────────────────────────────────────

function DeleteTemplateButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const [confirm, setConfirm]        = useState(false)

  if (confirm) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          onClick={() => startTransition(async () => { await deleteCollectionTemplate(id); setConfirm(false) })}
          disabled={isPending}
          className="text-[10px] font-medium text-red-600 hover:underline"
        >
          {isPending ? 'Borrando…' : 'Confirmar'}
        </button>
        <button onClick={() => setConfirm(false)} className="text-[10px] text-gray-400 hover:underline">
          Cancelar
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-gray-300 hover:text-red-400 transition-colors"
      title="Eliminar plantilla"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

// ─── Template table ───────────────────────────────────────────

function conductoBadge(filter: string | null) {
  if (filter === 'domiciliado')    return <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 border-amber-200">Domiciliado</span>
  if (filter === 'no_domiciliado') return <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 border-blue-200">No domiciliado</span>
  return <span className="text-xs text-gray-400">—</span>
}

function TemplateTable({ templates, defaultType }: { templates: CollectionTemplate[]; defaultType: 'cobranza' | 'renovacion' }) {
  const channelLabel: Record<string, string> = {
    email:     'Email',
    whatsapp:  'WhatsApp',
    both:      'Ambos',
  }
  const channelClass: Record<string, string> = {
    email:    'bg-blue-50 text-blue-600 border-blue-200',
    whatsapp: 'bg-[#e7ffd9] text-[#128c7e] border-[#c8f0b0]',
    both:     'bg-purple-50 text-purple-600 border-purple-200',
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TemplateFormDialog
          defaultType={defaultType}
          trigger={
            <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors">
              <Plus className="h-4 w-4" />
              Nueva plantilla
            </button>
          }
        />
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center py-16 text-gray-300">
          <p className="text-sm text-gray-400 font-medium">Sin plantillas aún</p>
          <p className="text-xs mt-1">Crea la primera plantilla arriba</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Canal</th>
                {defaultType === 'cobranza' && (
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conducto</th>
                )}
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Compartida</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${channelClass[t.channel] ?? ''}`}>
                      {channelLabel[t.channel] ?? t.channel}
                    </span>
                  </td>
                  {defaultType === 'cobranza' && (
                    <td className="px-4 py-3">
                      {conductoBadge(t.conducto_cobro_filter)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {t.is_shared ? '✓ Sí' : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${t.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <TemplateFormDialog
                        template={t}
                        trigger={
                          <button className="text-gray-300 hover:text-gray-600 transition-colors" title="Editar">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        }
                      />
                      <DeleteTemplateButton id={t.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main export: tabbed template list ───────────────────────

export function TemplateList({
  cobranzaTemplates,
  renovacionTemplates,
}: {
  cobranzaTemplates:   CollectionTemplate[]
  renovacionTemplates: CollectionTemplate[]
}) {
  const [tab, setTab] = useState<'cobranza' | 'renovacion'>('cobranza')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab('cobranza')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'cobranza'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Cobranza
          <span className="ml-1.5 text-[10px] font-semibold text-gray-400">({cobranzaTemplates.length})</span>
        </button>
        <button
          onClick={() => setTab('renovacion')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'renovacion'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Renovación
          <span className="ml-1.5 text-[10px] font-semibold text-gray-400">({renovacionTemplates.length})</span>
        </button>
      </div>

      {tab === 'cobranza'   && <TemplateTable templates={cobranzaTemplates}   defaultType="cobranza"   />}
      {tab === 'renovacion' && <TemplateTable templates={renovacionTemplates}  defaultType="renovacion" />}
    </div>
  )
}

// Suppress unused import warnings — types are used implicitly via the groups
export type { CollectionVars, RenewalVars }
