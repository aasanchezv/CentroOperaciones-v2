'use client'

import { useState, useTransition }          from 'react'
import { Plus, Trash2, Star, Loader2, X, AlertCircle, Building2 } from 'lucide-react'
import type { GtmInsurerContact }           from '@/app/actions/gtm-admin-actions'
import {
  createGtmInsurerContact,
  updateGtmInsurerContact,
  deleteGtmInsurerContact,
} from '@/app/actions/gtm-admin-actions'

// ─── AddContactForm ───────────────────────────────────────────

function AddContactForm({
  insurerId,
  onAdded,
  onCancel,
}: {
  insurerId: string
  onAdded:   (c: GtmInsurerContact) => void
  onCancel:  () => void
}) {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [phone,   setPhone]   = useState('')
  const [role,    setRole]    = useState('Cotizaciones')
  const [isDef,   setIsDef]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startTrans] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) { setError('Nombre y email son requeridos'); return }
    setError(null)
    startTrans(async () => {
      const res = await createGtmInsurerContact({
        insurer_id:  insurerId,
        name:        name.trim(),
        email:       email.trim(),
        phone:       phone.trim() || null,
        role:        role.trim() || 'Cotizaciones',
        is_default:  isDef,
      })
      if ('error' in res) { setError(res.error); return }
      onAdded({
        id:         res.id,
        insurer_id: insurerId,
        name:       name.trim(),
        email:      email.trim(),
        phone:      phone.trim() || null,
        role:       role.trim() || 'Cotizaciones',
        is_default: isDef,
        is_active:  true,
        created_at: new Date().toISOString(),
      })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          required
          placeholder="Nombre *"
          value={name}
          onChange={e => setName(e.target.value)}
          className="text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <input
          required
          type="email"
          placeholder="Email *"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <input
          placeholder="Teléfono (opcional)"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <input
          placeholder="Área (Cotizaciones, etc.)"
          value={role}
          onChange={e => setRole(e.target.value)}
          className="text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
        <input type="checkbox" checked={isDef} onChange={e => setIsDef(e.target.checked)} className="rounded" />
        Contacto predeterminado para esta aseguradora
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancelar</button>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Agregar
        </button>
      </div>
    </form>
  )
}

// ─── InsurerContactsCard ──────────────────────────────────────

function InsurerContactsCard({
  insurer,
  initialContacts,
}: {
  insurer:          { id: string; name: string; logo_url: string | null }
  initialContacts:  GtmInsurerContact[]
}) {
  const [contacts,  setContacts]  = useState(initialContacts)
  const [showAdd,   setShowAdd]   = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error,      setError]    = useState<string | null>(null)
  const [,           startTrans]  = useTransition()

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este contacto?')) return
    setDeletingId(id)
    setError(null)
    const res = await deleteGtmInsurerContact(id)
    setDeletingId(null)
    if (res.error) { setError(res.error); return }
    setContacts(prev => prev.filter(c => c.id !== id))
  }

  async function handleToggleDefault(contact: GtmInsurerContact) {
    startTrans(async () => {
      await updateGtmInsurerContact(contact.id, { is_default: !contact.is_default })
      setContacts(prev => prev.map(c => ({
        ...c,
        is_default: c.id === contact.id ? !contact.is_default : (contact.is_default ? c.is_default : false),
      })))
    })
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Insurer header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-gray-50">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
          {insurer.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={insurer.logo_url} alt={insurer.name} className="w-full h-full object-contain" />
          ) : (
            <Building2 className="h-4 w-4 text-gray-400" />
          )}
        </div>
        <p className="text-sm font-medium text-gray-900 flex-1">{insurer.name}</p>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          {showAdd ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showAdd ? 'Cancelar' : 'Agregar contacto'}
        </button>
      </div>

      {/* Contact list */}
      <div className="divide-y">
        {contacts.length === 0 && !showAdd ? (
          <p className="px-4 py-3 text-xs text-gray-400 italic">Sin contactos GTM configurados.</p>
        ) : (
          contacts.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-gray-900 truncate">{c.name}</p>
                  {c.is_default && (
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-gray-500">{c.email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {c.role && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{c.role}</span>}
                  {c.phone && <span className="text-[10px] text-gray-400">{c.phone}</span>}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleDefault(c)}
                  title={c.is_default ? 'Quitar predeterminado' : 'Marcar como predeterminado'}
                  className={`p-1.5 rounded transition-colors ${
                    c.is_default ? 'text-amber-500 hover:text-amber-700' : 'text-gray-300 hover:text-amber-400'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${c.is_default ? 'fill-amber-500' : ''}`} />
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={deletingId === c.id}
                  className="p-1.5 text-gray-300 hover:text-red-500 disabled:opacity-50 rounded transition-colors"
                >
                  {deletingId === c.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))
        )}

        {showAdd && (
          <div className="px-4 py-3">
            <AddContactForm
              insurerId={insurer.id}
              onAdded={c => { setContacts(prev => [...prev, c]); setShowAdd(false) }}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 pb-3">
          <p className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────

interface GtmContactsAdminProps {
  insurers:                  { id: string; name: string; logo_url: string | null }[]
  initialContactsByInsurer:  Record<string, GtmInsurerContact[]>
}

export function GtmContactsAdmin({ insurers, initialContactsByInsurer }: GtmContactsAdminProps) {
  const [search, setSearch] = useState('')

  const filtered = insurers.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Buscar aseguradora…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 w-64"
        />
        <p className="text-xs text-gray-400">
          {insurers.length} aseguradoras • los contactos marcados con ★ son el predeterminado
        </p>
      </div>

      <div className="space-y-3">
        {filtered.map(insurer => (
          <InsurerContactsCard
            key={insurer.id}
            insurer={insurer}
            initialContacts={initialContactsByInsurer[insurer.id] ?? []}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No se encontraron aseguradoras.</p>
        )}
      </div>
    </div>
  )
}
