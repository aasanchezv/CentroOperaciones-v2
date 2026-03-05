'use client'

import { useState, useTransition } from 'react'
import { X, ArrowLeftRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createMovement } from '@/app/actions/movement-actions'
import type { MovementType, MovementFieldDef } from '@/types/database.types'

// ─── Branch label helper ──────────────────────────────────────

const BRANCH_LABELS: Record<string, string> = {
  gmm: 'GMM', vida: 'Vida', auto: 'Auto', rc: 'RC',
  danos: 'Daños', transporte: 'Transp.', fianzas: 'Fianzas',
  ap: 'AP', tecnicos: 'Técnicos', otro: 'Otro',
}

const BRANCH_COLORS: Record<string, string> = {
  gmm:        'bg-blue-100 text-blue-700',
  vida:       'bg-purple-100 text-purple-700',
  auto:       'bg-orange-100 text-orange-700',
  rc:         'bg-red-100 text-red-700',
  danos:      'bg-yellow-100 text-yellow-700',
  transporte: 'bg-cyan-100 text-cyan-700',
  fianzas:    'bg-indigo-100 text-indigo-700',
  ap:         'bg-pink-100 text-pink-700',
  tecnicos:   'bg-teal-100 text-teal-700',
  otro:       'bg-gray-100 text-gray-600',
}

// ─── Dynamic Field Renderer ───────────────────────────────────

interface DynamicFieldsProps {
  fields:   MovementFieldDef[]
  values:   Record<string, string>
  onChange: (key: string, value: string) => void
}

function DynamicFields({ fields, values, onChange }: DynamicFieldsProps) {
  if (fields.length === 0) {
    return (
      <p className="text-xs text-gray-400 text-center py-4">
        Este tipo de movimiento no requiere campos adicionales.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {fields.map(field => (
        <div key={field.key} className="space-y-1">
          <label className="text-xs font-medium text-gray-600">
            {field.label}
            {field.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {field.type === 'textarea' ? (
            <textarea
              value={values[field.key] ?? ''}
              onChange={e => onChange(field.key, e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-y transition-colors"
              placeholder={field.label}
            />
          ) : field.type === 'select' && field.options ? (
            <select
              value={values[field.key] ?? ''}
              onChange={e => onChange(field.key, e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-400 transition-colors"
            >
              <option value="">Seleccionar…</option>
              {field.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
              value={values[field.key] ?? ''}
              onChange={e => onChange(field.key, e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 transition-colors"
              placeholder={field.label}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

interface PolicyInfo {
  id:           string
  policy_number: string | null
  branch:       string
  insurer:      string
  account_type: string   // 'empresa' | 'persona_fisica'
}

interface Props {
  open:         boolean
  onClose:      () => void
  policy:       PolicyInfo
  movementTypes: MovementType[]
}

export function NewMovementSheet({ open, onClose, policy, movementTypes }: Props) {
  const [isPending, startTransition] = useTransition()
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [fieldValues,    setFieldValues]    = useState<Record<string, string>>({})
  const [notes,          setNotes]          = useState('')
  const [error,          setError]          = useState<string | null>(null)
  const [success,        setSuccess]        = useState(false)

  // Filter types: exclude company_only if not empresa
  const availableTypes = movementTypes.filter(t => {
    if (!t.is_active) return false
    if (t.company_only && policy.account_type !== 'empresa') return false
    return true
  })

  const selectedType = availableTypes.find(t => t.id === selectedTypeId) ?? null

  function handleFieldChange(key: string, value: string) {
    setFieldValues(prev => ({ ...prev, [key]: value }))
  }

  function handleTypeChange(typeId: string) {
    setSelectedTypeId(typeId)
    setFieldValues({})
    setError(null)
  }

  function handleClose() {
    setSelectedTypeId('')
    setFieldValues({})
    setNotes('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  function handleSubmit() {
    if (!selectedTypeId) { setError('Selecciona un tipo de movimiento'); return }

    // Validate required fields
    if (selectedType) {
      for (const field of selectedType.custom_fields) {
        if (field.required && !fieldValues[field.key]?.trim()) {
          setError(`El campo "${field.label}" es requerido`)
          return
        }
      }
    }

    setError(null)
    startTransition(async () => {
      const result = await createMovement({
        policy_id:        policy.id,
        movement_type_id: selectedTypeId,
        field_values:     fieldValues,
        notes:            notes.trim() || undefined,
      })

      if ('error' in result) {
        setError(result.error)
        return
      }

      setSuccess(true)
      setTimeout(() => { handleClose() }, 1500)
    })
  }

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={handleClose}
      />

      {/* Sheet */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-orange-500" />
            <h2 className="text-base font-semibold text-gray-900">Nuevo movimiento</h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Policy badge */}
        <div className="px-5 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${BRANCH_COLORS[policy.branch] ?? 'bg-gray-100 text-gray-600'}`}>
              {BRANCH_LABELS[policy.branch] ?? policy.branch}
            </span>
            <span className="text-sm text-gray-700 font-mono font-medium">
              {policy.insurer}
              {policy.policy_number ? ` · ${policy.policy_number}` : ''}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {success ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-emerald-700">
              <CheckCircle2 className="h-10 w-10" />
              <p className="text-sm font-medium">Movimiento creado. Se generó una tarea de seguimiento.</p>
            </div>
          ) : (
            <>
              {/* Type selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  Tipo de movimiento *
                </label>
                <select
                  value={selectedTypeId}
                  onChange={e => handleTypeChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-400 transition-colors"
                >
                  <option value="">Seleccionar tipo…</option>
                  {availableTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {selectedType?.description && (
                  <p className="text-xs text-gray-400">{selectedType.description}</p>
                )}
              </div>

              {/* Dynamic fields */}
              {selectedType && (
                <DynamicFields
                  fields={selectedType.custom_fields}
                  values={fieldValues}
                  onChange={handleFieldChange}
                />
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">Notas adicionales</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Comentarios opcionales sobre este movimiento…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-y transition-colors"
                />
              </div>

              {error && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-5 py-4 border-t bg-white flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !selectedTypeId}
              className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear movimiento
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
