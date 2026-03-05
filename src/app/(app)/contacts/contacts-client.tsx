'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  User, Mail, Phone, Building2, Star,
  Search, Pencil, Loader2, X,
} from 'lucide-react'
import { updateContact } from '@/app/actions/account-actions'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// ─── Types ────────────────────────────────────────────────────

interface ContactRow {
  id:         string
  full_name:  string
  email:      string | null
  phone:      string | null
  position:   string | null
  notes:      string | null
  is_primary: boolean
  is_vip:     boolean
  account:    { id: string; name: string; account_code: string } | null
}

// ─── Component ────────────────────────────────────────────────

export function ContactsClient({ contacts }: { contacts: ContactRow[] }) {
  const [query,   setQuery]   = useState('')
  const [editing, setEditing] = useState<ContactRow | null>(null)

  // Edit form state
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [position, setPosition] = useState('')
  const [notes,    setNotes]    = useState('')
  const [saving,   startSaving] = useTransition()

  const q = query.trim().toLowerCase()
  const filtered = q
    ? contacts.filter(c =>
        c.full_name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.account?.name ?? '').toLowerCase().includes(q)
      )
    : contacts

  function openEdit(c: ContactRow) {
    setEditing(c)
    setName(c.full_name)
    setEmail(c.email ?? '')
    setPhone(c.phone ?? '')
    setPosition(c.position ?? '')
    setNotes(c.notes ?? '')
  }

  function handleClose() {
    setEditing(null)
  }

  function handleSave() {
    if (!editing || !name.trim()) return
    const fd = new FormData()
    fd.set('full_name', name.trim())
    fd.set('email',    email.trim())
    fd.set('phone',    phone.trim())
    fd.set('position', position.trim())
    fd.set('notes',    notes.trim())
    startSaving(async () => {
      await updateContact(editing.id, editing.account?.id ?? '', fd)
      setEditing(null)
    })
  }

  return (
    <>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nombre, email, teléfono o cliente…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20 transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Count label */}
      {q && (
        <p className="text-xs text-gray-400 -mt-2">
          {filtered.length} contacto{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* List */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {filtered.length > 0 ? (
          <ul className="divide-y">
            {filtered.map((contact) => (
              <li key={contact.id} className="group">
                <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors">

                  {/* Main link area */}
                  <Link
                    href={`/accounts/${contact.account?.id ?? ''}`}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0 select-none">
                      {contact.full_name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-900 truncate">{contact.full_name}</p>
                        {contact.is_primary && (
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                        )}
                        {contact.is_vip && (
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">VIP</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {contact.position && (
                          <span className="text-xs text-gray-400">{contact.position}</span>
                        )}
                        {contact.email && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Mail className="h-3 w-3" />
                            {contact.email}
                          </span>
                        )}
                        {contact.phone && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {contact.account && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[120px]">{contact.account.name}</span>
                        <span className="font-mono text-gray-300">{contact.account.account_code}</span>
                      </div>
                    )}
                  </Link>

                  {/* Edit button */}
                  <button
                    type="button"
                    onClick={() => openEdit(contact)}
                    className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
                    title="Editar contacto"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <User className="h-10 w-10 mb-3" />
            <p className="text-sm text-gray-400">
              {q ? 'Sin resultados para esta búsqueda' : 'No hay contactos aún'}
            </p>
            {!q && <p className="text-xs mt-0.5">Agrégalos desde el detalle de cada cliente</p>}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={v => !v && handleClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="edit-full_name">Nombre *</Label>
              <Input
                id="edit-full_name"
                placeholder="Nombre completo"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-email">Correo</Label>
                <Input
                  id="edit-email"
                  type="email"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-phone">Teléfono</Label>
                <Input
                  id="edit-phone"
                  placeholder="+52 55 0000 0000"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-position">Cargo</Label>
              <Input
                id="edit-position"
                placeholder="Director General, Contador…"
                value={position}
                onChange={e => setPosition(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-notes">Notas</Label>
              <Textarea
                id="edit-notes"
                rows={2}
                placeholder="Referencias, contexto…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
