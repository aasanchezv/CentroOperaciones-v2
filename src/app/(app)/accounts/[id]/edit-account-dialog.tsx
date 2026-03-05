'use client'

import { useState } from 'react'
import { updateAccount } from '@/app/actions/account-actions'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, Loader2 } from 'lucide-react'
import type { Account, Team, Profile, AccountStatus, AccountType } from '@/types/database.types'

interface Props {
  account: Account
  teams: Pick<Team, 'id' | 'name'>[]
  agents: Pick<Profile, 'id' | 'full_name' | 'email'>[]
}

export function EditAccountDialog({ account, teams, agents }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    try {
      await updateAccount(account.id, formData)
      setOpen(false)
    } catch {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar cuenta</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" name="name" defaultValue={account.name} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="type">Tipo</Label>
              <Select name="type" defaultValue={account.type as AccountType}>
                <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="persona_fisica">Persona física</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Estatus</Label>
              {account.status === 'active' ? (
                <>
                  <input type="hidden" name="status" value="active" />
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-emerald-200 bg-emerald-50 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-emerald-700 font-medium">Activa</span>
                    <span className="ml-auto text-xs text-emerald-600">vía pólizas vigentes</span>
                  </div>
                </>
              ) : (
                <Select name="status" defaultValue={account.status as AccountStatus}>
                  <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospecto</SelectItem>
                    <SelectItem value="inactive">Inactiva</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="rfc">RFC</Label>
              <Input id="rfc" name="rfc" defaultValue={account.rfc ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" defaultValue={account.phone ?? ''} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" name="email" type="email" defaultValue={account.email ?? ''} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="team_id">Equipo</Label>
              <Select name="team_id" defaultValue={account.team_id ?? ''}>
                <SelectTrigger id="team_id">
                  <SelectValue placeholder="Sin equipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin equipo</SelectItem>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="assigned_to">Agente</Label>
              <Select name="assigned_to" defaultValue={account.assigned_to ?? ''}>
                <SelectTrigger id="assigned_to">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin asignar</SelectItem>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.full_name ?? a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={account.notes ?? ''} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
