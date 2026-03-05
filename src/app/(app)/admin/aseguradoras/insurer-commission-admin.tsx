'use client'

import { useState, useTransition, useRef } from 'react'
import {
  createInsurer,
  updateInsurer,
  deleteInsurer,
  uploadInsurerLogo,
  createCommissionCode,
  updateCommissionCode,
  deleteCommissionCode,
} from '@/app/actions/commission-actions'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Loader2, Plus, ChevronDown, ChevronRight, Pencil, Trash2, Check, X,
  Building2, Percent, Clock, Eye, EyeOff, KeyRound, Upload,
} from 'lucide-react'
import type { Insurer, CommissionCode } from '@/types/database.types'

// ── Ramos disponibles ────────────────────────────────────────────────────

// 'all' es el sentinel para "Todos los ramos" — Radix UI Select no acepta value=""
const BRANCHES = [
  { value: 'all',       label: 'Todos los ramos' },
  { value: 'gmm',       label: 'Gastos Médicos Mayores' },
  { value: 'vida',      label: 'Vida' },
  { value: 'auto',      label: 'Autos' },
  { value: 'rc',        label: 'Responsabilidad Civil' },
  { value: 'danos',     label: 'Daños' },
  { value: 'transporte',label: 'Transportes' },
  { value: 'fianzas',   label: 'Fianzas' },
  { value: 'ap',        label: 'Accidentes Personales' },
  { value: 'tecnicos',  label: 'Riesgos Técnicos' },
]

const toBranchSelect  = (b: string | null): string  => b || 'all'
const fromBranchSelect = (v: string): string | undefined => v === 'all' ? undefined : v
const branchLabel      = (b: string | null) =>
  BRANCHES.find(x => x.value === (b || 'all'))?.label ?? b ?? '—'

// ── LogoUpload ────────────────────────────────────────────────────────────

function LogoUpload({
  insurer,
  logoUrl,
  onUploaded,
}: {
  insurer:    Insurer
  logoUrl:    string | null
  onUploaded: (url: string) => void
}) {
  const inputRef    = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = (ev.target!.result as string).split(',')[1]
      const res = await uploadInsurerLogo(insurer.id, base64, file.type)
      if (res.url) onUploaded(res.url)
      setBusy(false)
    }
    reader.readAsDataURL(file)
    // reset input so same file can be re-selected
    e.target.value = ''
  }

  return (
    <div
      className="relative h-11 w-11 shrink-0 cursor-pointer"
      onClick={() => inputRef.current?.click()}
      title="Cambiar logo"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFile}
      />
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={insurer.name}
          className="h-11 w-11 rounded-lg object-contain border bg-white p-1"
        />
      ) : (
        <div className="h-11 w-11 rounded-lg bg-slate-100 flex items-center justify-center">
          {busy
            ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            : <Building2 className="h-4 w-4 text-slate-400" />}
        </div>
      )}
      {!busy && (
        <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <Upload className="h-3.5 w-3.5 text-white" />
        </div>
      )}
    </div>
  )
}

// ── SlaSection ───────────────────────────────────────────────────────────

function SlaSection({ insurer }: { insurer: Insurer }) {
  const [quoteHrs,       setQuoteHrs]       = useState(insurer.sla_quote_hours?.toString()       ?? '')
  const [endorsementHrs, setEndorsementHrs] = useState(insurer.sla_endorsement_hours?.toString() ?? '')
  const [issuanceHrs,    setIssuanceHrs]    = useState(insurer.sla_issuance_hours?.toString()    ?? '')
  const [slaNotes,       setSlaNotes]       = useState(insurer.sla_notes ?? '')
  const [saved,          setSaved]          = useState(false)
  const [isPending,      startTransition]   = useTransition()

  function handleSave() {
    startTransition(async () => {
      await updateInsurer(insurer.id, {
        sla_quote_hours:       quoteHrs       ? Number(quoteHrs)       : null,
        sla_endorsement_hours: endorsementHrs ? Number(endorsementHrs) : null,
        sla_issuance_hours:    issuanceHrs    ? Number(issuanceHrs)    : null,
        sla_notes:             slaNotes       || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-amber-600" />
        <p className="text-xs font-semibold text-amber-700">SLAs de gestión</p>
        <span className="text-[10px] text-amber-500 ml-1">contexto para agente IA</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs text-gray-500">Cotización (hrs)</Label>
          <Input value={quoteHrs} onChange={e => setQuoteHrs(e.target.value)}
            type="number" min="1" placeholder="72" className="h-7 text-sm mt-0.5" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Endoso / cambio (hrs)</Label>
          <Input value={endorsementHrs} onChange={e => setEndorsementHrs(e.target.value)}
            type="number" min="1" placeholder="48" className="h-7 text-sm mt-0.5" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Emisión póliza (hrs)</Label>
          <Input value={issuanceHrs} onChange={e => setIssuanceHrs(e.target.value)}
            type="number" min="1" placeholder="24" className="h-7 text-sm mt-0.5" />
        </div>
      </div>
      <div>
        <Label className="text-xs text-gray-500">Notas del SLA</Label>
        <Input value={slaNotes} onChange={e => setSlaNotes(e.target.value)}
          placeholder="Ej. horario de atención, canales preferidos, excepciones…"
          className="h-7 text-sm mt-0.5" />
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="text-xs text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1 disabled:opacity-40"
        >
          {isPending
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : saved
            ? <Check className="h-3 w-3 text-emerald-600" />
            : null}
          {saved ? 'Guardado' : 'Guardar SLAs'}
        </button>
      </div>
    </div>
  )
}

// ── PortalSection ────────────────────────────────────────────────────────

function PortalSection({
  codeId,
  initialUser,
  initialPass,
}: {
  codeId:      string
  initialUser: string | null
  initialPass: string | null
}) {
  const [user,      setUser]      = useState(initialUser ?? '')
  const [pass,      setPass]      = useState(initialPass ?? '')
  const [showPass,  setShowPass]  = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      await updateCommissionCode(codeId, {
        portal_user:     user || null,
        portal_password: pass || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5 text-blue-500" />
        <p className="text-xs font-semibold text-blue-700">Credenciales del portal</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-gray-500">Usuario</Label>
          <Input value={user} onChange={e => setUser(e.target.value)}
            className="h-7 text-sm mt-0.5" placeholder="usuario@aseguradora.com" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Contraseña</Label>
          <div className="relative mt-0.5">
            <Input value={pass} onChange={e => setPass(e.target.value)}
              type={showPass ? 'text' : 'password'}
              className="h-7 text-sm pr-8" placeholder="••••••••" />
            <button type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="text-xs text-blue-700 hover:text-blue-800 font-medium flex items-center gap-1 disabled:opacity-40"
        >
          {isPending
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : saved
            ? <Check className="h-3 w-3 text-emerald-600" />
            : null}
          {saved ? 'Guardado' : 'Guardar credenciales'}
        </button>
      </div>
    </div>
  )
}

// ── CommissionCodeRow ────────────────────────────────────────────────────

function CommissionCodeRow({
  code,
  onDeleted,
}: {
  code:      CommissionCode
  onDeleted: () => void
}) {
  const [editing,   setEditing] = useState(false)
  const [codeVal,   setCodeVal] = useState(code.code)
  const [branch,    setBranch]  = useState(toBranchSelect(code.branch))
  const [desc,      setDesc]    = useState(code.description ?? '')
  const [ratePct,   setRatePct] = useState(code.rate_pct?.toString() ?? '')
  const [rateFlat,  setRateFlat]= useState(code.rate_flat?.toString() ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!codeVal.trim()) return
    startTransition(async () => {
      await updateCommissionCode(code.id, {
        code:        codeVal,
        branch:      fromBranchSelect(branch),
        description: desc     || undefined,
        rate_pct:    ratePct  ? Number(ratePct)  : null,
        rate_flat:   rateFlat ? Number(rateFlat) : null,
      })
      setEditing(false)
    })
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar la clave "${code.code}"?`)) return
    startTransition(async () => {
      await deleteCommissionCode(code.id)
      onDeleted()
    })
  }

  return (
    <div className="py-2 space-y-2">
      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Clave de Agente *</Label>
              <Input value={codeVal} onChange={e => setCodeVal(e.target.value)}
                className="h-8 text-sm mt-0.5" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Ramo</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger className="h-8 text-sm mt-0.5">
                  <SelectValue placeholder="Todos los ramos" />
                </SelectTrigger>
                <SelectContent>
                  {BRANCHES.map(b => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">% Comisión</Label>
              <div className="relative mt-0.5">
                <Input value={ratePct} onChange={e => setRatePct(e.target.value)}
                  type="number" step="0.001" min="0" max="100"
                  className="h-8 text-sm pr-6" placeholder="12.500" />
                <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Monto fijo (MXN)</Label>
              <Input value={rateFlat} onChange={e => setRateFlat(e.target.value)}
                type="number" step="0.01" min="0"
                className="h-8 text-sm mt-0.5" placeholder="0.00" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descripción / condiciones</Label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)}
              rows={2} className="text-sm mt-0.5" placeholder="Condiciones especiales…" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
            <button onClick={handleSave} disabled={isPending || !codeVal.trim()}
              className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono font-medium text-gray-900">{code.code}</span>
              {code.branch && (
                <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded px-1.5 py-0.5">
                  {branchLabel(code.branch)}
                </span>
              )}
              {code.rate_pct != null && (
                <span className="text-xs text-emerald-700 font-semibold">{code.rate_pct}%</span>
              )}
              {code.rate_flat != null && code.rate_pct == null && (
                <span className="text-xs text-emerald-700 font-semibold">
                  ${Number(code.rate_flat).toLocaleString('es-MX')}
                </span>
              )}
              {!code.is_active && (
                <span className="text-[10px] bg-gray-100 text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                  Inactivo
                </span>
              )}
            </div>
            {code.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{code.description}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => setEditing(true)}
              className="text-amber-500 hover:text-amber-600" title="Editar clave">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={handleDelete} disabled={isPending}
              className="text-gray-300 hover:text-red-500 disabled:opacity-40" title="Eliminar">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* Credenciales del portal — siempre visible */}
      <PortalSection
        codeId={code.id}
        initialUser={code.portal_user}
        initialPass={code.portal_password}
      />
    </div>
  )
}

// ── AddCommissionCodeForm ────────────────────────────────────────────────

function AddCommissionCodeForm({ insurerId, onAdded }: { insurerId: string; onAdded: (code: CommissionCode) => void }) {
  const [code,      setCode]     = useState('')
  const [branch,    setBranch]   = useState('all')
  const [desc,      setDesc]     = useState('')
  const [ratePct,   setRatePct]  = useState('')
  const [rateFlat,  setRateFlat] = useState('')
  const [error,     setError]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    if (!code.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await createCommissionCode({
        insurer_id:  insurerId,
        code:        code.trim(),
        branch:      fromBranchSelect(branch),
        description: desc    || undefined,
        rate_pct:    ratePct ? Number(ratePct)  : undefined,
        rate_flat:   rateFlat? Number(rateFlat) : undefined,
      })
      if (res.error) { setError(res.error); return }
      onAdded({
        id: crypto.randomUUID(), insurer_id: insurerId, code: code.trim(),
        branch: fromBranchSelect(branch) ?? null, description: desc || null,
        rate_pct: ratePct ? Number(ratePct) : null,
        rate_flat: rateFlat ? Number(rateFlat) : null,
        effective_from: null, effective_to: null,
        portal_user: null, portal_password: null,
        is_active: true, created_by: null, updated_by: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      setCode(''); setBranch('all'); setDesc(''); setRatePct(''); setRateFlat('')
    })
  }

  return (
    <div className="pt-3 border-t space-y-2">
      <p className="text-xs font-semibold text-gray-500">Nueva clave de agente</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Clave de Agente *</Label>
          <Input value={code} onChange={e => setCode(e.target.value)}
            placeholder="AGT-12345" className="h-8 text-sm mt-0.5"
            onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        </div>
        <div>
          <Label className="text-xs">Ramo</Label>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-8 text-sm mt-0.5">
              <SelectValue placeholder="Todos los ramos" />
            </SelectTrigger>
            <SelectContent>
              {BRANCHES.map(b => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">% Comisión</Label>
          <div className="relative mt-0.5">
            <Input value={ratePct} onChange={e => setRatePct(e.target.value)}
              type="number" step="0.001" min="0" max="100"
              className="h-8 text-sm pr-6" placeholder="12.500" />
            <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Monto fijo (MXN)</Label>
          <Input value={rateFlat} onChange={e => setRateFlat(e.target.value)}
            type="number" step="0.01" min="0"
            className="h-8 text-sm mt-0.5" placeholder="0.00" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Descripción</Label>
        <Input value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Condiciones, notas…" className="h-8 text-sm mt-0.5" />
      </div>
      <p className="text-[10px] text-blue-500">
        💡 Las credenciales del portal se agregan después de crear la clave
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button size="sm" onClick={handleAdd} disabled={isPending || !code.trim()} className="gap-1.5">
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Agregar clave
      </Button>
    </div>
  )
}

// ── InsurerRow ───────────────────────────────────────────────────────────

function InsurerRow({
  insurer,
  initialCodes,
  onDeleted,
}: {
  insurer:      Insurer
  initialCodes: CommissionCode[]
  onDeleted:    () => void
}) {
  const [expanded,  setExpanded]  = useState(false)
  const [codes,     setCodes]     = useState(initialCodes)
  const [editName,  setEditName]  = useState(false)
  const [name,      setName]      = useState(insurer.name)
  const [shortName, setShortName] = useState(insurer.short_name ?? '')
  const [logoUrl,   setLogoUrl]   = useState(insurer.logo_url ?? null)
  const [isPending, startTransition] = useTransition()

  function handleSaveName() {
    if (!name.trim()) return
    startTransition(async () => {
      await updateInsurer(insurer.id, { name, short_name: shortName || undefined })
      setEditName(false)
    })
  }

  function handleDelete() {
    const totalCodes = codes.length
    const msg = totalCodes > 0
      ? `¿Eliminar "${insurer.name}" y sus ${totalCodes} clave(s) de agente? Esta acción no se puede deshacer.`
      : `¿Eliminar la aseguradora "${insurer.name}"?`
    if (!confirm(msg)) return
    startTransition(async () => {
      const res = await deleteInsurer(insurer.id)
      if (!res.error) onDeleted()
    })
  }

  const activeCount = codes.filter(c => c.is_active).length

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">

        {/* Logo / upload */}
        <LogoUpload
          insurer={insurer}
          logoUrl={logoUrl}
          onUploaded={url => setLogoUrl(url + `?t=${Date.now()}`)}
        />

        {/* Nombre */}
        <div className="flex-1 min-w-0">
          {editName ? (
            <div className="flex items-center gap-2">
              <Input value={name} onChange={e => setName(e.target.value)}
                className="h-8 text-sm flex-1" autoFocus />
              <Input value={shortName} onChange={e => setShortName(e.target.value)}
                className="h-8 text-sm w-28" placeholder="Siglas" />
              <button onClick={handleSaveName} disabled={isPending || !name.trim()}
                className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button onClick={() => setEditName(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">{insurer.name}</p>
                {insurer.short_name && (
                  <span className="text-xs text-gray-400 font-mono">{insurer.short_name}</span>
                )}
                {!insurer.is_active && (
                  <span className="text-[10px] bg-gray-100 text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                    Inactiva
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeCount} clave{activeCount !== 1 ? 's' : ''} activa{activeCount !== 1 ? 's' : ''}
                {insurer.sla_quote_hours && (
                  <span className="ml-2 text-amber-500">
                    · SLA cotización {insurer.sla_quote_hours}h
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Acciones */}
        {!editName && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Nueva clave — azul */}
            <Button
              size="sm"
              variant="default"
              onClick={() => setExpanded(true)}
              className="gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva clave
            </Button>

            {/* Editar nombre — ámbar */}
            <button
              onClick={() => setEditName(true)}
              className="text-amber-500 hover:text-amber-600 transition-colors"
              title="Editar nombre"
            >
              <Pencil className="h-4 w-4" />
            </button>

            {/* Eliminar — rojo */}
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"
              title="Eliminar aseguradora"
            >
              {isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />}
            </button>

            {/* Expandir claves */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              {expanded
                ? <ChevronDown className="h-4 w-4" />
                : <ChevronRight className="h-4 w-4" />}
              Claves
            </button>
          </div>
        )}
      </div>

      {/* Expanded: SLAs + claves */}
      {expanded && (
        <div className="border-t px-5 py-4 space-y-4">
          <SlaSection insurer={insurer} />
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Claves de Agente</p>
            <div className="space-y-1">
              {codes.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">Sin claves de agente. Agrega la primera abajo.</p>
              ) : (
                <div className="divide-y">
                  {codes.map(c => (
                    <CommissionCodeRow
                      key={c.id}
                      code={c}
                      onDeleted={() => setCodes(prev => prev.filter(x => x.id !== c.id))}
                    />
                  ))}
                </div>
              )}
              <AddCommissionCodeForm
                insurerId={insurer.id}
                onAdded={code => setCodes(prev => [...prev, code])}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AddInsurerDialog ─────────────────────────────────────────────────────

function AddInsurerDialog({ onAdded }: { onAdded: (ins: Insurer) => void }) {
  const [open,      setOpen]      = useState(false)
  const [name,      setName]      = useState('')
  const [shortName, setShortName] = useState('')
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [website,   setWebsite]   = useState('')
  const [notes,     setNotes]     = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    if (!name.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await createInsurer({
        name, short_name: shortName || undefined,
        email: email || undefined, phone: phone || undefined,
        website: website || undefined, notes: notes || undefined,
      })
      if (res.error) { setError(res.error); return }
      if (res.insurer) onAdded(res.insurer)
      setOpen(false)
      setName(''); setShortName(''); setEmail(''); setPhone(''); setWebsite(''); setNotes('')
    })
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setName(''); setShortName(''); setEmail(''); setPhone(''); setWebsite(''); setNotes(''); setError(null)
    }
    setOpen(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4" />
          Agregar aseguradora
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva aseguradora</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ins-name">Nombre *</Label>
              <Input id="ins-name" value={name} onChange={e => setName(e.target.value)}
                placeholder="GNP Seguros" autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-short">Siglas</Label>
              <Input id="ins-short" value={shortName} onChange={e => setShortName(e.target.value)}
                placeholder="GNP" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ins-email">Correo</Label>
              <Input id="ins-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="contacto@gnp.com.mx" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-phone">Teléfono</Label>
              <Input id="ins-phone" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="55 1234 5678" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ins-web">Sitio web</Label>
            <Input id="ins-web" type="url" value={website} onChange={e => setWebsite(e.target.value)}
              placeholder="https://gnp.com.mx" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ins-notes">Notas</Label>
            <Textarea id="ins-notes" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notas generales de la aseguradora…" rows={2} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleAdd}
              disabled={isPending || !name.trim()}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear aseguradora
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main export ──────────────────────────────────────────────────────────

interface Props {
  initialInsurers: Insurer[]
  initialCodesByInsurer: Record<string, CommissionCode[]>
}

export function InsurerCommissionAdmin({ initialInsurers, initialCodesByInsurer }: Props) {
  const [insurers, setInsurers] = useState(initialInsurers)

  return (
    <div className="space-y-4">
      {/* Header con botón verde */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {insurers.length} aseguradora{insurers.length !== 1 ? 's' : ''} registrada{insurers.length !== 1 ? 's' : ''}
        </p>
        <AddInsurerDialog
          onAdded={ins => setInsurers(prev => [...prev, ins])}
        />
      </div>

      {insurers.length === 0 && (
        <div className="rounded-xl border border-dashed bg-gray-50 p-10 text-center">
          <Building2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Sin aseguradoras registradas.</p>
          <p className="text-xs text-gray-300 mt-1">Usa el botón verde para agregar la primera.</p>
        </div>
      )}

      {insurers.map(ins => (
        <InsurerRow
          key={ins.id}
          insurer={ins}
          initialCodes={initialCodesByInsurer[ins.id] ?? []}
          onDeleted={() => setInsurers(prev => prev.filter(x => x.id !== ins.id))}
        />
      ))}
    </div>
  )
}
