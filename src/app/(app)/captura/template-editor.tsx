'use client'

import { useState, useTransition } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  createTemplate, updateTemplate, deleteTemplate,
  type TemplateField,
} from '@/app/actions/capture-actions'
import { Button }   from '@/components/ui/button'
import { GripVertical, Plus, Trash2, Loader2, X, Share2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

export interface CaptureTemplate {
  id:         string
  name:       string
  fields:     TemplateField[]
  is_shared:  boolean
  created_by: string
  created_at: string
}

interface Props {
  template:      CaptureTemplate | null   // null = creating new
  currentUserId: string
  onClose:       () => void
  onSaved:       (id: string) => void
}

// ─── Sortable field row ───────────────────────────────────────

function FieldRow({
  field, onChange, onDelete,
}: {
  field:    TemplateField
  onChange: (updated: TemplateField) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id })

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 group">
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <input
        value={field.label}
        onChange={e => onChange({ ...field, label: e.target.value })}
        placeholder="Etiqueta (ej. Número de póliza)"
        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-400"
      />

      <select
        value={field.type}
        onChange={e => onChange({ ...field, type: e.target.value as TemplateField['type'] })}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-400 bg-white"
      >
        <option value="text">Texto</option>
        <option value="number">Número</option>
        <option value="date">Fecha</option>
      </select>

      <button
        onClick={onDelete}
        className="text-gray-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── Key generator from label ─────────────────────────────────

function labelToKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    || 'campo'
}

// ─── Main editor ──────────────────────────────────────────────

export function TemplateEditor({ template, currentUserId, onClose, onSaved }: Props) {
  const isOwn = !template || template.created_by === currentUserId

  const [name, setName]         = useState(template?.name ?? '')
  const [isShared, setIsShared] = useState(template?.is_shared ?? false)
  const [fields, setFields]     = useState<TemplateField[]>(
    template?.fields ?? []
  )
  const [saving, setSaving]     = useState(false)
  const [, startTransition]     = useTransition()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setFields(prev => {
        const oldIndex = prev.findIndex(f => f.id === active.id)
        const newIndex = prev.findIndex(f => f.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  function addField() {
    const newField: TemplateField = {
      id:    crypto.randomUUID(),
      key:   `campo_${fields.length + 1}`,
      label: '',
      type:  'text',
    }
    setFields(prev => [...prev, newField])
  }

  function updateField(id: string, updated: TemplateField) {
    setFields(prev => prev.map(f => {
      if (f.id !== id) return f
      // Auto-generate key from label if it hasn't been customized
      return { ...updated, key: labelToKey(updated.label) || f.key }
    }))
  }

  function removeField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id))
  }

  async function handleSave() {
    if (!name.trim() || fields.length === 0) return
    setSaving(true)
    startTransition(async () => {
      try {
        let id: string
        if (template) {
          await updateTemplate(template.id, name, fields, isShared)
          id = template.id
        } else {
          id = await createTemplate(name, fields, isShared)
        }
        onSaved(id)
      } catch (e) {
        alert((e as Error).message)
      } finally {
        setSaving(false)
      }
    })
  }

  async function handleDelete() {
    if (!template) return
    if (!confirm(`¿Eliminar plantilla "${template.name}"?`)) return
    startTransition(async () => {
      try {
        await deleteTemplate(template.id)
        onClose()
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-sm font-semibold text-gray-900">
            {template ? 'Editar plantilla' : 'Nueva plantilla'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Nombre de la plantilla</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ej. Póliza GMM Individual"
              disabled={!isOwn}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400 disabled:bg-gray-50"
            />
          </div>

          {/* Share toggle */}
          {isOwn && (
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setIsShared(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${isShared ? 'bg-gray-900' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-0.5 left-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform ${isShared ? 'translate-x-4' : ''}`} />
              </div>
              <span className="flex items-center gap-1.5 text-sm text-gray-600">
                <Share2 className="h-3.5 w-3.5" />
                Compartir con el equipo
              </span>
            </label>
          )}

          {/* Fields */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-2">
              Campos a extraer
              <span className="ml-1 text-gray-400">({fields.length})</span>
            </label>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 min-h-[40px]">
                  {fields.map(field => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      onChange={updated => updateField(field.id, updated)}
                      onDelete={() => removeField(field.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {isOwn && (
              <button
                onClick={addField}
                className="mt-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Añadir campo
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <div>
            {isOwn && template && (
              <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700">
                Eliminar plantilla
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            {isOwn && (
              <Button
                size="sm"
                disabled={!name.trim() || fields.length === 0 || saving}
                onClick={handleSave}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {template ? 'Guardar cambios' : 'Crear plantilla'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
