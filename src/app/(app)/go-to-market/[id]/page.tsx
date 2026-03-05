import { redirect }         from 'next/navigation'
import { createClient }     from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGtmProcess }    from '@/app/actions/gtm-actions'
import { ProcessDetail }    from './process-detail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function GtmProcessPage({ params }: Props) {
  const { id }   = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  const result = await getGtmProcess(id)
  if (!result) redirect('/go-to-market')

  const admin = createAdminClient()

  // Load insurers with their default GTM contacts
  const [insurersRes, contactsRes] = await Promise.all([
    admin.from('insurers').select('id, name, logo_url').eq('is_active', true).order('name'),
    admin.from('gtm_insurer_contacts').select('insurer_id, name, email, is_default').eq('is_active', true).order('is_default', { ascending: false }),
  ])

  const insurers  = insurersRes.data ?? []
  const contacts  = contactsRes.data ?? []

  // Build default contact map per insurer
  const defaultContacts: Record<string, { name: string; email: string }> = {}
  for (const c of contacts) {
    if (!defaultContacts[c.insurer_id] || c.is_default) {
      defaultContacts[c.insurer_id] = { name: c.name, email: c.email }
    }
  }

  // All contacts per insurer for selector
  const contactsByInsurer: Record<string, { name: string; email: string }[]> = {}
  for (const c of contacts) {
    if (!contactsByInsurer[c.insurer_id]) contactsByInsurer[c.insurer_id] = []
    contactsByInsurer[c.insurer_id].push({ name: c.name, email: c.email })
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <ProcessDetail
        initialProcess={result.process}
        initialInsurers={result.insurers}
        allInsurers={insurers as { id: string; name: string; logo_url: string | null }[]}
        defaultContacts={defaultContacts}
        contactsByInsurer={contactsByInsurer}
        currentUserId={user.id}
        currentUserRole={profile.role}
      />
    </div>
  )
}
