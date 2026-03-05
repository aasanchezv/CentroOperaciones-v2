'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient }      from '@/lib/supabase/server'

export type UserStatus = 'online' | 'busy' | 'offline'

export async function setUserStatus(
  status: UserStatus,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const admin = createAdminClient()
    await admin
      .from('profiles')
      .update({ status, status_updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .throwOnError()

    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}
