'use client'

import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, GripVertical, ChevronDown, ChevronRight, X, Building2, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  createMovementType,
  updateMovementType,
  deleteMovementType,
  reorderMovementTypes,
  type MovementTypeInput,
} from '@/app/actions/movement-actions'
import type { MovementType, MovementFieldDef } from '@/types/database.types'

// ─── Constants ────────────────────────────────────────────────

const CODE_OPTIONS = [
  { value: 'alta',             label: 'Alta' },
  { value: 'baja',             label: 'Baja' },
  { value: 'modificacion',     label: 'Modificación' },
  { value: 'cambio_cobertura', label: 'Cambio de cobertura' },
  { value: 'otro',             label: 'Otro' },
]

const FIELD_TYPES = [
  { value: 'text',     label: 'Texto' },
  { value: 'number',   label: 'Número' },
  { value: 'date',     label: 'Fecha' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'select',   label: 'Lista' },
]

const codeColors: Record<string, string> = {
  alta:             'bg-emerald-100 text-emerald-700',
  baja:             'bg-red-100 text-red-700',
  modificacion:     'bg-blue-100 text-blue-700',
  cambio_cobertura: 'bg-amber-100 text-amber-700',
  otro:             'bg-gray-100 text-gray-600',
}

// ─── Field Builder ────────────────────────────────────────────

type FieldDraft = MovementFieldDef & { _id: string }

function genId() { return Math.random().toString(36).slice(2, 9) }

function slugify(str: string) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

interface FieldBuilderProps {
  fields:    FieldDraft[]
  onChange:  (fields: FieldDraft[]) => void
}

function FieldBuilder({ fields, onChange }: FieldBuilderProps) {
  function addField() {
    onChange([...fields, {
      _id: genId(), key: '', label: '', type: 'text', required: true,
    }])
  }

  function removeField(id: string) {
    onChange(fields.filter(f => f._id !== id))
  }

  function updateField(id: string, patch: Partial<FieldDraft>) {
    onChange(fields.map(f => {
      if (f._id !== id) return f
      const updated = { ...f, ...patch }
      // Auto-generate key from label if key hasn't been manually set
      if (patch.label !== undefined && !patch.key) {
        updated.key = slugify(patch.label)
      }
      return updated
    }))
  }

  return (
    <div className="space-y-2">
      {fields.map((field, idx) => (
        <div key={field._id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono w-4 shrink-0">{idx + 1}</span>
            <input
              value={field.label}
              onChange={e => updateField(field._id, { label: e.target.value })}
              placeholder="Etiqueta del campo"
              className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400"
            />
            <select
              value={field.type}
              onChange={e => updateField(field._id, { type: e.target.value as MovementFieldDef['type'] })}
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-orange-400"
            >
              {FIELD_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
              <input
                type="checkbox"
                checked={field.required}
                onChange={e => updateField(field._id, { required: e.target.checked })}
                className="rounded"
              />
              Requerido
            </label>
            <button
              onClick={() => removeField(field._id)}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {field.type === 'select' && (
            <div className="ml-5">
              <input
                value={(field.options ?? []).join(', ')}
                onChange={e => updateField(field._id, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })}
                placeholder="Opciones separadas por coma (ej: Sí, No, N/A)"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400"
              />
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addField}
        className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar campo
      </button>
    </div>
  )
}

// ─── Type Dialog ──────────────────────────────────────────────

const emptyForm = (): { name: string; code: string; description: string; affects_premium: boolean; company_only: boolean; fields: FieldDraft[] } => ({
  name:            '',
  code:            'modificacion',
  description:     '',
  affects_premium: false,
  company_only:    false,
  fields:          [],
})

interface TypeDialogProps {
  open:        boolean
  onClose:     () => void
  editingType: MovementType | null
}

function TypeDialog({ open, onClose, editingType }: TypeDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(() => {
    if (editingType) {
      return {
        name:            editingType.name,
        code:            editingType.code,
        description:     editingType.description ?? '',
        affects_premium: editingType.affects_premium,
        company_only:    editingType.company_only,
        fields:          (editingType.custom_fields ?? []).map(f => ({ ...f, _id: genId() })) as FieldDraft[],
      }
    }
    return emptyForm()
  })

  // Reset on open
  useState(() => {
    if (open) {
      setError(null)
      setForm(editingType ? {
        name:            editingType.name,
        code:            editingType.code,
        description:     editingType.description ?? '',
        affects_premium: editingType.affects_premium,
        company_only:    editingType.company_only,
        fields:          (editingType.custom_fields ?? []).map(f => ({ ...f, _id: genId() })) as FieldDraft[],
      } : emptyForm())
    }
  })

  function handleSubmit() {
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    setError(null)

    const input: MovementTypeInput = {
      name:            form.name.trim(),
      code:            form.code,
      description:     form.description.trim() || null,
      custom_fields:   form.fields.map(({ _id, ...f }) => f),
      affects_premium: form.affects_premium,
      company_only:    form.company_only,
    }

    startTransition(async () => {
      const result = editingType
        ? await updateMovementType(editingType.id, input)
        : await createMovementType(input)

      if ('error' in result) {
        setError(result.error)
        return
      }
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!isPending && !v) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingType ? 'Editar tipo de movimiento' : 'Nuevo tipo de movimiento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Nombre *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Alta de empleado"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>

          {/* Code + Description */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Categoría *</label>
              <select
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-orange-400"
              >
                {CODE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 col-span-1">
              <label className="text-xs font-medium text-gray-600">Descripción</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descripción breve"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.affects_premium}
                onChange={e => setForm(f => ({ ...f, affects_premium: e.target.checked }))}
                className="rounded"
              />
              <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
              Afecta prima
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.company_only}
                onChange={e => setForm(f => ({ ...f, company_only: e.target.checked }))}
                className="rounded"
              />
              <Building2 className="h-3.5 w-3.5 text-blue-500" />
              Solo empresas
            </label>
          </div>

          {/* Field Builder */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Campos del formulario
            </label>
            <FieldBuilder
              fields={form.fields}
              onChange={fields => setForm(f => ({ ...f, fields }))}
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {isPending ? 'Guardando…' : editingType ? 'Guardar cambios' : 'Crear tipo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ───────────────────────────────────────────

interface Props {
  initialTypes: MovementType[]
}

export function MovementTypesAdmin({ initialTypes }: Props) {
  const [types, setTypes]           = useState(initialTypes)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing]       = useState<MovementType | null>(null)
  const [, startTransition]         = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function openNew()  { setEditing(null); setDialogOpen(true) }
  function openEdit(t: MovementType) { setEditing(t); setDialogOpen(true) }
  function closeDialog() { setDialogOpen(false); setEditing(null) }

  function handleDelete(id: string) {
    setDeleteError(null)
    startTransition(async () => {
      const result = await deleteMovementType(id)
      if ('error' in result) {
        setDeleteError(result.error)
        return
      }
      setTypes(prev => prev.filter(t => t.id !== id))
    })
  }

  function handleToggleActive(type: MovementType) {
    startTransition(async () => {
      await updateMovementType(type.id, { is_active: !type.is_active })
      setTypes(prev => prev.map(t => t.id === type.id ? { ...t, is_active: !t.is_active } : t))
    })
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {types.length} tipo{types.length !== 1 ? 's' : ''} configurado{types.length !== 1 ? 's' : ''}
        </p>
        <Button
          onClick={openNew}
          size="sm"
          className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4" /> Nuevo tipo
        </Button>
      </div>

      {deleteError && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
          {deleteError}
        </p>
      )}

      {/* Types list */}
      <div className="bg-white rounded-xl border divide-y">
        {types.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            Sin tipos configurados. Crea el primero.
          </div>
        )}
        {types.map(type => (
          <TypeRow
            key={type.id}
            type={type}
            onEdit={openEdit}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
          />
        ))}
      </div>

      {/* Dialog */}
      {dialogOpen && (
        <TypeDialog
          open={dialogOpen}
          onClose={closeDialog}
          editingType={editing}
        />
      )}
    </div>
  )
}

// ─── Type Row ─────────────────────────────────────────────────

interface TypeRowProps {
  type:           MovementType
  onEdit:         (t: MovementType) => void
  onDelete:       (id: string) => void
  onToggleActive: (t: MovementType) => void
}

function TypeRow({ type, onEdit, onDelete, onToggleActive }: TypeRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`px-4 py-3 ${!type.is_active ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <GripVertical className="h-4 w-4 text-gray-300 shrink-0 cursor-grab" />

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">{type.name}</p>
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${codeColors[type.code] ?? 'bg-gray-100 text-gray-600'}`}>
              {CODE_OPTIONS.find(o => o.value === type.code)?.label ?? type.code}
            </span>
            {type.affects_premium && (
              <span className="inline-flex items-center gap-0.5 text-[11px] bg-amber-50 text-amber-600 border border-amber-200 rounded px-1.5 py-0.5">
                <TrendingUp className="h-2.5 w-2.5" /> Prima
              </span>
            )}
            {type.company_only && (
              <span className="inline-flex items-center gap-0.5 text-[11px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">
                <Building2 className="h-2.5 w-2.5" /> Empresa
              </span>
            )}
          </div>
          {type.description && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{type.description}</p>
          )}
        </div>

        {/* Field count */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 shrink-0"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {type.custom_fields?.length ?? 0} campo{(type.custom_fields?.length ?? 0) !== 1 ? 's' : ''}
        </button>

        {/* Active toggle */}
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={type.is_active}
            onChange={() => onToggleActive(type)}
            className="sr-only peer"
          />
          <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500" />
        </label>

        {/* Edit / Delete */}
        <button
          onClick={() => onEdit(type)}
          className="text-gray-400 hover:text-gray-700 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(type.id)}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded: fields preview */}
      {expanded && (type.custom_fields?.length ?? 0) > 0 && (
        <div className="mt-3 ml-7 space-y-1">
          {type.custom_fields.map((field, idx) => (
            <div key={field.key || idx} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-mono text-gray-300">{idx + 1}.</span>
              <span className="font-medium text-gray-700">{field.label}</span>
              <span className="bg-gray-100 rounded px-1.5 py-0.5">
                {FIELD_TYPES.find(t => t.value === field.type)?.label ?? field.type}
              </span>
              {field.required && <span className="text-red-400 text-[10px]">requerido</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
