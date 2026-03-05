'use client'

import { useState, useTransition } from 'react'
import {
  createInternalRequester,
  updateInternalRequester,
  deleteInternalRequester,
} from '@/app/actions/cotizacion-actions'
import { updateAppSetting } from '@/app/actions/proof-actions'
import { Loader2, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Requester {
  id:        string
  name:      string
  email:     string | null
  notes:     string | null
  is_active: boolean
}

interface Props {
  initialRequesters: Requester[]
  initialSlaHours:   string | null
}

function RequesterRow({
  req,
  onSaved,
}: {
  req:     Requester
  onSaved: () => void
}) {
  const [editing, setEditing]     = useState(false)
  const [name,    setName]        = useState(req.name)
  const [email,   setEmail]       = useState(req.email ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!name.trim()) return
    startTransition(async () => {
      await updateInternalRequester(req.id, { name, email, is_active: req.is_active })
      setEditing(false)
      onSaved()
    })
  }

  function handleDelete() {
    if (!confirm(`¿Desactivar a ${req.name}?`)) return
    startTransition(async () => {
      await deleteInternalRequester(req.id)
      onSaved()
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 h-8 text-sm"
          placeholder="Nombre"
          autoFocus
        />
        <Input
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-44 h-8 text-sm"
          placeholder="correo@murguia.com"
          type="email"
        />
        <button onClick={handleSave} disabled={isPending || !name.trim()} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1.5 group">
      <span className="flex-1 text-sm text-gray-800">{req.name}</span>
      {req.email && <span className="text-xs text-gray-400">{req.email}</span>}
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700 transition-opacity"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function RequestersAdmin({ initialRequesters, initialSlaHours }: Props) {
  const [requesters, setRequesters] = useState(initialRequesters)
  const [newName,  setNewName]      = useState('')
  const [newEmail, setNewEmail]     = useState('')
  const [slaHours, setSlaHours]     = useState(initialSlaHours ?? '')
  const [slaSaved, setSlaSaved]     = useState(false)
  const [isPending, startTransition] = useTransition()

  function reload() {
    // Optimistic UI: revalida en background, la page server se actualiza
    // Al ser server components, el cambio se verá en la próxima navegación
  }

  function handleAdd() {
    if (!newName.trim()) return
    startTransition(async () => {
      await createInternalRequester({ name: newName.trim(), email: newEmail.trim() || undefined })
      setNewName('')
      setNewEmail('')
      // Agregar optimistamente a la lista local
      setRequesters(prev => [...prev, {
        id: crypto.randomUUID(), name: newName.trim(),
        email: newEmail.trim() || null, notes: null, is_active: true,
      }])
    })
  }

  function handleSaveSla() {
    startTransition(async () => {
      await updateAppSetting('quotation_sla_hours', slaHours.trim())
      setSlaSaved(true)
      setTimeout(() => setSlaSaved(false), 3000)
    })
  }

  const active = requesters.filter(r => r.is_active)

  return (
    <div className="space-y-8">
      {/* ── SLA ── */}
      <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">SLA de entrega</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Al crear una cotización se calculará automáticamente la fecha límite de entrega.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="720"
              value={slaHours}
              onChange={e => setSlaHours(e.target.value)}
              placeholder="48"
              className="w-24 h-9"
            />
            <span className="text-sm text-gray-500">horas</span>
          </div>
          <Button size="sm" onClick={handleSaveSla} disabled={isPending} variant="outline" className="gap-1.5">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Guardar
          </Button>
          {slaSaved && <span className="text-xs text-emerald-600">✓ Guardado</span>}
        </div>
        {slaHours && (
          <p className="text-xs text-gray-400">
            Las cotizaciones nuevas tendrán fecha de entrega {slaHours}h después de crearlas.
          </p>
        )}
      </div>

      {/* ── Solicitantes ── */}
      <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Solicitantes internos</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Personas dentro de Murguía que solicitan cotizaciones. Aparecen en el dropdown al crear una cotización.
          </p>
        </div>

        <div className="divide-y">
          {active.length === 0 && (
            <p className="text-xs text-gray-400 py-2">Sin solicitantes. Agrega el primero abajo.</p>
          )}
          {active.map(r => (
            <RequesterRow key={r.id} req={r} onSaved={reload} />
          ))}
        </div>

        {/* Add row */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre"
            className="flex-1 h-8 text-sm"
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <Input
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="correo (opcional)"
            type="email"
            className="w-44 h-8 text-sm"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={isPending || !newName.trim()}
            className="gap-1.5 shrink-0"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Agregar
          </Button>
        </div>
      </div>
    </div>
  )
}
