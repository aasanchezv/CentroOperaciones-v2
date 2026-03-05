'use server'

import { revalidatePath }    from 'next/cache'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────

export interface GtmInsurerContact {
  id:         string
  insurer_id: string
  name:       string
  email:      string
  phone:      string | null
  role:       string | null
  is_default: boolean
  is_active:  boolean
  created_at: string
}

// ─── Auth helper ──────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Solo admin puede gestionar contactos GTM')
  return { user, admin: createAdminClient() }
}

// ─── getGtmInsurerContacts ────────────────────────────────────

export async function getGtmInsurerContacts(
  insurerId?: string,
): Promise<GtmInsurerContact[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const admin = createAdminClient()
  let query = admin
    .from('gtm_insurer_contacts')
    .select('id, insurer_id, name, email, phone, role, is_default, is_active, created_at')
    .order('is_default', { ascending: false })
    .order('name')

  if (insurerId) query = query.eq('insurer_id', insurerId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as GtmInsurerContact[]
}

// ─── getAllGtmContactsByInsurer ───────────────────────────────

export async function getAllGtmContactsByInsurer(): Promise<
  Record<string, GtmInsurerContact[]>
> {
  const contacts = await getGtmInsurerContacts()
  const result: Record<string, GtmInsurerContact[]> = {}
  for (const c of contacts) {
    if (!result[c.insurer_id]) result[c.insurer_id] = []
    result[c.insurer_id].push(c)
  }
  return result
}

// ─── createGtmInsurerContact ──────────────────────────────────

export async function createGtmInsurerContact(input: {
  insurer_id:  string
  name:        string
  email:       string
  phone?:      string | null
  role?:       string | null
  is_default?: boolean
}): Promise<{ id: string } | { error: string }> {
  try {
    const { admin } = await requireAdmin()

    // Si es default, quitar default de otros
    if (input.is_default) {
      await admin
        .from('gtm_insurer_contacts')
        .update({ is_default: false })
        .eq('insurer_id', input.insurer_id)
    }

    const { data, error } = await admin
      .from('gtm_insurer_contacts')
      .insert({
        insurer_id:  input.insurer_id,
        name:        input.name.trim(),
        email:       input.email.trim().toLowerCase(),
        phone:       input.phone?.trim() ?? null,
        role:        input.role?.trim() ?? 'Cotizaciones',
        is_default:  input.is_default ?? false,
        is_active:   true,
      })
      .select('id')
      .single()

    if (error) return { error: error.message }
    revalidatePath('/admin/go-to-market')
    return { id: data.id }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── updateGtmInsurerContact ──────────────────────────────────

export async function updateGtmInsurerContact(
  id: string,
  input: Partial<{
    name:       string
    email:      string
    phone:      string | null
    role:       string | null
    is_default: boolean
    is_active:  boolean
  }>,
): Promise<{ error?: string }> {
  try {
    const { admin } = await requireAdmin()

    if (input.is_default) {
      // Get insurer_id first
      const { data: existing } = await admin
        .from('gtm_insurer_contacts')
        .select('insurer_id')
        .eq('id', id)
        .single()
      if (existing) {
        await admin
          .from('gtm_insurer_contacts')
          .update({ is_default: false })
          .eq('insurer_id', existing.insurer_id)
          .neq('id', id)
      }
    }

    const { error } = await admin
      .from('gtm_insurer_contacts')
      .update(input)
      .eq('id', id)

    if (error) return { error: error.message }
    revalidatePath('/admin/go-to-market')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ─── deleteGtmInsurerContact ──────────────────────────────────

export async function deleteGtmInsurerContact(id: string): Promise<{ error?: string }> {
  try {
    const { admin } = await requireAdmin()
    const { error } = await admin.from('gtm_insurer_contacts').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/go-to-market')
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}
