import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { NewContactDialog }  from './new-contact-dialog'
import { DeleteContactButton } from './delete-contact-button'
import { EditAccountDialog } from './edit-account-dialog'
import { NewPolicyDialog }   from './new-policy-dialog'
import { DeletePolicyButton } from './delete-policy-button'
import { CobrarDialog }      from './cobrar-dialog'
import { PolicyMovementsSection } from './policy-movements-section'
import { AccountClaimsSection }   from './account-claims-section'
import { PortalSection }          from './portal-section'
import { AccountBitacora }        from './account-bitacora'
import { Badge } from '@/components/ui/badge'
import {
  Building2, Mail, Phone, Hash, User, Users, ChevronLeft, Star,
  ShieldCheck, Calendar, Banknote, CreditCard, MessageCircle, Percent,
} from 'lucide-react'
import type { AccountStatus, AccountType, PolicyBranch, PolicyStatus, PolicyMovement } from '@/types/database.types'
import type { CollectionTemplate } from '@/app/actions/collection-actions'
import { getInsurers, getAllActiveCommissionCodes } from '@/app/actions/commission-actions'
import { getCachedMovementTypes } from '@/lib/cached-queries'
import { getClaimsForAccount }    from '@/app/actions/claim-actions'
import { GenerateReceiptsButton } from './generate-receipts-button'
import { getPortalAgents }        from '@/app/actions/activity-actions'

const statusLabel: Record<AccountStatus, string> = {
  prospect: 'Prospecto',
  active:   'Activa',
  inactive: 'Inactiva',
}
const statusClass: Record<AccountStatus, string> = {
  prospect: 'bg-amber-50 text-amber-600 border-amber-200',
  active:   'bg-emerald-50 text-emerald-600 border-emerald-200',
  inactive: 'bg-gray-50 text-gray-400 border-gray-200',
}
const typeLabel: Record<AccountType, string> = {
  empresa:       'Empresa',
  persona_fisica: 'Persona física',
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  const isReadonly = !profile || profile.role === 'readonly'
  const canSetVip  = ['admin', 'ops', 'manager'].includes(profile?.role ?? '')

  const admin = createAdminClient()

  const [
    { data: account },
    { data: contacts },
    { data: teams },
    { data: agents },
    { data: policies },
    { data: collectionTemplates },
    { data: collectionSends },
    insurers,
    commissionCodes,
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('*, teams(name), profiles!assigned_to(full_name, email)')
      .eq('id', id)
      .single(),
    supabase
      .from('contacts')
      .select('*')
      .eq('account_id', id)
      .order('is_primary', { ascending: false })
      .order('created_at'),
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('profiles').select('id, full_name, email').eq('is_active', true)
      .in('role', ['admin', 'ops', 'manager', 'agent']).order('full_name'),
    supabase
      .from('policies')
      .select('*, contacts!tomador_id(full_name, email, phone, position), commission_codes!commission_code_id(code, rate_pct, rate_flat)')
      .eq('account_id', id)
      .order('status')
      .order('end_date'),
    // ^^ payment_frequency ya está incluido en * (migration 026)
    // Plantillas de cobranza (propias + compartidas, solo activas)
    isReadonly ? Promise.resolve({ data: [] }) : supabase
      .from('collection_templates')
      .select('*')
      .eq('is_active', true)
      .or(`created_by.eq.${user.id},is_shared.eq.true`)
      .order('name'),
    // Historial de cobros de esta cuenta (últimos 30)
    admin
      .from('collection_sends')
      .select('*, policies(policy_number, insurer, branch), profiles!sent_by(full_name)')
      .eq('account_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    // Aseguradoras activas (para form nueva póliza)
    getInsurers(),
    // Códigos de comisión activos (para form nueva póliza)
    getAllActiveCommissionCodes(),
  ])

  // Movements, claims, portal AI agents (after account check)
  const [movementTypesData, { data: accountMovements }, accountClaims, portalAgents] = await Promise.all([
    getCachedMovementTypes(),
    admin
      .from('policy_movements')
      .select('*')
      .eq('account_id', id)
      .order('created_at', { ascending: false }),
    getClaimsForAccount(id),
    getPortalAgents(),
  ])

  if (!account) notFound()

  const teamName = (Array.isArray(account.teams)
    ? account.teams[0]
    : account.teams as { name: string } | null)?.name

  const assignedProfile = Array.isArray(account.profiles)
    ? account.profiles[0] as { full_name: string | null; email: string } | null
    : account.profiles as { full_name: string | null; email: string } | null

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Cuentas
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">{account.name}</h1>
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${statusClass[account.status as AccountStatus]}`}>
                {statusLabel[account.status as AccountStatus]}
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{account.account_code}</p>
          </div>
        </div>
        <EditAccountDialog
          account={account}
          teams={teams ?? []}
          agents={agents ?? []}
        />
      </div>

      {/* Info grid */}
      <div className="rounded-xl border bg-white shadow-sm p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Información</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="Tipo" value={typeLabel[account.type as AccountType]} />
          {account.rfc && <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="RFC" value={account.rfc} mono />}
          {account.email && <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Correo" value={account.email} />}
          {account.phone && <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Teléfono" value={account.phone} />}
          {teamName && <InfoRow icon={<Users className="h-3.5 w-3.5" />} label="Equipo" value={teamName} />}
          {assignedProfile && (
            <InfoRow
              icon={<User className="h-3.5 w-3.5" />}
              label="Agente"
              value={assignedProfile.full_name ?? assignedProfile.email}
            />
          )}
        </div>
        {account.notes && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-gray-400 mb-1">Notas</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{account.notes}</p>
          </div>
        )}
      </div>

      {/* Contactos */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-medium text-gray-700">
              Contactos
              {contacts && contacts.length > 0 && (
                <span className="ml-2 text-xs text-gray-400">({contacts.length})</span>
              )}
            </h2>
          </div>
          <NewContactDialog
            accountId={id}
            accountName={account.name}
            accountEmail={account.email}
            accountPhone={account.phone}
            accountType={account.type}
            canSetVip={canSetVip}
          />
        </div>

        {contacts && contacts.length > 0 ? (
          <ul className="divide-y">
            {contacts.map((contact) => (
              <li key={contact.id} className="group flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0 select-none">
                  {contact.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-900 truncate">{contact.full_name}</p>
                    {contact.is_primary && (
                      <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                    )}
                    {contact.is_vip && (
                      <span
                        title={contact.vip_notes ?? 'Cliente VIP'}
                        className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                      >
                        ⭐ VIP
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {contact.position && <span className="text-xs text-gray-400">{contact.position}</span>}
                    {contact.email && (
                      <>
                        {contact.position && <span className="text-gray-200">·</span>}
                        <span className="text-xs text-gray-400">{contact.email}</span>
                      </>
                    )}
                    {contact.phone && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">{contact.phone}</span>
                      </>
                    )}
                  </div>
                </div>
                <DeleteContactButton contactId={contact.id} accountId={id} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-gray-300">
            <User className="h-7 w-7 mb-2" />
            <p className="text-sm text-gray-400">Sin contactos</p>
            <p className="text-xs mt-0.5">Agrega el primer contacto arriba</p>
          </div>
        )}
      </div>

      {/* Pólizas */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-medium text-gray-700">
              Pólizas
              {policies && policies.length > 0 && (
                <span className="ml-2 text-xs text-gray-400">({policies.length})</span>
              )}
            </h2>
          </div>
          <NewPolicyDialog
            accountId={id}
            contacts={contacts ?? []}
            insurers={insurers}
            commissionCodes={commissionCodes}
          />
        </div>

        {policies && policies.length > 0 ? (
          <ul className="divide-y">
            {policies.map((policy) => {
              const tomador = (Array.isArray(policy.contacts)
                ? policy.contacts[0]
                : policy.contacts) as { full_name: string; position: string | null } | null

              const pStatus = policy.status as PolicyStatus
              const pBranch = policy.branch as PolicyBranch

              const tomadorFull = tomador as unknown as {
                full_name: string; email: string | null; phone: string | null; position: string | null
              } | null

              // Comisión estimada de la póliza
              const commCode = (Array.isArray(policy.commission_codes)
                ? policy.commission_codes[0]
                : policy.commission_codes) as { code: string; rate_pct: number | null; rate_flat: number | null } | null
              const commEstimate = (() => {
                if (!commCode || !policy.premium) return null
                if (commCode.rate_pct != null) return (policy.premium * commCode.rate_pct) / 100
                if (commCode.rate_flat != null) return commCode.rate_flat
                return null
              })()

              const policyMovements = (accountMovements ?? []).filter(
                (m: PolicyMovement) => m.policy_id === policy.id
              )

              return (
                <li key={policy.id} className="group px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Ramo badge */}
                    <div className={`mt-0.5 shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${branchClass[pBranch]}`}>
                      {branchLabel[pBranch]}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{policy.insurer}</p>
                        {policy.policy_number && (
                          <span className="text-xs font-mono text-gray-400">{policy.policy_number}</span>
                        )}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${policyStatusClass[pStatus]}`}>
                          {policyStatusLabel[pStatus]}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {(policy.start_date || policy.end_date) && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Calendar className="h-3 w-3" />
                            {policy.start_date
                              ? new Date(policy.start_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                            {' → '}
                            {policy.end_date
                              ? new Date(policy.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </span>
                        )}
                        {policy.premium && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Banknote className="h-3 w-3" />
                            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(policy.premium)}
                          </span>
                        )}
                        {commEstimate != null && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <Percent className="h-3 w-3" />
                            Comisión: {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(commEstimate)}
                            {commCode?.rate_pct != null && ` (${commCode.rate_pct}%)`}
                          </span>
                        )}
                        {tomadorFull && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                            <User className="h-3 w-3" />
                            {tomadorFull.full_name}{tomadorFull.position ? ` · ${tomadorFull.position}` : ''}
                          </span>
                        )}
                      </div>

                      {/* Movements section */}
                      <PolicyMovementsSection
                        policy={{
                          id:           policy.id,
                          policy_number: policy.policy_number ?? null,
                          branch:       policy.branch,
                          insurer:      policy.insurer,
                          account_type: account.type,
                        }}
                        movementTypes={movementTypesData}
                        movements={policyMovements}
                        isReadonly={isReadonly}
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Generar recibos de cobranza */}
                      {!isReadonly && (
                        <GenerateReceiptsButton
                          policyId={policy.id}
                          paymentFrequency={(policy as Record<string, unknown>).payment_frequency as string | null}
                        />
                      )}
                      {/* Botón Cobrar — solo no-readonly con plantillas */}
                      {!isReadonly && (collectionTemplates ?? []).length > 0 && (
                        <CobrarDialog
                          policy={{
                            ...policy,
                            contacts: tomadorFull,
                          }}
                          accountName={account.name}
                          executiveName={profile?.full_name ?? 'Ejecutivo'}
                          templates={(collectionTemplates ?? []) as CollectionTemplate[]}
                        />
                      )}
                      <DeletePolicyButton policyId={policy.id} accountId={id} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-gray-300">
            <ShieldCheck className="h-7 w-7 mb-2" />
            <p className="text-sm text-gray-400">Sin pólizas</p>
            <p className="text-xs mt-0.5">Agrega la primera póliza arriba</p>
          </div>
        )}
      </div>
      {/* Siniestros */}
      <div className="rounded-xl border bg-white shadow-sm p-5">
        <AccountClaimsSection claims={accountClaims} />
      </div>

      {/* Portal del cliente */}
      <PortalSection
        accountId={id}
        initialToken={account.portal_token ?? null}
        initialEnabled={account.portal_enabled ?? false}
        initialLastAccessed={account.portal_last_accessed_at ?? null}
        canManageAI={['admin', 'ops'].includes(profile?.role ?? '')}
        portalAgents={portalAgents}
        initialAgentId={(account as unknown as { ai_agent_id?: string | null }).ai_agent_id ?? null}
      />

      {/* Bitácora del cliente */}
      <AccountBitacora accountId={id} />

      {/* Historial de cobros */}
      {(collectionSends ?? []).length > 0 && (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b">
            <CreditCard className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-medium text-gray-700">
              Historial de cobros
              <span className="ml-2 text-xs text-gray-400">({collectionSends?.length})</span>
            </h2>
          </div>
          <ul className="divide-y">
            {(collectionSends ?? []).map((send) => {
              const sendPolicy = (Array.isArray(send.policies) ? send.policies[0] : send.policies) as
                { policy_number: string | null; insurer: string | null; branch: string } | null
              const sender = (Array.isArray(send.profiles) ? send.profiles[0] : send.profiles) as
                { full_name: string | null } | null
              return (
                <li key={send.id} className="flex items-center gap-4 px-5 py-3 text-xs text-gray-600">
                  <span className="text-gray-400 shrink-0 tabular-nums">
                    {new Date(send.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="flex-1 truncate">
                    {sendPolicy?.insurer ?? '—'}
                    {sendPolicy?.policy_number && <span className="font-mono text-gray-400 ml-1.5">{sendPolicy.policy_number}</span>}
                  </span>
                  <span className="text-gray-400 truncate">{send.template_name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {send.channel.includes('whatsapp') && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#e7ffd9] text-[#128c7e] px-2 py-0.5 text-[10px] font-medium">
                        <MessageCircle className="h-3 w-3" /> WA
                      </span>
                    )}
                    {send.channel.includes('email') && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-[10px] font-medium">
                        <Mail className="h-3 w-3" /> Email
                      </span>
                    )}
                  </div>
                  {sender?.full_name && (
                    <span className="text-gray-400 shrink-0">{sender.full_name}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Lookup tables ────────────────────────────────────────────────────────────

const branchLabel: Record<PolicyBranch, string> = {
  gmm:        'GMM',
  vida:       'Vida',
  auto:       'Auto',
  rc:         'RC',
  danos:      'Daños',
  transporte: 'Transp.',
  fianzas:    'Fianzas',
  ap:         'AP',
  tecnicos:   'Técnicos',
  otro:       'Otro',
}

const branchClass: Record<PolicyBranch, string> = {
  gmm:        'bg-blue-50 text-blue-600 border-blue-200',
  vida:       'bg-purple-50 text-purple-600 border-purple-200',
  auto:       'bg-orange-50 text-orange-600 border-orange-200',
  rc:         'bg-red-50 text-red-600 border-red-200',
  danos:      'bg-yellow-50 text-yellow-700 border-yellow-200',
  transporte: 'bg-teal-50 text-teal-600 border-teal-200',
  fianzas:    'bg-indigo-50 text-indigo-600 border-indigo-200',
  ap:         'bg-pink-50 text-pink-600 border-pink-200',
  tecnicos:   'bg-gray-50 text-gray-600 border-gray-200',
  otro:       'bg-gray-50 text-gray-500 border-gray-200',
}

const policyStatusLabel: Record<PolicyStatus, string> = {
  active:          'Vigente',
  pending_renewal: 'Por renovar',
  expired:         'Vencida',
  cancelled:       'Cancelada',
  quote:           'Cotización',
}

const policyStatusClass: Record<PolicyStatus, string> = {
  active:          'bg-emerald-100 text-emerald-700',
  pending_renewal: 'bg-amber-100 text-amber-700',
  expired:         'bg-red-100 text-red-600',
  cancelled:       'bg-gray-100 text-gray-500',
  quote:           'bg-sky-100 text-sky-600',
}

function InfoRow({
  icon, label, value, mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-300 mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
        <p className={`text-sm text-gray-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  )
}
