'use client'

import { useState, useRef } from 'react'
import { createContact } from '@/app/actions/account-actions'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { UserPlus, Loader2, Wand2 } from 'lucide-react'

interface Props {
  accountId:     string
  accountName?:  string | null
  accountEmail?: string | null
  accountPhone?: string | null
  accountType?:  string | null
  canSetVip?:    boolean
}

export function NewContactDialog({
  accountId,
  accountName,
  accountEmail,
  accountPhone,
  accountType,
  canSetVip = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isVip, setIsVip] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const isPersona = accountType === 'persona_fisica'

  function handlePrefill() {
    setName(accountName ?? '')
    setEmail(accountEmail ?? '')
    setPhone(accountPhone ?? '')
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) { setName(''); setEmail(''); setPhone(''); setIsVip(false) }
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    try {
      await createContact(accountId, formData)
      handleOpenChange(false)
      formRef.current?.reset()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Agregar contacto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo contacto</DialogTitle>
        </DialogHeader>

        {isPersona && (accountName || accountEmail || accountPhone) && (
          <button
            type="button"
            onClick={handlePrefill}
            className="flex items-center gap-2 rounded-lg border border-dashed border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 hover:bg-violet-100 transition-colors w-full"
          >
            <Wand2 className="h-3.5 w-3.5 shrink-0" />
            Usar datos de la cuenta
          </button>
        )}

        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="full_name">Nombre *</Label>
            <Input
              id="full_name"
              name="full_name"
              placeholder="Nombre completo"
              required
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="nombre@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                name="phone"
                placeholder="+52 55 0000 0000"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="position">Cargo</Label>
            <Input id="position" name="position" placeholder="Director General, Contador…" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Referencias, contexto…" />
          </div>

          {/* VIP — solo visible para manager+ */}
          {canSetVip && <div className="space-y-2">
            <button
              type="button"
              onClick={() => setIsVip(v => !v)}
              className={[
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm w-full transition-all',
                isVip
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300',
              ].join(' ')}
            >
              <span>⭐</span>
              <span className="font-medium">Cliente VIP</span>
              {isVip && <span className="ml-auto text-xs text-amber-600">Activo</span>}
            </button>
            <input type="hidden" name="is_vip" value={isVip ? 'true' : 'false'} />
            {isVip && (
              <Textarea
                name="vip_notes"
                rows={2}
                placeholder="Relación especial, instrucciones de servicio…"
                className="text-sm"
              />
            )}
          </div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
