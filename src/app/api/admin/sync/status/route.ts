import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/sync/status?runId=xxx
 * Retorna el estado actual de un sync_run (para polling desde el cliente).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (!['admin', 'ops'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const runId = req.nextUrl.searchParams.get('runId')

  if (runId) {
    // Estado de un run específico
    const { data, error } = await supabase
      .from('sync_runs')
      .select('id, status, started_at, finished_at, accounts_upserted, contacts_upserted, policies_upserted, policies_cancelled, receipts_upserted, renewals_created, error_count')
      .eq('id', runId)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  }

  // Sin runId: retornar el último run
  const { data, error } = await supabase
    .from('sync_runs')
    .select('id, status, started_at, finished_at, accounts_upserted, policies_upserted, error_count')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? { status: 'none' })
}
