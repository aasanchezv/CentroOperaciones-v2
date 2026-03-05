import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, CheckCircle2 } from 'lucide-react'
import { RenewalStageActions } from './renewal-stage-actions'
import { RenewalTimeline }     from './renewal-timeline'
import { CloseRenewalDialog }  from './close-renewal-dialog'
import { Badge } from '@/components/ui/badge'
import type { RenewalStatus, PolicyBranch } from '@/types/database.types'

const branchLabel: Record<PolicyBranch, string> = {
  gmm: 'Gastos Médicos', vida: 'Vida', auto: 'Autos', rc: 'Responsabilidad Civil',
  danos: 'Daños', transporte: 'Transportes', fianzas: 'Fianzas',
  ap: 'Acc. Personales', tecnicos: 'Riesgos Técnicos', otro: 'Otro',
}

const statusLabel: Record<RenewalStatus, string> = {
  in_progress:             'En proceso',
  changes_requested:       'Cambios solicitados',
  cancelled:               'Cancelada',
  renewed_pending_payment: 'Renovada — Pendiente de pago',
  renewed_paid:            'Renovada y pagada ✓',
}
const statusClass: Record<RenewalStatus, string> = {
  in_progress:             'bg-blue-50 text-blue-700 border-blue-200',
  changes_requested:       'bg-amber-50 text-amber-700 border-amber-200',
  cancelled:               'bg-red-50 text-red-600 border-red-200',
  renewed_pending_payment: 'bg-orange-50 text-orange-700 border-orange-200',
  renewed_paid:            'bg-green-50 text-green-700 border-green-200',
}

export default async function RenewalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: renewalId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') redirect('/dashboard')

  const admin = createAdminClient()

  const { data: renewal } = await admin
    .from('renewals')
    .select(`
      id, status, client_confirmed_at, call_attempts, notes, created_at, updated_at,
      policy:policies!renewals_policy_id_fkey(
        id, policy_number, insurer, branch, premium, start_date, end_date,
        tomador:contacts!policies_tomador_id_fkey(id, full_name, email, phone)
      ),
      new_policy:policies!renewals_new_policy_id_fkey(
        id, policy_number, insurer, premium, start_date, end_date
      ),
      account:accounts!renewals_account_id_fkey(id, name, account_code),
      assigned_profile:profiles!renewals_assigned_to_fkey(id, full_name, email),
      stage:renewal_stages!renewals_current_stage_id_fkey(id, name, sort_order, send_email, send_whatsapp, requires_new_policy)
    `)
    .eq('id', renewalId)
    .single()

  if (!renewal) notFound()

  const [{ data: events }, { data: stages }] = await Promise.all([
    admin.from('renewal_events')
      .select('id, action, notes, metadata, created_at, actor_id, stage_id')
      .eq('renewal_id', renewalId)
      .order('created_at', { ascending: true }),
    admin.from('renewal_stages')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ])

  const policy   = Array.isArray(renewal.policy)   ? renewal.policy[0]   : renewal.policy
  const account  = Array.isArray(renewal.account)  ? renewal.account[0]  : renewal.account
  const stage    = Array.isArray(renewal.stage)    ? renewal.stage[0]    : renewal.stage
  const newPol   = Array.isArray(renewal.new_policy) ? renewal.new_policy[0] : renewal.new_policy
  const tomador  = policy ? (Array.isArray(policy.tomador) ? policy.tomador[0] : policy.tomador) : null
  const executor = Array.isArray(renewal.assigned_profile) ? renewal.assigned_profile[0] : renewal.assigned_profile

  const currentStageIdx  = stages?.findIndex(s => s.id === stage?.id) ?? -1

  // Último envío de cada canal para mostrar en el panel de acciones
  const emailSentAt    = events?.filter(e => e.action === 'email_sent').at(-1)?.created_at ?? null
  const whatsappSentAt = events?.filter(e => e.action === 'whatsapp_sent').at(-1)?.created_at ?? null

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/renovaciones" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Renovaciones
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700">{account?.name ?? renewalId}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{account?.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {policy ? branchLabel[policy.branch as PolicyBranch] : '—'} · {policy?.insurer ?? '—'}
            {policy?.policy_number ? ` · ${policy.policy_number}` : ''}
          </p>
          {executor && (
            <p className="text-xs text-gray-400 mt-1">Ejecutivo: {executor.full_name ?? executor.email}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {renewal.client_confirmed_at && (
            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Cliente confirmó
            </span>
          )}
          <Badge variant="outline" className={`text-xs ${statusClass[renewal.status as RenewalStatus]}`}>
            {statusLabel[renewal.status as RenewalStatus]}
          </Badge>
        </div>
      </div>

      {/* Progress bar de stages */}
      {stages && stages.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <p className="text-xs font-medium text-gray-500 mb-4">Progreso del pipeline</p>
          <div className="flex items-center gap-0">
            {stages.map((s, idx) => {
              const isDone    = currentStageIdx > idx
              const isCurrent = currentStageIdx === idx
              const isLast    = idx === stages.length - 1
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                      isDone    ? 'bg-green-500 border-green-500 text-white'    :
                      isCurrent ? 'bg-blue-500 border-blue-500 text-white'     :
                                  'bg-white border-gray-200 text-gray-400'
                    }`}>
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <p className={`text-xs mt-1 text-center max-w-[80px] leading-tight ${
                      isCurrent ? 'text-blue-600 font-medium' :
                      isDone    ? 'text-green-600'            :
                                  'text-gray-400'
                    }`}>
                      {s.name}
                    </p>
                  </div>
                  {!isLast && (
                    <div className={`h-0.5 flex-1 mb-5 ${isDone ? 'bg-green-400' : 'bg-gray-100'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <p className="text-xs font-medium text-gray-500">Póliza vigente</p>
          <div className="space-y-1.5 text-sm">
            <Row label="Aseguradora" value={policy?.insurer ?? '—'} />
            <Row label="Número" value={policy?.policy_number ?? '—'} />
            <Row label="Vencimiento" value={policy?.end_date ? new Date(policy.end_date).toLocaleDateString('es-MX') : '—'} />
            <Row label="Prima" value={policy?.premium ? `$${policy.premium.toLocaleString('es-MX')} MXN` : '—'} />
          </div>
          {tomador && (
            <>
              <p className="text-xs font-medium text-gray-500 pt-2">Tomador</p>
              <div className="space-y-1.5 text-sm">
                <Row label="Nombre"  value={tomador.full_name} />
                {tomador.email && <Row label="Email"  value={tomador.email} />}
                {tomador.phone && <Row label="Tel"    value={tomador.phone} />}
              </div>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border p-5 space-y-3">
          <p className="text-xs font-medium text-gray-500">Nueva póliza</p>
          {newPol ? (
            <div className="space-y-1.5 text-sm">
              <Row label="Número"   value={newPol.policy_number ?? '—'} />
              <Row label="Inicio"   value={newPol.start_date ? new Date(newPol.start_date).toLocaleDateString('es-MX') : '—'} />
              <Row label="Fin"      value={newPol.end_date ? new Date(newPol.end_date).toLocaleDateString('es-MX') : '—'} />
              <Row label="Prima"    value={newPol.premium ? `$${newPol.premium.toLocaleString('es-MX')} MXN` : '—'} />
              {policy?.premium && newPol.premium && (
                <PremiumDiff prev={policy.premium} next={newPol.premium} />
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Aún no vinculada</p>
          )}
        </div>
      </div>

      {/* Acciones del stage actual */}
      {renewal.status === 'in_progress' && (
        <RenewalStageActions
          renewalId={renewal.id}
          stage={stage as { id: string; name: string; sort_order: number; send_email: boolean; send_whatsapp: boolean; requires_new_policy: boolean } | null}
          hasNewPolicy={!!newPol}
          callAttempts={renewal.call_attempts}
          clientConfirmed={!!renewal.client_confirmed_at}
          accountId={(account as { id: string } | null)?.id ?? ''}
          policyId={(policy as { id: string } | null)?.id ?? ''}
          emailSentAt={emailSentAt}
          whatsappSentAt={whatsappSentAt}
        />
      )}

      {/* Cerrar renovación */}
      {renewal.status === 'in_progress' && (
        <CloseRenewalDialog renewalId={renewal.id} />
      )}

      {/* Timeline */}
      <RenewalTimeline events={(events ?? []) as Parameters<typeof RenewalTimeline>[0]['events']} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  )
}

function PremiumDiff({ prev, next }: { prev: number; next: number }) {
  const diff = next - prev
  const pct  = prev > 0 ? ((diff / prev) * 100).toFixed(1) : '0'
  if (diff === 0) return null
  const isIncrease = diff > 0
  return (
    <div className={`text-xs rounded px-2 py-1 ${isIncrease ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
      {isIncrease ? '▲' : '▼'} {isIncrease ? '+' : ''}${Math.abs(diff).toLocaleString('es-MX')} ({isIncrease ? '+' : ''}{pct}%)
    </div>
  )
}
