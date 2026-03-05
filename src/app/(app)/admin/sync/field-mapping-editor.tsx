'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Save, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveSyncFieldMapping, deleteSyncFieldMapping } from '@/app/actions/sync-actions'
import type { SyncFieldMapping } from '@/types/database.types'

interface Props {
  initialMappings: SyncFieldMapping[]
}

type EntityType = 'account' | 'contact' | 'policy' | 'receipt'

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'account', label: 'Cuenta' },
  { value: 'contact', label: 'Contacto' },
  { value: 'policy',  label: 'Póliza'   },
  { value: 'receipt', label: 'Recibo'   },
]

const LOCAL_FIELDS: Record<EntityType, string[]> = {
  account: [
    'external_id', 'name', 'email', 'phone', 'rfc', 'type',
  ],
  contact: [
    'external_id', '_account_external_id', 'full_name', 'email',
  ],
  policy: [
    'external_id', '_account_external_id',
    'policy_number', 'branch', 'subramo', 'insurer',
    'premium', 'start_date', 'end_date', 'status',
    'concepto', 'conducto_cobro', 'comision_total', 'payment_frequency',
  ],
  receipt: [
    'receipt_number', '_policy_external_id',
    'amount', 'due_date', 'status', 'payment_number',
  ],
}

const REFERENCE_TYPES: Record<string, string> = {
  'branch':       'Ramo (usa mapeo de referencias)',
  'status':       'Estatus (usa mapeo de referencias)',
  'conducto':     'Conducto de cobro (usa mapeo de referencias)',
  'payment_freq': 'Frecuencia de pago (usa mapeo de referencias)',
  'agent':        'Agente ejecutivo (usa mapeo de referencias)',
}

interface DraftMapping {
  id:            string | null   // null = nuevo
  entity_type:   EntityType
  external_field: string
  local_field:    string
  allow_override: boolean
  transform:      string         // JSON string
  is_active:      boolean
}

function newDraft(): DraftMapping {
  return {
    id:             null,
    entity_type:    'policy',
    external_field: '',
    local_field:    '',
    allow_override: false,
    transform:      '',
    is_active:      true,
  }
}

export function FieldMappingEditor({ initialMappings }: Props) {
  const [mappings, setMappings] = useState<DraftMapping[]>(
    initialMappings.map(m => ({
      id:             m.id,
      entity_type:    m.entity_type as EntityType,
      external_field: m.external_field,
      local_field:    m.local_field,
      allow_override: m.allow_override,
      transform:      m.transform ? JSON.stringify(m.transform) : '',
      is_active:      m.is_active,
    }))
  )
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function addRow() {
    setMappings(prev => [...prev, newDraft()])
  }

  function updateRow(index: number, field: keyof DraftMapping, value: unknown) {
    setMappings(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m))
  }

  function removeRow(index: number) {
    setMappings(prev => prev.filter((_, i) => i !== index))
  }

  async function handleDeleteSaved(index: number, id: string) {
    startTransition(async () => {
      try {
        await deleteSyncFieldMapping(id)
        setMappings(prev => prev.filter((_, i) => i !== index))
        setMessage({ type: 'success', text: 'Mapeo eliminado.' })
      } catch (e) {
        setMessage({ type: 'error', text: (e as Error).message })
      }
    })
  }

  async function handleSaveAll() {
    setMessage(null)
    startTransition(async () => {
      let savedCount = 0
      const errors: string[] = []

      for (const m of mappings) {
        if (!m.external_field.trim() || !m.local_field.trim()) continue

        let transform: Record<string, string> | null = null
        if (m.transform.trim()) {
          try {
            transform = JSON.parse(m.transform.trim())
          } catch {
            errors.push(`JSON inválido en campo "${m.external_field}": ${m.transform}`)
            continue
          }
        }

        try {
          await saveSyncFieldMapping(m.id, {
            entity_type:    m.entity_type,
            external_field: m.external_field.trim(),
            local_field:    m.local_field.trim(),
            allow_override: m.allow_override,
            transform,
            is_active:      m.is_active,
            notes:          null,
          })
          savedCount++
        } catch (e) {
          errors.push(`Error en "${m.external_field}": ${(e as Error).message}`)
        }
      }

      if (errors.length > 0) {
        setMessage({ type: 'error', text: `${savedCount} guardados. Errores: ${errors.join(' | ')}` })
      } else {
        setMessage({ type: 'success', text: `${savedCount} mapeos guardados exitosamente.` })
      }
    })
  }

  const byEntity = ENTITY_TYPES.map(e => ({
    ...e,
    rows: mappings
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.entity_type === e.value),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-600">
            Configura qué columna de la BD externa corresponde a cada campo local.
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Para campos que usan tablas de referencia (ramo, estatus, agente), usa{' '}
            <code className="bg-gray-100 px-1 rounded">{"{ \"__ref\": \"branch\" }"}</code> en Transform.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={handleSaveAll} disabled={isPending}>
          <Save className="h-4 w-4" />
          Guardar todo
        </Button>
      </div>

      {message && (
        <div className={[
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          message.type === 'success'
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-red-700 bg-red-50 border-red-200',
        ].join(' ')}>
          {message.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          {message.text}
        </div>
      )}

      {byEntity.map(({ value: entityType, label, rows }) => (
        <div key={entityType} className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
            <span className="text-xs text-gray-400">{rows.length} campos mapeados</span>
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400 italic">
              Sin mapeos para {label.toLowerCase()}. Agrega uno abajo.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left text-gray-400 font-medium w-1/4">Columna externa</th>
                  <th className="px-3 py-2 text-left text-gray-400 font-medium w-1/4">Campo local</th>
                  <th className="px-3 py-2 text-left text-gray-400 font-medium">Transform (JSON)</th>
                  <th className="px-3 py-2 text-center text-gray-400 font-medium w-20">Override</th>
                  <th className="px-3 py-2 text-center text-gray-400 font-medium w-16">Activo</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ m, i }) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5">
                      <input
                        value={m.external_field}
                        onChange={e => updateRow(i, 'external_field', e.target.value)}
                        placeholder="ej. POLIZA_ID"
                        className="w-full border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        list={`local-fields-${entityType}`}
                        value={m.local_field}
                        onChange={e => updateRow(i, 'local_field', e.target.value)}
                        placeholder="ej. external_id"
                        className="w-full border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 font-mono text-xs"
                      />
                      <datalist id={`local-fields-${entityType}`}>
                        {LOCAL_FIELDS[entityType].map(f => <option key={f} value={f} />)}
                      </datalist>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={m.transform}
                        onChange={e => updateRow(i, 'transform', e.target.value)}
                        placeholder={'{"__ref":"branch"} o {"A":"active"}'}
                        className="w-full border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={m.allow_override}
                        onChange={e => updateRow(i, 'allow_override', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-slate-700 focus:ring-slate-300"
                        title={m.allow_override ? 'Externo puede sobreescribir' : 'Solo siembra si vacío'}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={m.is_active}
                        onChange={e => updateRow(i, 'is_active', e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-slate-700 focus:ring-slate-300"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => m.id
                          ? handleDeleteSaved(i, m.id)
                          : removeRow(i)
                        }
                        disabled={isPending}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                        title="Eliminar mapeo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Transform help */}
      <div className="rounded-lg border bg-blue-50 border-blue-200 px-4 py-3 text-xs text-blue-700 space-y-1">
        <p className="font-medium">Guía de Transform:</p>
        <ul className="space-y-0.5 list-disc list-inside text-blue-600">
          {Object.entries(REFERENCE_TYPES).map(([key, desc]) => (
            <li key={key}>
              <code className="bg-blue-100 px-1 rounded">{`{"__ref":"${key}"}`}</code> → {desc}
            </li>
          ))}
          <li>
            <code className="bg-blue-100 px-1 rounded">{'{"VIGENTE":"active","CANCELADA":"cancelled"}'}</code> → Mapeo de enum directo
          </li>
        </ul>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={addRow}
      >
        <Plus className="h-4 w-4" />
        Agregar mapeo
      </Button>
    </div>
  )
}
