import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContactsClient } from './contacts-client'

export default async function ContactsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, full_name, email, phone, position, notes, is_primary, is_vip, accounts(id, name, account_code)')
    .order('is_primary', { ascending: false })
    .order('full_name')

  const total = contacts?.length ?? 0

  const rows = (contacts ?? []).map(c => {
    const rawAcct = c.accounts
    const account = (Array.isArray(rawAcct) ? rawAcct[0] : rawAcct) as { id: string; name: string; account_code: string } | null
    return {
      id:         c.id,
      full_name:  c.full_name,
      email:      c.email,
      phone:      c.phone,
      position:   c.position,
      notes:      c.notes,
      is_primary: c.is_primary ?? false,
      is_vip:     c.is_vip ?? false,
      account,
    }
  })

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Contactos</h1>
        <p className="text-sm text-gray-500 mt-0.5">{total} contacto{total !== 1 ? 's' : ''}</p>
      </div>

      <ContactsClient contacts={rows} />
    </div>
  )
}
