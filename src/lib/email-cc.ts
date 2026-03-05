/**
 * email-cc.ts — Server-only utility
 * Lee email_cc y vip_email_cc desde el equipo del agente.
 * Fallback a app_settings globales si el equipo no tiene configuración.
 * Usar solo en route handlers y server actions.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export async function getEmailCcList(isVip = false, teamId?: string): Promise<string[]> {
  const admin = createAdminClient()
  const cc: string[] = []

  // 1. Intentar leer desde el equipo si se provee teamId
  if (teamId) {
    const { data: team } = await admin
      .from('teams')
      .select('email_cc, vip_email_cc')
      .eq('id', teamId)
      .single()

    if (team?.email_cc?.trim())               cc.push(team.email_cc.trim())
    if (isVip && team?.vip_email_cc?.trim())  cc.push(team.vip_email_cc.trim())

    // Si el equipo tiene configuración, usarla (no fallback)
    if (cc.length > 0) return cc
  }

  // 2. Fallback a app_settings globales
  const keys = isVip ? ['global_email_cc', 'vip_email_cc'] : ['global_email_cc']
  const { data } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', keys)

  const map = Object.fromEntries(
    (data ?? []).map(s => [s.key, (s.value ?? '').trim()])
  )

  if (map.global_email_cc) cc.push(map.global_email_cc)
  if (isVip && map.vip_email_cc) cc.push(map.vip_email_cc)
  return cc
}
