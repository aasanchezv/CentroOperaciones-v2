/**
 * cached-queries.ts — Consultas server-side con cache de 5 min (Sprint C)
 *
 * Los catálogos de configuración (movement_types, cobranza_stages, renewal_stages,
 * insurers, quotation_stages) se consultan en casi cada página pero cambian raramente.
 * unstable_cache los almacena en el data cache de Next.js y se invalidan via revalidateTag()
 * cuando el admin los modifica.
 */

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MovementType } from '@/types/database.types'

// ── Movement Types ────────────────────────────────────────────
// Tag: 'movement-types'  →  invalidado en createMovementType/updateMovementType/deleteMovementType

export const getCachedMovementTypes = unstable_cache(
  async (): Promise<MovementType[]> => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('movement_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    return (data ?? []) as MovementType[]
  },
  ['movement-types'],
  { revalidate: 300, tags: ['movement-types'] }
)

// ── Cobranza Stages ───────────────────────────────────────────
// Tag: 'cobranza-stages'  →  invalidado al guardar desde /admin/cobranza

export const getCachedCobranzaStages = unstable_cache(
  async () => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('cobranza_stages')
      .select('id, name, sort_order, send_email, send_whatsapp, email_template_id, whatsapp_template_id, is_active, days_before')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    return data ?? []
  },
  ['cobranza-stages'],
  { revalidate: 300, tags: ['cobranza-stages'] }
)

// ── Renewal Stages ────────────────────────────────────────────
// Tag: 'renewal-stages'  →  invalidado al guardar desde /admin/renovaciones

export const getCachedRenewalStages = unstable_cache(
  async () => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('renewal_stages')
      .select('id, name, sort_order, email_template_id, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    return data ?? []
  },
  ['renewal-stages'],
  { revalidate: 300, tags: ['renewal-stages'] }
)

// ── Insurers (lista activa) ───────────────────────────────────
// Tag: 'insurers'  →  invalidado al crear/editar/eliminar aseguradora

export const getCachedInsurers = unstable_cache(
  async () => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('insurers')
      .select('id, name, short_name, email, logo_url')
      .eq('is_active', true)
      .order('name', { ascending: true })
    return data ?? []
  },
  ['insurers'],
  { revalidate: 600, tags: ['insurers'] }
)

// ── Quotation Stages ──────────────────────────────────────────
// Tag: 'quotation-stages'  →  invalidado al guardar desde /admin/cotizaciones

export const getCachedQuotationStages = unstable_cache(
  async (teamId?: string | null) => {
    const admin = createAdminClient()
    let q = admin
      .from('quotation_stages')
      .select('id, name, sort_order, is_active, team_id')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (teamId) {
      q = q.or(`team_id.eq.${teamId},team_id.is.null`)
    }

    const { data } = await q
    return data ?? []
  },
  ['quotation-stages'],
  { revalidate: 300, tags: ['quotation-stages'] }
)
