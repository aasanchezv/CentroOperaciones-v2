'use client'

import { useState, useTransition } from 'react'
import { closeRenewal } from '@/app/actions/renewal-actions'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { XCircle, Loader2, Wrench, BanknoteIcon, CheckCircle2, XOctagon } from 'lucide-react'
import type { RenewalStatus } from '@/types/database.types'

interface Props {
  renewalId: string
}

type Bucket = Exclude<RenewalStatus, 'in_progress'>

const buckets: { value: Bucket; label: string; description: string; icon: React.ReactNode; color: string }[] = [
  {
    value: 'changes_requested',
    label: 'Pidió Cambios',
    description: 'El cliente solicita modificaciones a la póliza',
    icon: <Wrench className="h-5 w-5" />,
    color: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
  },
  {
    value: 'cancelled',
    label: 'Cliente Canceló',
    description: 'El cliente no desea renovar la póliza',
    icon: <XOctagon className="h-5 w-5" />,
    color: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
  },
  {
    value: 'renewed_pending_payment',
    label: 'Renovada — Pendiente Pago',
    description: 'Aprobada, falta confirmar el pago',
    icon: <BanknoteIcon className="h-5 w-5" />,
    color: 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100',
  },
  {
    value: 'renewed_paid',
    label: 'Renovada y Pagada',
    description: 'Proceso completo ✓',
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100',
  },
]

export function CloseRenewalDialog({ renewalId }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Bucket | null>(null)
  const [notes, setNotes] = useState('')
  // Para changes_requested
  const [insurer, setInsurer]     = useState('')
  const [changeType, setChangeType] = useState('')
  const [dueDate, setDueDate]     = useState('')
  const [, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)

  function handleClose() {
    if (!selected) return
    setLoading(true)
    startTransition(async () => {
      try {
        await closeRenewal(renewalId, {
          status: selected,
          notes: notes || undefined,
          task: selected === 'changes_requested' && insurer && changeType && dueDate
            ? { insurer, change_type: changeType, due_date: dueDate }
            : undefined,
        })
        setOpen(false)
      } catch (e) {
        alert((e as Error).message)
      } finally {
        setLoading(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-gray-600">
          <XCircle className="h-4 w-4" />
          Cerrar renovación
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cerrar renovación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <p className="text-sm text-gray-600">Selecciona el resultado final de esta renovación:</p>

          <div className="grid grid-cols-2 gap-2">
            {buckets.map(b => (
              <button
                key={b.value}
                onClick={() => setSelected(b.value)}
                className={`flex flex-col gap-1 rounded-lg border-2 p-3 text-left transition-all ${
                  selected === b.value ? b.color + ' ring-2 ring-offset-1 ring-current' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <span className={selected === b.value ? '' : 'text-gray-400'}>{b.icon}</span>
                <span className="text-sm font-medium">{b.label}</span>
                <span className="text-xs opacity-70">{b.description}</span>
              </button>
            ))}
          </div>

          {/* Formulario adicional para cambios */}
          {selected === 'changes_requested' && (
            <div className="space-y-3 border rounded-lg p-4 bg-amber-50">
              <p className="text-xs font-medium text-amber-700">Detalles de la tarea</p>
              <div className="space-y-1">
                <Label htmlFor="insurer">Aseguradora</Label>
                <Input id="insurer" value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="GNP, AXA, Mapfre…" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="change_type">Tipo de cambio solicitado</Label>
                <Textarea id="change_type" rows={2} value={changeType} onChange={e => setChangeType(e.target.value)} placeholder="Incrementar suma asegurada, cambiar deducible…" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="due_date">Fecha límite</Label>
                <Input id="due_date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones adicionales…" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              disabled={!selected || loading || (selected === 'changes_requested' && (!insurer || !changeType || !dueDate))}
              onClick={handleClose}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar cierre
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
