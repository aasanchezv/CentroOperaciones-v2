import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PolicyBranch, PolicyStatus } from '@/types/database.types'

const VALID_BRANCHES: PolicyBranch[] = ['gmm','vida','auto','rc','danos','transporte','fianzas','ap','tecnicos','otro']
const VALID_STATUSES: PolicyStatus[] = ['active','pending_renewal','expired','cancelled','quote']

export interface ImportPolicyRow {
  account_id:    string
  branch:        PolicyBranch
  insurer:       string
  policy_number: string | null
  status:        PolicyStatus
  start_date:    string | null
  end_date:      string | null
  premium:       number | null
  tomador_id:    string | null
  notes:         string | null
}

export interface ImportResult {
  inserted: number
  failed:   { row: number; error: string }[]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const body = await request.json() as { rows: ImportPolicyRow[] }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'Sin filas para importar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const failed: ImportResult['failed'] = []
  const valid: (ImportPolicyRow & { created_by: string })[] = []

  body.rows.forEach((row, i) => {
    const rowNum = i + 2 // row 1 = header
    if (!row.account_id)  return failed.push({ row: rowNum, error: 'Cuenta no encontrada' })
    if (!VALID_BRANCHES.includes(row.branch)) return failed.push({ row: rowNum, error: `Ramo inválido: ${row.branch}` })
    if (!row.insurer?.trim())                 return failed.push({ row: rowNum, error: 'Aseguradora requerida' })
    if (row.status && !VALID_STATUSES.includes(row.status)) row.status = 'active'
    valid.push({ ...row, created_by: user.id })
  })

  let inserted = 0
  if (valid.length > 0) {
    const { data, error } = await admin.from('policies').insert(valid).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted = data?.length ?? 0

    await admin.from('audit_events').insert({
      actor_id:    user.id,
      action:      'policies.bulk_imported',
      entity_type: 'policy',
      entity_id:   null,
      payload:     { inserted, failed: failed.length },
    })
  }

  return NextResponse.json({ inserted, failed } satisfies ImportResult)
}
