'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Download, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ImportPolicyRow, ImportResult } from '@/app/api/admin/import/policies/route'
import type { PolicyBranch, PolicyStatus } from '@/types/database.types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountRef { id: string; account_code: string; name: string }

type RowStatus = 'valid' | 'error' | 'warning'

interface PreviewRow {
  rowIndex:      number
  status:        RowStatus
  errors:        string[]
  warnings:      string[]
  account_id:    string | null
  accountLabel:  string
  branch:        string
  insurer:       string
  policy_number: string | null
  polStatus:     string
  start_date:    string | null
  end_date:      string | null
  premium:       number | null
  tomador_id:    string | null
  tomadorLabel:  string
  notes:         string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_BRANCHES: PolicyBranch[] = ['gmm','vida','auto','rc','danos','transporte','fianzas','ap','tecnicos','otro']
const VALID_STATUSES: PolicyStatus[] = ['active','pending_renewal','expired','cancelled','quote']

const branchLabel: Record<PolicyBranch, string> = {
  gmm:'GMM', vida:'Vida', auto:'Auto', rc:'RC', danos:'Daños',
  transporte:'Transportes', fianzas:'Fianzas', ap:'AP', tecnicos:'Técnicos', otro:'Otro',
}
const statusLabel: Record<PolicyStatus, string> = {
  active:'Vigente', pending_renewal:'Por renovar', expired:'Vencida',
  cancelled:'Cancelada', quote:'Cotización',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeKey(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  // DD/MM/YYYY or YYYY-MM-DD
  const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (parts) return `${parts[3]}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function str(v: unknown): string { return String(v ?? '').trim() }
function num(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(/[,$\s]/g, ''))
  return isNaN(n) || n === 0 ? null : n
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  accounts: AccountRef[]
}

export function PolicyImport({ accounts }: Props) {
  const [step, setStep]       = useState<'upload' | 'preview' | 'results'>('upload')
  const [rows, setRows]       = useState<PreviewRow[]>([])
  const [result, setResult]   = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Build lookup maps
  const accountByCode = Object.fromEntries(accounts.map(a => [a.account_code.toLowerCase(), a]))
  const accountByName = Object.fromEntries(accounts.map(a => [a.name.toLowerCase(), a]))

  async function parseFile(file: File) {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: '' })

    const parsed: PreviewRow[] = raw.map((record, i) => {
      // Normalize header keys
      const norm: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(record)) norm[normalizeKey(k)] = v

      const get = (...keys: string[]): string =>
        str(keys.map(k => norm[k]).find(v => v !== undefined && v !== ''))

      const codeRaw  = get('codigo_cuenta', 'cuenta_codigo', 'codigo', 'code', 'account_code')
      const nameRaw  = get('nombre_cuenta', 'cuenta_nombre', 'nombre', 'name', 'account_name')
      const branchRaw = get('ramo', 'branch', 'tipo_poliza').toLowerCase()
      const insurer  = get('aseguradora', 'insurer', 'compania')
      const polNum   = get('numero_poliza', 'no_poliza', 'policy_number', 'num_poliza') || null
      const statusRaw = get('estatus', 'status', 'estado').toLowerCase()
      const startRaw = norm['inicio'] ?? norm['fecha_inicio'] ?? norm['start_date'] ?? norm['vigencia_inicio']
      const endRaw   = norm['vencimiento'] ?? norm['fecha_vencimiento'] ?? norm['end_date'] ?? norm['vigencia_fin']
      const premRaw  = norm['prima'] ?? norm['prima_anual'] ?? norm['premium']
      const tomRaw   = get('tomador', 'decisor', 'contacto_tomador')
      const notes    = get('notas', 'notes', 'observaciones') || null

      const errors: string[] = []
      const warnings: string[] = []

      // Resolve account
      let account: AccountRef | null = null
      if (codeRaw) account = accountByCode[codeRaw.toLowerCase()] ?? null
      if (!account && nameRaw) account = accountByName[nameRaw.toLowerCase()] ?? null
      if (!account) errors.push(`Cuenta no encontrada: "${codeRaw || nameRaw || '—'}"`)

      // Validate branch
      const branch = branchRaw as PolicyBranch
      if (!VALID_BRANCHES.includes(branch)) errors.push(`Ramo inválido: "${branchRaw}" — usar: ${VALID_BRANCHES.join(', ')}`)

      // Validate insurer
      if (!insurer) errors.push('Aseguradora requerida')

      // Status — default active if missing/invalid
      const polStatus = (VALID_STATUSES.includes(statusRaw as PolicyStatus) ? statusRaw : 'active') as PolicyStatus

      // Dates
      const start_date = parseDate(startRaw)
      const end_date   = parseDate(endRaw)
      if (startRaw && !start_date) warnings.push('Fecha inicio no reconocida (usar DD/MM/YYYY)')
      if (endRaw   && !end_date)   warnings.push('Fecha vencimiento no reconocida (usar DD/MM/YYYY)')

      // Premium
      const premium = num(premRaw)

      // Tomador — find in contacts (not done here, resolved server-side by name)
      const tomador_id = null
      if (tomRaw) warnings.push(`Tomador "${tomRaw}" — se asignará si coincide con un contacto`)

      const status: RowStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid'

      return {
        rowIndex:     i + 2,
        status,
        errors,
        warnings,
        account_id:   account?.id ?? null,
        accountLabel: account ? `${account.account_code} — ${account.name}` : (codeRaw || nameRaw || '—'),
        branch,
        insurer,
        policy_number: polNum,
        polStatus,
        start_date,
        end_date,
        premium,
        tomador_id,
        tomadorLabel: tomRaw,
        notes,
      }
    })

    setRows(parsed)
    setStep('preview')
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) return
    parseFile(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleImport() {
    const validRows = rows.filter(r => r.status !== 'error')
    const payload: ImportPolicyRow[] = validRows.map(r => ({
      account_id:    r.account_id!,
      branch:        r.branch as PolicyBranch,
      insurer:       r.insurer,
      policy_number: r.policy_number,
      status:        r.polStatus as PolicyStatus,
      start_date:    r.start_date,
      end_date:      r.end_date,
      premium:       r.premium,
      tomador_id:    r.tomador_id,
      notes:         r.notes,
    }))

    setLoading(true)
    const res = await fetch('/api/admin/import/policies', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rows: payload }),
    })
    const data: ImportResult = await res.json()
    setResult(data)
    setStep('results')
    setLoading(false)
  }

  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const headers = [
      'Código Cuenta', 'Nombre Cuenta', 'Ramo', 'Aseguradora',
      'No. Póliza', 'Estatus', 'Inicio (DD/MM/YYYY)', 'Vencimiento (DD/MM/YYYY)',
      'Prima Anual', 'Tomador', 'Notas',
    ]
    const example = [
      'CTA-0001', 'Mi Empresa SA de CV', 'auto', 'GNP',
      '12345678', 'active', '01/01/2025', '01/01/2026',
      '15000', 'Juan Pérez', 'Seguro de flotilla',
    ]
    const example2 = [
      'CTA-0002', '', 'gmm', 'AXA',
      '87654321', 'active', '01/03/2025', '01/03/2026',
      '28000', '', 'Gastos médicos colectivo',
    ]
    const ramos  = VALID_BRANCHES.join(', ')
    const status = VALID_STATUSES.join(', ')
    const notes1 = [`Ramos válidos: ${ramos}`, `Estatus válidos: ${status}`]
    const ws = XLSX.utils.aoa_to_sheet([headers, example, example2, [], notes1])
    // Column widths
    ws['!cols'] = [18,28,12,14,14,16,22,22,12,18,30].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pólizas')
    XLSX.writeFile(wb, 'plantilla_importacion_polizas.xlsx')
  }

  const validCount   = rows.filter(r => r.status !== 'error').length
  const errorCount   = rows.filter(r => r.status === 'error').length
  const warningCount = rows.filter(r => r.status === 'warning').length

  // ─── Step: Upload ─────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Sube un archivo Excel (.xlsx) o CSV con tus pólizas.<br />
            Descarga la plantilla para ver el formato correcto.
          </p>
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            Descargar plantilla
          </Button>
        </div>

        <div
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
            dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-600">
            {dragging ? 'Suelta el archivo aquí' : 'Arrastra tu Excel aquí o haz clic para seleccionar'}
          </p>
          <p className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv</p>
        </div>
      </div>
    )
  }

  // ─── Step: Preview ────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              {validCount} válidas
            </span>
            {warningCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-amber-600 font-medium">
                <AlertCircle className="h-4 w-4" />
                {warningCount} con avisos
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-red-500 font-medium">
                <XCircle className="h-4 w-4" />
                {errorCount} con errores (no se importarán)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setRows([]); setStep('upload') }}>
              <X className="h-4 w-4 mr-1" /> Cambiar archivo
            </Button>
            <Button
              size="sm"
              disabled={validCount === 0 || loading}
              onClick={handleImport}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Upload className="h-4 w-4" />
              Importar {validCount} póliza{validCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>

        {/* Preview table */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-8">#</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500">Cuenta</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500">Ramo</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500">Aseguradora</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500">No. Póliza</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500">Estatus</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500">Vigencia</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500">Prima</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(row => (
                  <tr
                    key={row.rowIndex}
                    className={cn(
                      row.status === 'error'   && 'bg-red-50/60',
                      row.status === 'warning' && 'bg-amber-50/40',
                      row.status === 'valid'   && 'hover:bg-gray-50'
                    )}
                  >
                    <td className="px-3 py-2 text-gray-400">{row.rowIndex}</td>
                    <td className="px-3 py-2 max-w-[160px]">
                      <span className={cn('truncate block', !row.account_id && 'text-red-500')}>
                        {row.accountLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {VALID_BRANCHES.includes(row.branch as PolicyBranch)
                        ? branchLabel[row.branch as PolicyBranch]
                        : <span className="text-red-500">{row.branch}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{row.insurer || <span className="text-red-500">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-gray-500">{row.policy_number ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {statusLabel[row.polStatus as PolicyStatus] ?? row.polStatus}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {row.start_date ?? '—'} → {row.end_date ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {row.premium
                        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(row.premium)
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {row.status === 'error' && (
                        <div className="group relative">
                          <XCircle className="h-4 w-4 text-red-400" />
                          <div className="absolute right-5 top-0 z-10 hidden group-hover:block bg-red-700 text-white text-[11px] rounded-lg px-2.5 py-1.5 w-56 shadow-lg">
                            {row.errors.map((e, i) => <p key={i}>{e}</p>)}
                          </div>
                        </div>
                      )}
                      {row.status === 'warning' && (
                        <div className="group relative">
                          <AlertCircle className="h-4 w-4 text-amber-400" />
                          <div className="absolute right-5 top-0 z-10 hidden group-hover:block bg-amber-700 text-white text-[11px] rounded-lg px-2.5 py-1.5 w-56 shadow-lg">
                            {row.warnings.map((w, i) => <p key={i}>{w}</p>)}
                          </div>
                        </div>
                      )}
                      {row.status === 'valid' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step: Results ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className={cn(
        'rounded-xl border p-6 text-center',
        result && result.inserted > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
      )}>
        {result && result.inserted > 0 ? (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
            <p className="text-lg font-semibold text-emerald-800">
              {result.inserted} póliza{result.inserted !== 1 ? 's' : ''} importada{result.inserted !== 1 ? 's' : ''}
            </p>
            {result.failed.length > 0 && (
              <p className="text-sm text-amber-600 mt-1">{result.failed.length} fila{result.failed.length !== 1 ? 's' : ''} con errores no importada{result.failed.length !== 1 ? 's' : ''}</p>
            )}
          </>
        ) : (
          <>
            <XCircle className="h-10 w-10 mx-auto mb-3 text-red-400" />
            <p className="text-base font-medium text-gray-700">No se importaron pólizas</p>
          </>
        )}
      </div>

      {result && result.failed.length > 0 && (
        <div className="rounded-xl border bg-white p-4 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filas con error</p>
          {result.failed.map((f, i) => (
            <p key={i} className="text-sm text-red-500">
              <span className="font-mono text-gray-400">Fila {f.row}:</span> {f.error}
            </p>
          ))}
        </div>
      )}

      <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); setResult(null) }}>
        Nueva importación
      </Button>
    </div>
  )
}
