'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PolicyBranch, PolicyStatus } from '@/types/database.types'

async function requireOperator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (!profile || profile.role === 'readonly') redirect('/dashboard')
  return { supabase, userId: user.id }
}

export async function createPolicy(accountId: string, formData: FormData) {
  const { supabase, userId } = await requireOperator()

  const payload = {
    account_id:          accountId,
    policy_number:       (formData.get('policy_number') as string) || null,
    branch:              formData.get('branch') as PolicyBranch,
    insurer:             formData.get('insurer') as string,
    status:             (formData.get('status') as PolicyStatus) ?? 'active',
    premium:             formData.get('premium') ? Number(formData.get('premium')) : null,
    start_date:         (formData.get('start_date') as string) || null,
    end_date:           (formData.get('end_date') as string) || null,
    tomador_id:         (formData.get('tomador_id') as string) || null,
    policy_url:         (formData.get('policy_url') as string) || null,
    commission_code_id: (formData.get('commission_code_id') as string) || null,
    payment_frequency:  (formData.get('payment_frequency') as string) || 'anual',
    notes:              (formData.get('notes') as string) || null,
    created_by:          userId,
  }

  const { data: policy, error } = await supabase
    .from('policies')
    .insert(payload)
    .select('id')
    .single()

  if (error) return { error: error.message }

  void createAdminClient().from('audit_events').insert({
    actor_id:    userId,
    action:      'policy.created',
    entity_type: 'policy',
    entity_id:   policy.id,
    payload:     { account_id: accountId, branch: payload.branch, insurer: payload.insurer },
  })

  revalidatePath(`/accounts/${accountId}`)
}

export async function deletePolicy(policyId: string, accountId: string) {
  const { supabase, userId } = await requireOperator()

  const { error } = await supabase.from('policies').delete().eq('id', policyId)
  if (error) throw new Error(error.message)

  void createAdminClient().from('audit_events').insert({
    actor_id:    userId,
    action:      'policy.deleted',
    entity_type: 'policy',
    entity_id:   policyId,
    payload:     { account_id: accountId },
  })

  revalidatePath(`/accounts/${accountId}`)
}
