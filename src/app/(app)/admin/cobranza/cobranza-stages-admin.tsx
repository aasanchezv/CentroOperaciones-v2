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
  updateCobranzaStage,
  createCobranzaStage,
  deleteCobranzaStage,
  reorderCobranzaStages,
  saveSemaforoSettings,
  copyGlobalCobranzaStagesToTeam,
} from '@/app/actions/cobranza-receipt-actions'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { GripVertical, Plus, Trash2, Loader2, Mail, MessageCircle, Copy } from 'lucide-react'
import type { CobranzaStage } from '@/types/database.types'

// ─── Types ────────────────────────────────────────────────────

interface Template {
  id:                   string
  name:                 string
  channel:              string
  conducto_cobro_filter: string | null
}

interface Team {
  id:   string
  name: string
}

interface Props {
  globalStages:    CobranzaStage[]
  byTeam:          Record<string, CobranzaStage[]>
  teams:           Team[]
  templates:       Template[]
  semaforoRed:     number
  semaforoYellow:  number
}

// ─── Sortable row ─────────────────────────────────────────────

function SortableStageRow({ stage, templates, onUpdate, onDelete }: {
  stage:     CobranzaStage
  templates: Template[]
  onUpdate:  (id: string, field: string, value: unknown) => void
  onDelete:  (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id })

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
        <button
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Arrastrar"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <input
          className="flex-1 text-sm font-medium text-gray-700 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-gray-400 outline-none px-1 py-0.5 min-w-0"
          defaultValue={stage.name}
          onBlur={e => onUpdate(stage.id, 'name', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />

        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-14 text-sm text-center text-gray-600 bg-transparent border border-gray-200 rounded px-1.5 py-0.5 focus:border-gray-400 outline-none"
            defaultValue={stage.days_before ?? ''}
            placeholder="—"
            min={0}
            onBlur={e => onUpdate(stage.id, 'days_before', e.target.value ? parseInt(e.target.value) : null)}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">días antes</span>
        </div>

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
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded"
            defaultChecked={stage.is_active}
            onChange={e => onUpdate(stage.id, 'is_active', e.target.checked)}
          />
          <span className="text-xs text-gray-400">Activo</span>
        </label>

        <button
          onClick={() => onDelete(stage.id)}
          className="text-gray-200 hover:text-red-400 transition-colors"
          aria-label="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Template selectors — always visible for every stage */}
      <div className="flex flex-col gap-2 px-10 pb-3 pt-0">
        {/* Email templates */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 text-blue-400 shrink-0" />
            <span className="text-[10px] text-gray-400 shrink-0">Correo (general)</span>
            <select
              className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white focus:outline-none focus:border-blue-400 max-w-[180px]"
              value={stage.email_template_id ?? ''}
              onChange={e => onUpdate(stage.id, 'email_template_id', e.target.value || null)}
            >
              <option value="">Sin plantilla</option>
              {emailTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {/* Domiciliado email override */}
          <div className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-[10px] text-amber-600 shrink-0">Correo (domiciliado)</span>
            <select
              className="text-xs border border-amber-200 rounded px-2 py-1 text-gray-600 bg-white focus:outline-none focus:border-amber-400 max-w-[180px]"
              value={(stage as unknown as Record<string, unknown>).email_template_domiciliado_id as string ?? ''}
              onChange={e => onUpdate(stage.id, 'email_template_domiciliado_id', e.target.value || null)}
            >
              <option value="">— sin override —</option>
              {emailTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
        {/* WhatsApp templates */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-3 w-3 text-green-500 shrink-0" />
            <span className="text-[10px] text-gray-400 shrink-0">WhatsApp (general)</span>
            <select
              className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white focus:outline-none focus:border-green-400 max-w-[180px]"
              value={stage.whatsapp_template_id ?? ''}
              onChange={e => onUpdate(stage.id, 'whatsapp_template_id', e.target.value || null)}
            >
              <option value="">Sin plantilla</option>
              {waTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {/* Domiciliado WhatsApp override */}
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="text-[10px] text-amber-600 shrink-0">WhatsApp (domiciliado)</span>
            <select
              className="text-xs border border-amber-200 rounded px-2 py-1 text-gray-600 bg-white focus:outline-none focus:border-amber-400 max-w-[180px]"
              value={(stage as unknown as Record<string, unknown>).whatsapp_template_domiciliado_id as string ?? ''}
              onChange={e => onUpdate(stage.id, 'whatsapp_template_domiciliado_id', e.target.value || null)}
            >
              <option value="">— sin override —</option>
              {waTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
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
  stages:       CobranzaStage[]
  teamId:       string | null
  teamName:     string
  hasOwnStages: boolean
  templates:    Template[]
}) {
  const [stages, setStages]          = useState<CobranzaStage[]>(initialStages)
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
      await reorderCobranzaStages(reordered.map(s => s.id))
    })
  }

  function handleUpdate(id: string, field: string, value: unknown) {
    setStages(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    startTransition(async () => {
      await updateCobranzaStage(id, { [field]: value } as Parameters<typeof updateCobranzaStage>[1])
    })
  }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta etapa? Los recibos asignados quedarán sin etapa.')) return
    setStages(prev => prev.filter(s => s.id !== id))
    startTransition(async () => {
      await deleteCobranzaStage(id)
    })
  }

  async function handleAdd() {
    setSaving(true)
    setAddError(null)
    try {
      const maxOrder = stages.reduce((m, s) => Math.max(m, s.sort_order), 0)
      const result = await createCobranzaStage(teamId, {
        name:        'Nueva etapa',
        days_before: 10,
        send_email:  false,
        send_whatsapp: false,
        sort_order:  maxOrder + 1,
      })
      if (result.error) {
        setAddError(result.error)
      } else {
        window.location.reload()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyGlobal() {
    if (!teamId) return
    if (!confirm(`¿Copiar las etapas globales al equipo "${teamName}"? Las etapas actuales del equipo serán reemplazadas.`)) return
    startTransition(async () => {
      const res = await copyGlobalCobranzaStagesToTeam(teamId)
      if (res.error) alert(res.error)
      else window.location.reload()
    })
  }

  return (
    <div className="space-y-3">
      {/* Banner: usa globales */}
      {!hasOwnStages && teamId && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-700">
            Este equipo usa las etapas globales. Personaliza para crear etapas propias.
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

      <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
        <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-blue-400" /> Envía email</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-green-500" /> Envía WhatsApp</span>
        <span className="text-gray-300">· Arrastra para reordenar · Edita el nombre en línea</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {stages.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">
                Sin etapas. Agrega la primera con el botón de abajo.
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

      {addError && <p className="text-xs text-red-500">{addError}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 mt-2"
        onClick={handleAdd}
        disabled={saving || isPending}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Agregar etapa
      </Button>
    </div>
  )
}

// ─── SemaforoSection ──────────────────────────────────────────

function SemaforoSection({ semaforoRed, semaforoYellow }: { semaforoRed: number; semaforoYellow: number }) {
  const [redVal,    setRedVal]    = useState(String(semaforoRed))
  const [yellowVal, setYellowVal] = useState(String(semaforoYellow))
  const [semSaving, setSemSaving] = useState(false)
  const [semMsg,    setSemMsg]    = useState<string | null>(null)

  async function handleSaveSemaforo() {
    setSemSaving(true)
    setSemMsg(null)
    const r = parseInt(redVal)
    const y = parseInt(yellowVal)
    if (isNaN(r) || isNaN(y) || r < 0 || y < 0) {
      setSemMsg('Los valores deben ser números positivos')
      setSemSaving(false)
      return
    }
    const res = await saveSemaforoSettings(r, y)
    setSemSaving(false)
    setSemMsg(res.error ?? '✓ Guardado')
    setTimeout(() => setSemMsg(null), 3000)
  }

  return (
    <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Semáforo de cobranza</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Define los umbrales de urgencia para el indicador de la pantalla de cobranza.
          El semáforo cuenta recibos pendientes cuyo vencimiento es en 2 días o menos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-sm">
        <div className="space-y-1">
          <Label htmlFor="sem_red" className="text-xs flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" />
            Umbral rojo (≥ X)
          </Label>
          <Input
            id="sem_red"
            type="number"
            min={1}
            value={redVal}
            onChange={e => setRedVal(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sem_yellow" className="text-xs flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400 inline-block" />
            Umbral amarillo (≥ X)
          </Label>
          <Input
            id="sem_yellow"
            type="number"
            min={0}
            value={yellowVal}
            onChange={e => setYellowVal(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Verde: menos de {yellowVal || '?'} urgentes · Amarillo: {yellowVal}–{Number(redVal) - 1} · Rojo: {redVal}+
      </p>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={handleSaveSemaforo}
          disabled={semSaving}
          className="gap-1.5"
        >
          {semSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar umbrales
        </Button>
        {semMsg && (
          <span className={`text-xs ${semMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>
            {semMsg}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── CobranzaStagesAdmin (main export) ────────────────────────

export function CobranzaStagesAdmin({ globalStages, byTeam, teams, templates, semaforoRed, semaforoYellow }: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  const currentTeam   = teams.find(t => t.id === selectedTeamId)
  const currentName   = selectedTeamId ? (currentTeam?.name ?? 'Equipo') : 'Global (todos los equipos)'
  const hasOwnStages  = selectedTeamId ? ((byTeam[selectedTeamId]?.length ?? 0) > 0) : true
  const currentStages = selectedTeamId
    ? (byTeam[selectedTeamId] ?? globalStages)
    : globalStages

  return (
    <div className="space-y-8">
      {/* ── Stages ─────────────────────────────────────────────── */}
      <div className="space-y-4">
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

        <StageList
          key={selectedTeamId ?? 'global'}
          stages={currentStages}
          teamId={selectedTeamId}
          teamName={currentName}
          hasOwnStages={hasOwnStages}
          templates={templates}
        />
      </div>

      {/* ── Semáforo config ──────────────────────────────────────── */}
      <SemaforoSection semaforoRed={semaforoRed} semaforoYellow={semaforoYellow} />
    </div>
  )
}
