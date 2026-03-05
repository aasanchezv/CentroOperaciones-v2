import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { ContactCenterInbox } from './inbox'

export default async function ContactCenterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  const isOpsOrAbove = ['admin', 'ops', 'manager'].includes(profile.role as string)
  const admin        = createAdminClient()

  // Cargar conversaciones iniciales (últimas 50)
  const query = admin
    .from('conversations')
    .select(`
      id, channel, status, priority, tags, subject,
      last_message_at, unread_count, assigned_to,
      first_response_at, resolved_at, waiting_since,
      contact:contacts!conversations_contact_id_fkey(id, full_name, email, phone),
      account:accounts!conversations_account_id_fkey(id, name),
      assignee:profiles!conversations_assigned_to_fkey(id, full_name)
    `)
    .neq('status', 'resolved')
    .order('last_message_at', { ascending: false })
    .limit(50)

  if (!isOpsOrAbove) {
    query.or(`assigned_to.eq.${user.id},assigned_to.is.null`)
  }

  const { data: conversations } = await query

  // Cargar perfiles para asignación (admin/ops)
  const { data: agents } = isOpsOrAbove
    ? await admin
        .from('profiles')
        .select('id, full_name, role')
        .neq('role', 'readonly')
        .eq('is_active', true)
        .order('full_name')
    : { data: [] }

  return (
    <ContactCenterInbox
      initialConversations={(conversations ?? []) as unknown as Parameters<typeof ContactCenterInbox>[0]['initialConversations']}
      agents={(agents ?? []) as { id: string; full_name: string | null; role: string }[]}
      currentUserId={user.id}
      isOpsOrAbove={isOpsOrAbove}
    />
  )
}
