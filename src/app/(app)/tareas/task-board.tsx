'use client'

import { useState, useTransition, useOptimistic, useRef, useEffect } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createTask, updateTaskStatus, deleteTask } from '@/app/actions/task-actions'
import { CalendarDays, Plus, RefreshCw, Trash2, MoreHorizontal, GripVertical, Loader2, ClipboardList, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TaskStatus } from '@/types/database.types'

// ─── Types ────────────────────────────────────────────────────

interface TaskRow {
  id: string
  title: string
  description: string | null
  source_type: string
  source_id: string | null
  insurer: string | null
  due_date: string | null
  status: string
  assigned_to: string | null
  created_by: string
  account_id: string | null
  created_at: string
  updated_at: string
  account: { id: string; name: string; account_code: string } | null
}

interface ProfileRow {
  id: string
  full_name: string | null
  email: string
}

interface Props {
  tasks: TaskRow[]
  profiles: ProfileRow[]
  currentUserId: string
  userRole: string
}

// ─── Columns config ───────────────────────────────────────────

const COLUMNS: { status: TaskStatus; label: string; color: string; dot: string }[] = [
  { status: 'pending',     label: 'Pendiente',   color: 'border-amber-200 bg-amber-50/40',  dot: 'bg-amber-400' },
  { status: 'in_progress', label: 'En proceso',  color: 'border-blue-200 bg-blue-50/40',    dot: 'bg-blue-400' },
  { status: 'done',        label: 'Listo',        color: 'border-green-200 bg-green-50/40', dot: 'bg-green-400' },
]

// ─── Helpers ──────────────────────────────────────────────────

const sourceLabel: Record<string, string> = {
  manual:   'Manual',
  renewal:  'Renovación',
  claim:    'Siniestro',
}

function DueBadge({ date }: { date: string | null }) {
  if (!date) return null
  const today = new Date().toISOString().split('T')[0]
  const d     = new Date(date + 'T00:00:00')
  const diff  = Math.ceil((d.getTime() - new Date().setHours(0,0,0,0)) / (1000*60*60*24))

  if (diff < 0) {
    return <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Vencida {Math.abs(diff)}d</span>
  }
  if (diff === 0) {
    return <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Hoy</span>
  }
  if (diff <= 7) {
    return <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1"><CalendarDays className="h-3 w-3" />{date.slice(5).replace('-', '/')}</span>
  }
  return <span className="text-[10px] text-gray-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" />{date.slice(5).replace('-', '/')}</span>
}

function avatarInitial(profile: ProfileRow) {
  return (profile.full_name ?? profile.email).charAt(0).toUpperCase()
}

// ─── Task Card ────────────────────────────────────────────────

function TaskCard({
  task, profile, showAssignee, onDelete, isPending,
}: {
  task: TaskRow
  profile?: ProfileRow
  showAssignee: boolean
  onDelete: (id: string) => void
  isPending: boolean
}) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: task.id })

  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isPending ? 0.6 : 1,
  }

  const account = Array.isArray(task.account) ? task.account[0] : task.account

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm select-none"
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium text-gray-800 leading-snug ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
            {task.title}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {task.source_type !== 'manual' && (
              <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                {sourceLabel[task.source_type] ?? task.source_type}
              </span>
            )}
            {account && (
              <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{account.name}</span>
            )}
            <DueBadge date={task.due_date} />
          </div>

          {showAssignee && profile && (
            <div className="flex items-center gap-1 mt-2">
              <div className="h-5 w-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-600 shrink-0">
                {avatarInitial(profile)}
              </div>
              <span className="text-[10px] text-gray-400 truncate">
                {profile.full_name ?? profile.email}
              </span>
            </div>
          )}
        </div>

        {/* Actions menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setShowMenu(v => !v)}
            className="text-gray-300 hover:text-gray-600 p-0.5 rounded"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg z-10 w-32 py-1">
              <button
                onClick={() => { onDelete(task.id); setShowMenu(false) }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────

function KanbanColumn({
  status, label, color, dot, tasks, profileMap, showAssignee, onDelete, pendingIds,
}: {
  status: TaskStatus
  label: string
  color: string
  dot: string
  tasks: TaskRow[]
  profileMap: Map<string, ProfileRow>
  showAssignee: boolean
  onDelete: (id: string) => void
  pendingIds: Set<string>
}) {
  return (
    <div className={`flex flex-col rounded-xl border ${color} min-h-[300px]`}>
      {/* Column header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-inherit">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="ml-auto text-xs text-gray-400 bg-white/70 rounded-full px-2 py-0.5 border border-gray-200">
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              profile={task.assigned_to ? profileMap.get(task.assigned_to) : undefined}
              showAssignee={showAssignee}
              onDelete={onDelete}
              isPending={pendingIds.has(task.id)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="text-xs text-center text-gray-400 py-8">Sin tareas</p>
        )}
      </div>
    </div>
  )
}

// ─── Main Board ───────────────────────────────────────────────

export function TaskBoard({ tasks: initialTasks, profiles, currentUserId, userRole }: Props) {
  const isElevated = ['admin', 'ops', 'manager'].includes(userRole)

  const [viewMode, setViewMode]         = useState<'mine' | 'team'>('mine')
  const [query,    setQuery]            = useState('')
  const [newTitle, setNewTitle]         = useState('')
  const [newDueDate, setNewDueDate]     = useState('')
  const [creating, setCreating]         = useState(false)
  const [, startTransition]             = useTransition()
  const [pendingIds, setPendingIds]     = useState<Set<string>>(new Set())
  const inputRef                        = useRef<HTMLInputElement>(null)

  const [optimisticTasks, addOptimistic] = useOptimistic(
    initialTasks,
    (state, action: { type: 'add'; task: TaskRow } | { type: 'updateStatus'; id: string; status: string } | { type: 'delete'; id: string }) => {
      if (action.type === 'add')          return [action.task, ...state]
      if (action.type === 'updateStatus') return state.map(t => t.id === action.id ? { ...t, status: action.status } : t)
      if (action.type === 'delete')       return state.filter(t => t.id !== action.id)
      return state
    }
  )

  const profileMap = new Map(profiles.map(p => [p.id, p]))

  // Filter by view mode, then by search query
  const byViewMode = viewMode === 'mine'
    ? optimisticTasks.filter(t => t.assigned_to === currentUserId || t.created_by === currentUserId)
    : optimisticTasks

  const q2 = query.trim().toLowerCase()
  const displayedTasks = q2
    ? byViewMode.filter(t =>
        t.title.toLowerCase().includes(q2) ||
        (t.account?.name ?? '').toLowerCase().includes(q2)
      )
    : byViewMode

  // Sensors for DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Create task
  async function handleCreate() {
    const title = newTitle.trim()
    if (!title) return
    setCreating(true)

    const tempTask: TaskRow = {
      id:          'temp-' + Date.now(),
      title,
      description: null,
      source_type: 'manual',
      source_id:   null,
      insurer:     null,
      due_date:    newDueDate || null,
      status:      'pending',
      assigned_to: currentUserId,
      created_by:  currentUserId,
      account_id:  null,
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
      account:     null,
    }

    setNewTitle('')
    setNewDueDate('')

    startTransition(async () => {
      addOptimistic({ type: 'add', task: tempTask })
      try {
        await createTask(title, newDueDate || undefined)
      } catch (e) {
        alert((e as Error).message)
      } finally {
        setCreating(false)
      }
    })
  }

  // Drag end
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const taskId   = active.id as string
    const newStatus = over.id as TaskStatus

    // `over.id` might be a task id if dropped on a task, not a column
    // We identify column drops by checking if the id matches a column status
    const validStatuses: TaskStatus[] = ['pending', 'in_progress', 'done']
    if (!validStatuses.includes(newStatus)) return

    const task = optimisticTasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return

    setPendingIds(prev => new Set(prev).add(taskId))
    startTransition(async () => {
      addOptimistic({ type: 'updateStatus', id: taskId, status: newStatus })
      try {
        await updateTaskStatus(taskId, newStatus)
      } catch (e) {
        alert((e as Error).message)
      } finally {
        setPendingIds(prev => { const s = new Set(prev); s.delete(taskId); return s })
      }
    })
  }

  // Delete
  function handleDelete(taskId: string) {
    startTransition(async () => {
      addOptimistic({ type: 'delete', id: taskId })
      try {
        await deleteTask(taskId)
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  const showAssignee = viewMode === 'team' && isElevated

  return (
    <div className="space-y-5">
      {/* Toggle mine / team */}
      {isElevated && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setViewMode('mine')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'mine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Mis tareas
          </button>
          <button
            onClick={() => setViewMode('team')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'team' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Todo el equipo
          </button>
        </div>
      )}

      {/* Quick add */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <ClipboardList className="h-4 w-4 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Nueva tarea…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
          className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
        />
        <input
          type="date"
          value={newDueDate}
          onChange={e => setNewDueDate(e.target.value)}
          className="text-sm text-gray-500 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-gray-400 bg-transparent"
        />
        <Button
          size="sm"
          disabled={!newTitle.trim() || creating}
          onClick={handleCreate}
          className="gap-1.5 shrink-0"
        >
          {creating
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Plus className="h-3.5 w-3.5" />
          }
          Añadir
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar tareas por título o cliente…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20 transition-colors"
        />
      </div>

      {/* Kanban board — DnD */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colTasks = displayedTasks.filter(t => t.status === col.status)

            return (
              /* Droppable column: we use the column status as the over.id */
              <DroppableColumn key={col.status} id={col.status}>
                <KanbanColumn
                  status={col.status}
                  label={col.label}
                  color={col.color}
                  dot={col.dot}
                  tasks={colTasks}
                  profileMap={profileMap}
                  showAssignee={showAssignee}
                  onDelete={handleDelete}
                  pendingIds={pendingIds}
                />
              </DroppableColumn>
            )
          })}
        </div>
      </DndContext>
    </div>
  )
}

// ─── Droppable column wrapper ─────────────────────────────────

import { useDroppable } from '@dnd-kit/core'

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`transition-all ${isOver ? 'scale-[1.01]' : ''}`}
    >
      {children}
    </div>
  )
}
