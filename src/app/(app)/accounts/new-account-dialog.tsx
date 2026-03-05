'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createAccount } from '@/app/actions/account-actions'
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
import { Plus, Loader2, UserCheck } from 'lucide-react'
import type { Team, Profile } from '@/types/database.types'

interface Props {
  teams: Pick<Team, 'id' | 'name'>[]
  agents: Pick<Profile, 'id' | 'full_name' | 'email'>[]
}

export function NewAccountDialog({ teams, agents }: Props) {
  const router = useRouter()
  const [open, setOpen]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [accountType, setAccountType] = useState<string>('empresa')
  const [createContact, setCreateContact] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    try {
      const { id } = await createAccount(formData)
      setOpen(false)
      formRef.current?.reset()
      router.push(`/accounts/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la cuenta')
      setLoading(false)
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) { setAccountType('empresa'); setCreateContact(false); setError(null) }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva cuenta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva cuenta</DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={handleSubmit} className="space-y-4 mt-2">
          {/* Nombre + tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" name="name" placeholder="Empresa o persona" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="type">Tipo</Label>
              <Select
                name="type"
                defaultValue="empresa"
                onValueChange={v => { setAccountType(v); if (v !== 'persona_fisica') setCreateContact(false) }}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="persona_fisica">Persona física</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="status">Estatus</Label>
              <Select name="status" defaultValue="prospect">
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospect">Prospecto</SelectItem>
                  <SelectItem value="inactive">Inactiva</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* RFC + email + teléfono */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="rfc">RFC</Label>
              <Input id="rfc" name="rfc" placeholder="XAXX010101000" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" placeholder="+52 55 0000 0000" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" name="email" type="email" placeholder="contacto@empresa.com" />
            </div>
          </div>

          {/* Toggle: contratante es el contacto (solo persona_fisica) */}
          {accountType === 'persona_fisica' && (
            <button
              type="button"
              onClick={() => setCreateContact(v => !v)}
              className={[
                'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm w-full transition-all',
                createContact
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300',
              ].join(' ')}
            >
              <UserCheck className="h-4 w-4 shrink-0" />
              <span className="font-medium">El contratante es el contacto</span>
              {createContact && (
                <span className="ml-auto text-xs text-blue-600">Se creará el contacto automáticamente</span>
              )}
            </button>
          )}
          <input type="hidden" name="create_contact" value={createContact ? 'true' : 'false'} />

          {/* Equipo + asignado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="team_id">Equipo</Label>
              <Select name="team_id">
                <SelectTrigger id="team_id">
                  <SelectValue placeholder="Sin equipo" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="assigned_to">Agente</Label>
              <Select name="assigned_to">
                <SelectTrigger id="assigned_to">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.full_name ?? a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Contexto, referencias…" />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear cuenta
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
