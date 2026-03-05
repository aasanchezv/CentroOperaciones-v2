'use client'

import { useState, useTransition } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2, Copy, Trophy, XCircle } from 'lucide-react'
import {
  createQuotationStage,
  updateQuotationStage,
  deleteQuotationStage,
  reorderQuotationStages,
  copyGlobalStagesToTeam,
} from '@/app/actions/quotation-stage-actions'
import type { QuotationStage } from '@/types/database.types'

// ─── Types ──────────────────────────────────────────────────

interface Team {
  id:   string
  name: string
}

interface Props {
  globalStages: QuotationStage[]
  byTeam:       Record<string, QuotationStage[]>
  teams:        Team[]
}

// ─── Color palette ───────────────────────────────────────────

const COLORS = [
  { id: 'gray',    label: 'Gris',    dot: 'bg-gray-400'    },
  { id: 'amber',   label: 'Ámbar',   dot: 'bg-amber-400'   },
  { id: 'blue',    label: 'Azul',    dot: 'bg-blue-500'    },
  { id: 'violet',  label: 'Violeta', dot: 'bg-violet-500'  },
  { id: 'emerald', label: 'Verde',   dot: 'bg-emerald-500' },
  { id: 'orange',  label: 'Naranja', dot: 'bg-orange-400'  },
  { id: 'red',     label: 'Rojo',    dot: 'bg-red-500'     },
] as const

type ColorId = typeof COLORS[number]['id']

// ─── SortableStageRow ────────────────────────────────────────

function SortableStageRow({
  stage,
  onUpdate,
  onDelete,
}: {
  stage:    QuotationStage
  onUpdate: (id: string, field: string, value: unknown) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const currentColor = COLORS.find(c => c.id === stage.color) ?? COLORS[0]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Nombre editable */}
      <input
        type="text"
        defaultValue={stage.name}
        onBlur={e => {
          const v = e.target.value.trim()
          if (v && v !== stage.name) onUpdate(stage.id, 'name', v)
        }}
        className="flex-1 min-w-0 text-sm font-medium text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-0.5 transition-colors"
      />

      {/* Color selector */}
      <div className="relative">
        <select
          value={stage.color}
          onChange={e => onUpdate(stage.id, 'color', e.target.value)}
          className="appearance-none pl-6 pr-2 py-1 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-gray-400 cursor-pointer"
        >
          {COLORS.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <span className={`absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${currentColor.dot} pointer-events-none`} />
      </div>

      {/* Toggle is_won */}
      <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Cuenta como ganada en estadísticas">
        <input
          type="checkbox"
          checked={stage.is_won}
          onChange={e => onUpdate(stage.id, 'is_won', e.target.checked)}
          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <Trophy className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs text-gray-500 hidden sm:block">Ganada</span>
      </label>

      {/* Toggle is_lost */}
      <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Cuenta como perdida en estadísticas">
        <input
          type="checkbox"
          checked={stage.is_lost}
          onChange={e => onUpdate(stage.id, 'is_lost', e.target.checked)}
          className="rounded border-gray-300 text-red-600 focus:ring-red-500"
        />
        <XCircle className="h-3.5 w-3.5 text-red-400" />
        <span className="text-xs text-gray-500 hidden sm:block">Perdida</span>
      </label>

      {/* Toggle activo */}
      <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Stage activo">
        <input
          type="checkbox"
          checked={stage.is_active}
          onChange={e => onUpdate(stage.id, 'is_active', e.target.checked)}
          className="rounded border-gray-300 text-gray-900 focus:ring-gray-700"
        />
        <span className="text-xs text-gray-400 hidden sm:block">Activo</span>
      </label>

      {/* Borrar */}
      <button
        onClick={() => {
          if (confirm(`¿Eliminar el stage "${stage.name}"? Las cotizaciones en este stage quedarán sin stage asignado.`)) {
            onDelete(stage.id)
          }
        }}
        className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
        title="Eliminar stage"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── StageList ───────────────────────────────────────────────

function StageList({
  stages,
  teamId,
  teamName,
  hasOwnStages,
}: {
  stages:       QuotationStage[]
  teamId:       string | null
  teamName:     string
  hasOwnStages: boolean
}) {
  const [items, setItems]           = useState<QuotationStage[]>(stages)
  const [isPending, startTransition] = useTransition()
  const [newName, setNewName]       = useState('')
  const [addError, setAddError]     = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = items.findIndex(s => s.id === active.id)
    const newIdx = items.findIndex(s => s.id === over.id)
    const reordered = arrayMove(items, oldIdx, newIdx)
    setItems(reordered)

    startTransition(async () => {
      await reorderQuotationStages(reordered.map(s => s.id))
    })
  }

  function handleUpdate(id: string, field: string, value: unknown) {
    setItems(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    startTransition(async () => {
      await updateQuotationStage(id, { [field]: value } as Parameters<typeof updateQuotationStage>[1])
    })
  }

  function handleDelete(id: string) {
    setItems(prev => prev.filter(s => s.id !== id))
    startTransition(async () => {
      await deleteQuotationStage(id)
    })
  }

  async function handleAdd() {
    const name = newName.trim() || 'Nuevo stage'
    setNewName('')
    setAddError(null)
    try {
      await createQuotationStage(teamId, { name })
      window.location.reload()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Error al crear el stage')
    }
  }

  async function handleCopyGlobal() {
    if (!teamId) return
    if (!confirm(`¿Copiar los stages globales al equipo "${teamName}"? Los stages actuales del equipo serán reemplazados.`)) return
    startTransition(async () => {
      await copyGlobalStagesToTeam(teamId)
    })
  }

  return (
    <div className="space-y-3">
      {/* Banner: usa globales */}
      {!hasOwnStages && teamId && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-700">
            Este equipo usa los stages globales. Personaliza para crear stages propios.
          </p>
          <button
            type="button"
            onClick={handleCopyGlobal}
            disabled={isPending}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900 disabled:opacity-40 shrink-0 ml-4"
          >
            <Copy className="h-3.5 w-3.5" />
            Personalizar
          </button>
        </div>
      )}

      {/* Lista DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map(stage => (
              <SortableStageRow
                key={stage.id}
                stage={stage}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Añadir stage */}
      {addError && (
        <p className="text-xs text-red-500">{addError}</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Nombre del nuevo stage…"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Añadir
        </button>
      </div>
    </div>
  )
}

// ─── QuotationStagesAdmin (main export) ─────────────────────

export function QuotationStagesAdmin({ globalStages, byTeam, teams }: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  const currentTeam     = teams.find(t => t.id === selectedTeamId)
  const currentName     = selectedTeamId ? (currentTeam?.name ?? 'Equipo') : 'Global (todos los equipos)'
  const hasOwnStages    = selectedTeamId ? ((byTeam[selectedTeamId]?.length ?? 0) > 0) : true
  const currentStages   = selectedTeamId
    ? (byTeam[selectedTeamId] ?? globalStages)   // fallback a globales para mostrar
    : globalStages

  return (
    <div className="space-y-6">
      {/* Selector de equipo */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">Equipo:</label>
        <select
          value={selectedTeamId ?? ''}
          onChange={e => setSelectedTeamId(e.target.value || null)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
        >
          <option value="">Global (todos los equipos)</option>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><Trophy className="h-3 w-3 text-emerald-400" /> Ganada = cuenta en cierre y KPIs</span>
        <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" /> Perdida = columna con borde rojo</span>
      </div>

      {/* Lista de stages */}
      <StageList
        key={selectedTeamId ?? 'global'}  // re-mount al cambiar equipo
        stages={currentStages}
        teamId={selectedTeamId}
        teamName={currentName}
        hasOwnStages={hasOwnStages}
      />
    </div>
  )
}
