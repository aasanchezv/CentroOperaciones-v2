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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  updateRenewalStage,
  createRenewalStage,
  deleteRenewalStage,
  reorderRenewalStages,
  copyGlobalRenewalStagesToTeam,
} from '@/app/actions/renewal-actions'
import { Button }   from '@/components/ui/button'
import { GripVertical, Plus, Trash2, Loader2, Mail, MessageCircle, Lock, Copy } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface Stage {
  id: string
  name: string
  days_before: number
  send_email: boolean
  send_whatsapp: boolean
  requires_new_policy: boolean
  sort_order: number
  is_active: boolean
  email_template_id: string | null
  whatsapp_template_id: string | null
  team_id: string | null
}

interface Template {
  id: string
  name: string
  channel: string
}

interface Team {
  id: string
  name: string
}

interface Props {
  globalStages: Stage[]
  byTeam:       Record<string, Stage[]>
  teams:        Team[]
  templates:    Template[]
}

// ─── Sortable row ─────────────────────────────────────────────

function SortableStageRow({ stage, templates, onUpdate, onDelete }: {
  stage: Stage
  templates: Template[]
  onUpdate: (id: string, field: string, value: unknown) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const emailTemplates = templates.filter(t => t.channel === 'email' || t.channel === 'both')
  const waTemplates    = templates.filter(t => t.channel === 'whatsapp' || t.channel === 'both')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-white ${isDragging ? 'shadow-lg' : 'hover:bg-gray-50/50'}`}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Arrastrar"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Nombre */}
        <input
          className="flex-1 text-sm font-medium text-gray-700 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-gray-400 outline-none px-1 py-0.5 min-w-0"
          defaultValue={stage.name}
          onBlur={e => onUpdate(stage.id, 'name', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />

        {/* Días antes */}
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-14 text-sm text-center text-gray-600 bg-transparent border border-gray-200 rounded px-1.5 py-0.5 focus:border-gray-400 outline-none"
            defaultValue={stage.days_before}
            min={1}
            onBlur={e => onUpdate(stage.id, 'days_before', parseInt(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="text-xs text-gray-400">días</span>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 cursor-pointer" title="Enviar email">
            <input
              type="checkbox"
              className="sr-only"
              defaultChecked={stage.send_email}
              onChange={e => onUpdate(stage.id, 'send_email', e.target.checked)}
            />
            <Mail className={`h-4 w-4 ${stage.send_email ? 'text-blue-500' : 'text-gray-200'}`} />
          </label>
          <label className="flex items-center gap-1 cursor-pointer" title="Enviar WhatsApp">
            <input
              type="checkbox"
              className="sr-only"
              defaultChecked={stage.send_whatsapp}
              onChange={e => onUpdate(stage.id, 'send_whatsapp', e.target.checked)}
            />
            <MessageCircle className={`h-4 w-4 ${stage.send_whatsapp ? 'text-green-500' : 'text-gray-200'}`} />
          </label>
          <label className="flex items-center gap-1 cursor-pointer" title="Requiere nueva póliza">
            <input
              type="checkbox"
              className="sr-only"
              defaultChecked={stage.requires_new_policy}
              onChange={e => onUpdate(stage.id, 'requires_new_policy', e.target.checked)}
            />
            <Lock className={`h-4 w-4 ${stage.requires_new_policy ? 'text-amber-500' : 'text-gray-200'}`} />
          </label>
        </div>

        {/* Activo */}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded"
            defaultChecked={stage.is_active}
            onChange={e => onUpdate(stage.id, 'is_active', e.target.checked)}
          />
          <span className="text-xs text-gray-400">Activo</span>
        </label>

        {/* Borrar */}
        <button
          onClick={() => onDelete(stage.id)}
          className="text-gray-200 hover:text-red-400 transition-colors"
          aria-label="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Template selectors — only when send_email or send_whatsapp */}
      {(stage.send_email || stage.send_whatsapp) && (
        <div className="flex items-center gap-3 px-10 pb-3 pt-0">
          {stage.send_email && (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 text-blue-400 shrink-0" />
              <select
                className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white focus:outline-none focus:border-blue-400 max-w-[200px]"
                value={stage.email_template_id ?? ''}
                onChange={e => onUpdate(stage.id, 'email_template_id', e.target.value || null)}
              >
                <option value="">Plantilla TS (por defecto)</option>
                {emailTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          {stage.send_whatsapp && (
            <div className="flex items-center gap-1.5">
              <MessageCircle className="h-3 w-3 text-green-500 shrink-0" />
              <select
                className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white focus:outline-none focus:border-green-400 max-w-[200px]"
                value={stage.whatsapp_template_id ?? ''}
                onChange={e => onUpdate(stage.id, 'whatsapp_template_id', e.target.value || null)}
              >
                <option value="">Mensaje por defecto</option>
                {waTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── StageList ────────────────────────────────────────────────

function StageList({
  stages: initialStages,
  teamId,
  teamName,
  hasOwnStages,
  templates,
}: {
  stages:       Stage[]
  teamId:       string | null
  teamName:     string
  hasOwnStages: boolean
  templates:    Template[]
}) {
  const [stages, setStages]          = useState<Stage[]>(initialStages)
  const [isPending, startTransition] = useTransition()
  const [saving, setSaving]          = useState(false)
  const [addError, setAddError]      = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = stages.findIndex(s => s.id === active.id)
    const newIndex = stages.findIndex(s => s.id === over.id)
    const reordered = arrayMove(stages, oldIndex, newIndex)
    setStages(reordered)

    startTransition(async () => {
      await reorderRenewalStages(reordered.map(s => s.id))
    })
  }

  function handleUpdate(id: string, field: string, value: unknown) {
    setStages(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    startTransition(async () => {
      await updateRenewalStage(id, { [field]: value } as Parameters<typeof updateRenewalStage>[1])
    })
  }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este stage? Esta acción no se puede deshacer.')) return
    setStages(prev => prev.filter(s => s.id !== id))
    startTransition(async () => {
      await deleteRenewalStage(id)
    })
  }

  async function handleAdd() {
    setSaving(true)
    setAddError(null)
    try {
      const maxOrder = stages.reduce((m, s) => Math.max(m, s.sort_order), 0)
      await createRenewalStage(teamId, {
        name: 'Nuevo stage',
        days_before: 10,
        send_email: false,
        send_whatsapp: false,
        requires_new_policy: false,
        sort_order: maxOrder + 1,
      })
      window.location.reload()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Error al crear el stage')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyGlobal() {
    if (!teamId) return
    if (!confirm(`¿Copiar los stages globales al equipo "${teamName}"? Los stages actuales del equipo serán reemplazados.`)) return
    startTransition(async () => {
      await copyGlobalRenewalStagesToTeam(teamId)
      window.location.reload()
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

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-400 px-1">
        <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-blue-400" /> Envía email</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-green-500" /> Envía WhatsApp</span>
        <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5 text-amber-400" /> Requiere nueva póliza</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {stages.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">
                No hay stages configurados. Usa el botón de abajo para agregar el primero.
              </p>
            )}
            {stages.map(stage => (
              <SortableStageRow
                key={stage.id}
                stage={stage}
                templates={templates}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {addError && (
        <p className="text-xs text-red-500 mt-2">{addError}</p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 mt-2"
        onClick={handleAdd}
        disabled={saving || isPending}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Agregar stage
      </Button>
    </div>
  )
}

// ─── RenewalStagesAdmin (main export) ────────────────────────

export function RenewalStagesAdmin({ globalStages, byTeam, teams, templates }: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  const currentTeam   = teams.find(t => t.id === selectedTeamId)
  const currentName   = selectedTeamId ? (currentTeam?.name ?? 'Equipo') : 'Global (todos los equipos)'
  const hasOwnStages  = selectedTeamId ? ((byTeam[selectedTeamId]?.length ?? 0) > 0) : true
  const currentStages = selectedTeamId
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

      {/* Lista de stages */}
      <StageList
        key={selectedTeamId ?? 'global'}   // re-mount al cambiar equipo
        stages={currentStages}
        teamId={selectedTeamId}
        teamName={currentName}
        hasOwnStages={hasOwnStages}
        templates={templates}
      />
    </div>
  )
}
