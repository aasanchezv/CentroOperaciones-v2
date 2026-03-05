'use server'

import { revalidatePath } from 'next/cache'
import { redirect }       from 'next/navigation'
import { createClient }   from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Insurer, CommissionCode } from '@/types/database.types'

// ── Auth helpers ───────────────────────────────────────────────────────────

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, userId: user.id }
}

async function requireAdminOps() {
  const { supabase, userId } = await requireAuth()
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', userId).single()
  if (!profile || !['admin', 'ops'].includes(profile.role)) redirect('/dashboard')
  return { supabase, userId }
}

// ── Insurers ───────────────────────────────────────────────────────────────

/** Lista todas las aseguradoras activas (para dropdowns en forms de pólizas) */
export async function getInsurers(): Promise<Insurer[]> {
  const { supabase } = await requireAuth()
  const { data } = await supabase
    .from('insurers')
    .select('*')
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as Insurer[]
}

/** Lista todas las aseguradoras (admin — incluye inactivas) */
export async function getAllInsurers(): Promise<Insurer[]> {
  await requireAdminOps()
  const admin = createAdminClient()
  const { data } = await admin
    .from('insurers')
    .select('*')
    .order('name')
  return (data ?? []) as Insurer[]
}

export async function createInsurer(data: {
  name:                   string
  short_name?:            string
  email?:                 string
  phone?:                 string
  website?:               string
  notes?:                 string
  sla_quote_hours?:       number | null
  sla_endorsement_hours?: number | null
  sla_issuance_hours?:    number | null
  sla_notes?:             string
}): Promise<{ insurer?: Insurer; error?: string }> {
  await requireAdminOps()
  const admin = createAdminClient()

  const { data: row, error } = await admin.from('insurers').insert({
    name:                   data.name.trim(),
    short_name:             data.short_name?.trim() || null,
    email:                  data.email?.trim() || null,
    phone:                  data.phone?.trim() || null,
    website:                data.website?.trim() || null,
    notes:                  data.notes?.trim() || null,
    sla_quote_hours:        data.sla_quote_hours       ?? null,
    sla_endorsement_hours:  data.sla_endorsement_hours ?? null,
    sla_issuance_hours:     data.sla_issuance_hours    ?? null,
    sla_notes:              data.sla_notes?.trim()     || null,
  }).select().single()

  if (error) return { error: error.message }
  revalidatePath('/admin/aseguradoras')
  return { insurer: row as Insurer }
}

export async function updateInsurer(
  id: string,
  data: {
    name?:                  string
    short_name?:            string
    email?:                 string
    phone?:                 string
    website?:               string
    notes?:                 string
    is_active?:             boolean
    sla_quote_hours?:       number | null
    sla_endorsement_hours?: number | null
    sla_issuance_hours?:    number | null
    sla_notes?:             string | null
  }
): Promise<{ error?: string }> {
  await requireAdminOps()
  const admin = createAdminClient()

  const patch: Record<string, unknown> = {}
  if (data.name                  !== undefined) patch.name                  = data.name.trim()
  if (data.short_name            !== undefined) patch.short_name            = data.short_name?.trim() || null
  if (data.email                 !== undefined) patch.email                 = data.email?.trim() || null
  if (data.phone                 !== undefined) patch.phone                 = data.phone?.trim() || null
  if (data.website               !== undefined) patch.website               = data.website?.trim() || null
  if (data.notes                 !== undefined) patch.notes                 = data.notes?.trim() || null
  if (data.is_active             !== undefined) patch.is_active             = data.is_active
  if (data.sla_quote_hours       !== undefined) patch.sla_quote_hours       = data.sla_quote_hours
  if (data.sla_endorsement_hours !== undefined) patch.sla_endorsement_hours = data.sla_endorsement_hours
  if (data.sla_issuance_hours    !== undefined) patch.sla_issuance_hours    = data.sla_issuance_hours
  if (data.sla_notes             !== undefined) patch.sla_notes             = data.sla_notes?.trim() || null

  const { error } = await admin.from('insurers').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/aseguradoras')
  return {}
}

export async function deleteInsurer(id: string): Promise<{ error?: string }> {
  await requireAdminOps()
  const admin = createAdminClient()
  const { error } = await admin.from('insurers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/aseguradoras')
  return {}
}

export async function uploadInsurerLogo(
  insurerId: string,
  base64:    string,
  mimeType:  string,
): Promise<{ url?: string; error?: string }> {
  await requireAdminOps()
  const admin = createAdminClient()

  const ext  = mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'png'
  const path = `${insurerId}.${ext}`
  const buffer = Buffer.from(base64, 'base64')

  const { error: uploadError } = await admin.storage
    .from('insurer-logos')
    .upload(path, buffer, { contentType: mimeType, upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data } = admin.storage.from('insurer-logos').getPublicUrl(path)
  const url = data.publicUrl

  await admin.from('insurers').update({ logo_url: url }).eq('id', insurerId)
  revalidatePath('/admin/aseguradoras')
  return { url }
}

// ── Commission codes ───────────────────────────────────────────────────────

/** Obtiene todos los códigos de comisión agrupados por aseguradora (admin) */
export async function getCommissionCodesByInsurer(insurerId: string): Promise<CommissionCode[]> {
  await requireAuth()
  const admin = createAdminClient()
  const { data } = await admin
    .from('commission_codes')
    .select('*')
    .eq('insurer_id', insurerId)
    .order('is_active', { ascending: false })
    .order('branch')
    .order('code')
  return (data ?? []) as CommissionCode[]
}

/** Obtiene TODOS los códigos activos con su aseguradora (para el form de póliza) */
export async function getAllActiveCommissionCodes(): Promise<
  (CommissionCode & { insurer_name: string })[]
> {
  const { supabase } = await requireAuth()
  const { data } = await supabase
    .from('commission_codes')
    .select('*, insurers!commission_codes_insurer_id_fkey(name)')
    .eq('is_active', true)
    .order('insurers(name)')
    .order('code')

  return (data ?? []).map((row) => {
    const ins = Array.isArray(row.insurers) ? row.insurers[0] : row.insurers
    return { ...row, insurer_name: (ins as { name: string } | null)?.name ?? '' }
  }) as (CommissionCode & { insurer_name: string })[]
}

export async function createCommissionCode(data: {
  insurer_id:      string
  code:            string
  branch?:         string
  description?:    string
  rate_pct?:       number
  rate_flat?:      number
  effective_from?: string
  effective_to?:   string
  portal_user?:    string
  portal_password?: string
}): Promise<{ error?: string }> {
  const { userId } = await requireAdminOps()
  const admin = createAdminClient()

  const { error } = await admin.from('commission_codes').insert({
    insurer_id:      data.insurer_id,
    code:            data.code.trim(),
    branch:          data.branch?.trim() || null,
    description:     data.description?.trim() || null,
    rate_pct:        data.rate_pct ?? null,
    rate_flat:       data.rate_flat ?? null,
    effective_from:  data.effective_from || null,
    effective_to:    data.effective_to   || null,
    portal_user:     data.portal_user?.trim() || null,
    portal_password: data.portal_password?.trim() || null,
    created_by:      userId,
    updated_by:      userId,
  })

  if (error) return { error: error.message }
  revalidatePath('/admin/aseguradoras')
  return {}
}

export async function updateCommissionCode(
  id: string,
  data: {
    code?:           string
    branch?:         string
    description?:    string
    rate_pct?:       number | null
    rate_flat?:      number | null
    effective_from?: string
    effective_to?:   string
    is_active?:      boolean
    portal_user?:    string | null
    portal_password?: string | null
  }
): Promise<{ error?: string }> {
  const { userId } = await requireAdminOps()
  const admin = createAdminClient()

  const patch: Record<string, unknown> = { updated_by: userId }
  if (data.code            !== undefined) patch.code            = data.code.trim()
  if (data.branch          !== undefined) patch.branch          = data.branch?.trim() || null
  if (data.description     !== undefined) patch.description     = data.description?.trim() || null
  if (data.rate_pct        !== undefined) patch.rate_pct        = data.rate_pct
  if (data.rate_flat       !== undefined) patch.rate_flat       = data.rate_flat
  if (data.effective_from  !== undefined) patch.effective_from  = data.effective_from || null
  if (data.effective_to    !== undefined) patch.effective_to    = data.effective_to   || null
  if (data.is_active       !== undefined) patch.is_active       = data.is_active
  if (data.portal_user     !== undefined) patch.portal_user     = data.portal_user?.trim() || null
  if (data.portal_password !== undefined) patch.portal_password = data.portal_password?.trim() || null

  const { error } = await admin.from('commission_codes').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/aseguradoras')
  return {}
}

export async function deleteCommissionCode(id: string): Promise<{ error?: string }> {
  await requireAdminOps()
  const admin = createAdminClient()
  const { error } = await admin.from('commission_codes').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/aseguradoras')
  return {}
}
