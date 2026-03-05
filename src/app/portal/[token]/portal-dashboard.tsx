'use client'

import { useState, useMemo }  from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Shield, Car, Heart, Building2, Truck, FileText, Zap, AlertTriangle,
  Activity, CheckCircle2, Clock, XCircle, ExternalLink, Printer,
  Mail, Calendar, TrendingUp, CreditCard, ShieldAlert, Star,
} from 'lucide-react'
import type { PortalData, PortalReceipt } from '@/app/actions/portal-actions'
import { PortalChat } from './portal-chat'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, opts?: Intl.NumberFormatOptions) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    ...opts,
  }).format(n)
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtMonth(iso: string) {
  return new Date(iso + '-01').toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
}

function yearsAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const years = diff / (1000 * 60 * 60 * 24 * 365.25)
  if (years < 1) return 'Menos de 1 año'
  const rounded = Math.floor(years)
  return `${rounded} año${rounded !== 1 ? 's' : ''}`
}

function relativeTime(iso: string | null) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  return `hace ${months} mes${months !== 1 ? 'es' : ''}`
}

const BRANCH_LABEL: Record<string, string> = {
  gmm:        'Gastos Médicos',
  vida:       'Vida',
  auto:       'Auto',
  rc:         'Responsabilidad Civil',
  danos:      'Daños',
  transporte: 'Transporte',
  fianzas:    'Fianzas',
  ap:         'Accidentes Personales',
  tecnicos:   'Técnicos',
  otro:       'Otro',
}

const FREQ_LABEL: Record<string, string> = {
  mensual:    'Mensual',
  bimestral:  'Bimestral',
  trimestral: 'Trimestral',
  semestral:  'Semestral',
  anual:      'Anual',
}

const STATUS_MOVEMENT: Record<string, { label: string; cls: string }> = {
  sent:      { label: 'Enviado',   cls: 'bg-blue-100 text-blue-700'    },
  confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' },
  draft:     { label: 'Borrador',  cls: 'bg-gray-100 text-gray-600'    },
  rejected:  { label: 'Rechazado', cls: 'bg-red-100 text-red-600'      },
}

function BranchIcon({ branch, cls = 'h-5 w-5' }: { branch: string; cls?: string }) {
  const map: Record<string, React.ElementType> = {
    gmm: Heart, vida: Star, auto: Car, rc: Shield,
    danos: Building2, transporte: Truck, fianzas: FileText,
    ap: Activity, tecnicos: Zap, otro: FileText,
  }
  const Icon = map[branch] ?? FileText
  return <Icon className={cls} />
}

const BRANCH_COLOR: Record<string, string> = {
  gmm:        'text-pink-500',
  vida:       'text-violet-500',
  auto:       'text-blue-500',
  rc:         'text-emerald-500',
  danos:      'text-amber-500',
  transporte: 'text-cyan-500',
  fianzas:    'text-orange-500',
  ap:         'text-indigo-500',
  tecnicos:   'text-teal-500',
  otro:       'text-gray-400',
}

// ── Gráfica CFO de proyección de pagos ────────────────────────────────────────

interface CFOBar {
  month:    string   // "2026-03"
  label:    string   // "mar 26"
  paid:     number
  pending:  number
  overdue:  number
  total:    number
  isCurrent: boolean
  isFuture:  boolean
}

function buildCFOChart(receipts: PortalReceipt[]): CFOBar[] {
  const map = new Map<string, CFOBar>()
  const nowM = new Date().toISOString().slice(0, 7)

  for (const r of receipts) {
    const month    = r.due_date.slice(0, 7)
    const isCurrent = month === nowM
    const isFuture  = month > nowM
    if (!map.has(month)) {
      const d = new Date(month + '-01')
      const label = d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
      map.set(month, { month, label, paid: 0, pending: 0, overdue: 0, total: 0, isCurrent, isFuture })
    }
    const b   = map.get(month)!
    const amt = r.amount ?? 0
    b.total  += amt
    if      (r.status === 'paid')    b.paid    += amt
    else if (r.status === 'overdue') b.overdue += amt
    else                             b.pending += amt
  }

  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
}

function fmtK(n: number): string {
  if (n === 0) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CFOTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const paid    = payload.find((p: any) => p.dataKey === 'paid')?.value    ?? 0
  const pending = payload.find((p: any) => p.dataKey === 'pending')?.value ?? 0
  const overdue = payload.find((p: any) => p.dataKey === 'overdue')?.value ?? 0
  const total   = paid + pending + overdue
  return (
    <div className="bg-white border border-gray-200 shadow-xl rounded-xl p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-2 capitalize">{label}</p>
      {paid    > 0 && <div className="flex justify-between gap-4 text-emerald-600 mb-0.5"><span>✓ Pagado</span><span className="font-mono font-semibold">{fmt(paid)}</span></div>}
      {overdue > 0 && <div className="flex justify-between gap-4 text-red-600 mb-0.5"><span>⚠ Vencido</span><span className="font-mono font-semibold">{fmt(overdue)}</span></div>}
      {pending > 0 && <div className="flex justify-between gap-4 text-blue-600 mb-0.5"><span>⏰ Programado</span><span className="font-mono font-semibold">{fmt(pending)}</span></div>}
      {total   > 0 && (
        <div className="flex justify-between gap-4 text-gray-700 mt-2 pt-2 border-t border-gray-100 font-semibold">
          <span>Total</span><span className="font-mono">{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}

function PaymentChart({ receipts }: { receipts: PortalReceipt[] }) {
  const nowM = new Date().toISOString().slice(0, 7)
  const bars = useMemo(() => buildCFOChart(receipts), [receipts])

  // CFO KPIs — current calendar year
  const thisYear = new Date().getFullYear().toString()
  const yearReceipts = receipts.filter(r => r.due_date.startsWith(thisYear))
  const yearTotal    = yearReceipts.reduce((s, r) => s + (r.amount ?? 0), 0)
  const yearPaid     = yearReceipts.filter(r => r.status === 'paid').reduce((s, r) => s + (r.amount ?? 0), 0)
  const yearPending  = yearTotal - yearPaid
  const nextPending  = receipts
    .filter(r => (r.status === 'pending' || r.status === 'overdue') && r.due_date >= nowM.slice(0, 7) + '-01')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

  if (bars.length === 0) return (
    <div className="flex items-center justify-center h-24 text-sm text-gray-400">Sin datos de pago en el período</div>
  )

  // Label for ReferenceLine must match the bar's label
  const currentBar = bars.find(b => b.month === nowM)

  return (
    <div className="space-y-4">
      {/* CFO KPI strip */}
      <div className="grid grid-cols-3 gap-3 rounded-xl bg-gray-50 border border-gray-100 p-3">
        <div className="text-center">
          <p className="text-[11px] text-gray-400 mb-0.5">Comprometido {thisYear}</p>
          <p className="text-base font-bold text-gray-800 font-mono tabular-nums">{fmtK(yearTotal)}</p>
        </div>
        <div className="text-center border-x border-gray-200">
          <p className="text-[11px] text-gray-400 mb-0.5">Pagado a la fecha</p>
          <p className="text-base font-bold text-emerald-600 font-mono tabular-nums">{fmtK(yearPaid)}</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] text-gray-400 mb-0.5">Por pagar {thisYear}</p>
          <p className={`text-base font-bold font-mono tabular-nums ${yearPending > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{fmtK(yearPending)}</p>
        </div>
      </div>

      {/* Próximo vencimiento alert */}
      {nextPending && (
        <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
          nextPending.status === 'overdue' ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-100'
        }`}>
          <span className={nextPending.status === 'overdue' ? 'text-red-700 font-medium' : 'text-blue-700 font-medium'}>
            {nextPending.status === 'overdue' ? '⚠ Pago vencido' : '⏰ Próximo vencimiento'}
            {nextPending.policy_number && <span className="ml-1 font-mono opacity-70">· {nextPending.policy_number}</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="font-mono font-semibold">{fmt(nextPending.amount)}</span>
            <span className="opacity-60">{fmtDate(nextPending.due_date)}</span>
          </span>
        </div>
      )}

      {/* Recharts bar chart */}
      <div>
        <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Flujo mensual de primas</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={bars} barCategoryGap="28%" margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={fmtK}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<CFOTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)' }} />
            {currentBar && (
              <ReferenceLine
                x={currentBar.label}
                stroke="#6366f1"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{ value: 'hoy', position: 'top', fill: '#6366f1', fontSize: 9 }}
              />
            )}
            <Bar dataKey="paid"    stackId="a" fill="#10b981" name="Pagado"      radius={[0, 0, 0, 0]} />
            <Bar dataKey="overdue" stackId="a" fill="#ef4444" name="Vencido"     radius={[0, 0, 0, 0]} />
            <Bar dataKey="pending" stackId="a" name="Programado" radius={[3, 3, 0, 0]}>
              {bars.map((b) => (
                <Cell key={b.month} fill={b.isFuture ? '#93c5fd' : b.isCurrent ? '#60a5fa' : '#fbbf24'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-gray-400 mt-1 justify-center">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500" /> Pagado</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-amber-400" /> Pendiente</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-blue-300" /> Programado</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-400" /> Vencido</span>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props { data: PortalData }

export function PortalDashboard({ data }: Props) {
  const { account, agent, policies, receipts, movements, claims } = data

  // KPIs
  const activePolicies   = policies.filter(p => p.status === 'active' || p.status === 'pending_renewal')
  const historicPolicies = policies.filter(p => p.status !== 'active' && p.status !== 'pending_renewal')
  const totalPremium     = activePolicies.reduce((s, p) => s + (p.premium ?? 0), 0)
  const totalClaimsCount = claims.length
  const totalRecovered   = claims.reduce((s, c) => s + (c.amount_paid ?? 0), 0)
  const pendingReceipts  = receipts.filter(r => r.status === 'pending' || r.status === 'overdue')
  const overdueReceipts  = receipts.filter(r => r.status === 'overdue')
  const paidReceipts     = receipts.filter(r => r.status === 'paid')
  const paidTotal        = paidReceipts.reduce((s, r) => s + (r.amount ?? 0), 0)
  const activeMovements  = movements.filter(m => m.status === 'sent')

  const [activeSection, setActiveSection] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <div className="no-print" style={{ background: 'linear-gradient(135deg, #071428 0%, #0D2040 60%, #092E18 100%)' }}>
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              {/* Logo */}
              <div className="mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-white.png" alt="Murguía" className="h-14 w-auto" />
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight">{account.name}</h1>
              <p className="text-white/50 text-sm mt-1">
                Tu reporte de seguros · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs text-white/50 hover:text-white hover:border-white/40 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </button>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-2xl font-bold text-white font-mono tabular-nums">{activePolicies.length}</p>
              <p className="text-xs text-white/40 mt-1">Pólizas activas</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-2xl font-bold font-mono tabular-nums" style={{ color: '#7DC440' }}>{fmt(totalPremium)}</p>
              <p className="text-xs text-white/40 mt-1">Prima total</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-2xl font-bold text-white font-mono tabular-nums">{yearsAgo(account.client_since)}</p>
              <p className="text-xs text-white/40 mt-1">Tiempo contigo</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-2xl font-bold text-white font-mono tabular-nums">{totalClaimsCount}</p>
              <p className="text-xs text-white/40 mt-1">
                Siniestros{totalRecovered > 0 ? ` · ${fmt(totalRecovered)} rec.` : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print header (only visible in print) */}
      <div className="hidden print:flex items-center justify-between border-b pb-4 mb-6 px-0 pt-4">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Murguía" className="h-8 w-auto" />
          <span className="font-semibold text-gray-900">MURGUÍA · Agente de Seguros</span>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>{account.name}</p>
          <p>{new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6 print:px-0 print:py-0 print:space-y-4">

        {/* ── Alertas de pendientes ─────────────────────────────────────────── */}
        {(overdueReceipts.length > 0 || activeMovements.length > 0) && (
          <div className="space-y-2 no-print">
            {overdueReceipts.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">
                  Tienes <strong>{overdueReceipts.length} recibo{overdueReceipts.length !== 1 ? 's' : ''} vencido{overdueReceipts.length !== 1 ? 's' : ''}</strong> por un total de{' '}
                  <strong>{fmt(overdueReceipts.reduce((s, r) => s + (r.amount ?? 0), 0))}</strong>.
                  Tu agente está en contacto contigo.
                </p>
              </div>
            )}
            {activeMovements.length > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3">
                <Clock className="h-4 w-4 text-blue-500 shrink-0" />
                <p className="text-sm text-blue-700">
                  Tienes <strong>{activeMovements.length} gestión{activeMovements.length !== 1 ? 'es' : ''} en trámite</strong> con la aseguradora.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 1. Mis Pólizas ────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4" style={{ color: '#5BA42A' }} />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Mis Pólizas</h2>
            <span className="text-xs text-gray-400">({activePolicies.length} activas{historicPolicies.length > 0 ? ` · ${historicPolicies.length} historial` : ''})</span>
          </div>
          {policies.length === 0 ? (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
              No hay pólizas registradas
            </div>
          ) : (
            <>
            <div className="grid sm:grid-cols-2 gap-3">
              {activePolicies.map(p => (
                <div key={p.id} className="rounded-xl border bg-white shadow-sm p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`${BRANCH_COLOR[p.branch] ?? 'text-gray-400'}`}>
                        <BranchIcon branch={p.branch} cls="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-700">{BRANCH_LABEL[p.branch] ?? p.branch}</p>
                        <p className="text-xs text-gray-400">{p.insurer}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      p.status === 'active'           ? 'bg-emerald-100 text-emerald-700' :
                      p.status === 'pending_renewal'  ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {p.status === 'active' ? 'Vigente' : p.status === 'pending_renewal' ? 'Por renovar' : p.status}
                    </span>
                  </div>

                  {p.policy_number && (
                    <p className="text-xs font-mono text-gray-500 mb-2">Póliza {p.policy_number}</p>
                  )}

                  {(p.concepto || p.subramo) && (
                    <p className="text-xs text-gray-600 mb-2 leading-snug">{p.concepto ?? p.subramo}</p>
                  )}

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500">
                    {p.start_date && (
                      <>
                        <span className="text-gray-400">Vigencia</span>
                        <span>{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</span>
                      </>
                    )}
                    {p.premium !== null && (
                      <>
                        <span className="text-gray-400">Prima</span>
                        <span className="font-mono font-medium text-gray-700">
                          {fmt(p.premium)}{p.payment_frequency ? ` / ${FREQ_LABEL[p.payment_frequency] ?? p.payment_frequency}` : ''}
                        </span>
                      </>
                    )}
                  </div>

                  {p.policy_url && (
                    <a
                      href={p.policy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver documento
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Historial de pólizas */}
            {historicPolicies.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Historial</p>
                <div className="grid sm:grid-cols-2 gap-3 opacity-60">
                  {historicPolicies.map(p => (
                    <div key={p.id} className="rounded-xl border border-dashed bg-white p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="text-gray-400">
                            <BranchIcon branch={p.branch} cls="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-600">{BRANCH_LABEL[p.branch] ?? p.branch}</p>
                            <p className="text-xs text-gray-400">{p.insurer}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                          {p.status === 'expired' ? 'Expirada' : p.status === 'cancelled' ? 'Cancelada' : p.status}
                        </span>
                      </div>
                      {p.policy_number && (
                        <p className="text-xs font-mono text-gray-400">Póliza {p.policy_number}</p>
                      )}
                      {(p.start_date || p.end_date) && (
                        <p className="text-xs text-gray-400 mt-1">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
          )}
        </section>

        {/* ── 2. Pagos y Cobranza ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4" style={{ color: '#5BA42A' }} />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Pagos y Cobranza</h2>
          </div>
          <div className="rounded-xl border bg-white shadow-sm p-5 space-y-5">
            {/* KPIs cobranza */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xl font-bold text-emerald-600 font-mono tabular-nums">{fmt(paidTotal)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Pagado (período)</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-bold font-mono tabular-nums ${pendingReceipts.length > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                  {fmt(pendingReceipts.reduce((s, r) => s + (r.amount ?? 0), 0))}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Pendiente</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-bold font-mono tabular-nums ${overdueReceipts.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {overdueReceipts.length}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Vencidos</p>
              </div>
            </div>

            {/* Gráfica */}
            <PaymentChart receipts={receipts} />

            {/* Próximos pagos */}
            {pendingReceipts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Próximos pagos pendientes</p>
                <div className="space-y-1">
                  {pendingReceipts.slice(0, 6).map((r, i) => {
                    const daysLeft = Math.ceil((new Date(r.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    return (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-xs">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-gray-300" />
                          <span className="text-gray-600">{fmtDate(r.due_date)}</span>
                          {r.policy_number && <span className="text-gray-400 font-mono">{r.policy_number}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-gray-700">{fmt(r.amount)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            r.status === 'overdue' ? 'bg-red-100 text-red-600' :
                            daysLeft <= 7          ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {r.status === 'overdue' ? 'Vencido' : daysLeft <= 0 ? 'Hoy' : `${daysLeft}d`}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── 3. Gestiones en Trámite ───────────────────────────────────────── */}
        {movements.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4" style={{ color: '#5BA42A' }} />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Gestiones con la Aseguradora</h2>
              <span className="text-xs text-gray-400">({movements.length})</span>
            </div>
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Gestión</th>
                    <th className="px-4 py-2.5 text-left font-medium">Póliza</th>
                    <th className="px-4 py-2.5 text-left font-medium">Aseguradora</th>
                    <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
                    <th className="px-4 py-2.5 text-left font-medium">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {movements.map(m => {
                    const s = STATUS_MOVEMENT[m.status] ?? { label: m.status, cls: 'bg-gray-100 text-gray-600' }
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-700">{m.movement_type_name}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-500">{m.policy_number ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{m.insurer}</td>
                        <td className="px-4 py-2.5 text-gray-400">{fmtDate(m.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${s.cls}`}>{s.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── 4. Siniestros ─────────────────────────────────────────────────── */}
        {claims.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="h-4 w-4" style={{ color: '#5BA42A' }} />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Historial de Siniestros</h2>
              <span className="text-xs text-gray-400">({claims.length})</span>
            </div>

            {/* Resumen siniestros */}
            {totalRecovered > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-3 flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-700">
                  Hemos recuperado <strong>{fmt(totalRecovered)}</strong> en indemnizaciones para ti en {claims.filter(c => c.amount_paid).length} siniestros.
                </p>
              </div>
            )}

            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Fecha</th>
                    <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                    <th className="px-4 py-2.5 text-left font-medium">Aseguradora</th>
                    <th className="px-4 py-2.5 text-right font-medium">Reclamado</th>
                    <th className="px-4 py-2.5 text-right font-medium text-emerald-700">Pagado</th>
                    <th className="px-4 py-2.5 text-left font-medium">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {claims.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-500 tabular-nums">{fmtDate(c.loss_date)}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-700">{c.claim_type ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{c.insurer_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-600">{fmt(c.amount_claimed)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-600 font-medium">{c.amount_paid ? fmt(c.amount_paid) : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 max-w-[120px] truncate">{c.status_insurer ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="border-t pt-6 pb-8 text-center text-xs text-gray-400 space-y-1">
          {agent && (
            <div className="flex items-center justify-center gap-4 mb-3">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                  {agent.full_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-gray-600 text-sm font-medium">{agent.full_name}</span>
                <span className="text-gray-400">· Tu agente</span>
              </div>
              {agent.email && (
                <a href={`mailto:${agent.email}`} className="flex items-center gap-1 text-gray-400 hover:text-gray-600">
                  <Mail className="h-3 w-3" />
                  {agent.email}
                </a>
              )}
            </div>
          )}
          <p>Reporte generado el {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p>Murguía · Agente de Seguros · Este reporte es confidencial y está destinado únicamente al titular</p>
        </footer>

      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      {/* ── Chat bubble ─────────────────────────────────────────────────────── */}
      <PortalChat
        accountId={account.id}
        agentName={agent?.full_name ?? null}
      />
    </div>
  )
}
