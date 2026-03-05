'use client'

import { useState, useRef }       from 'react'
import { Upload, CheckCircle2, AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { Button }                 from '@/components/ui/button'
import { Input }                  from '@/components/ui/input'
import { Label }                  from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ColumnMapper }           from './column-mapper'
import { getClaimColumnMappings, importClaims } from '@/app/actions/claim-actions'
import { applyColumnMappings }    from '@/lib/claims-utils'
import type { ClaimColumnMapping, ParsedClaimRow } from '@/types/database.types'

interface Insurer { id: string; name: string; short_name: string | null }

type Step = 'upload' | 'mapping' | 'preview' | 'done'

interface ImportResult {
  total:     number
  matched:   number
  unmatched: number
}

interface Props {
  insurers: Insurer[]
}

export function ImportWizard({ insurers }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  // Step state
  const [step,        setStep]        = useState<Step>('upload')
  const [insurerId,   setInsurerId]   = useState<string>('')
  const [fileName,    setFileName]    = useState<string>('')
  const [periodLabel, setPeriodLabel] = useState<string>('')
  const [fileHeaders, setFileHeaders] = useState<string[]>([])
  const [parsedRows,  setParsedRows]  = useState<Record<string, unknown>[]>([])
  const [mappings,    setMappings]    = useState<ClaimColumnMapping[]>([])
  const [previewRows, setPreviewRows] = useState<ParsedClaimRow[]>([])
  const [matchCount,  setMatchCount]  = useState(0)
  const [importing,   setImporting]   = useState(false)
  const [result,      setResult]      = useState<ImportResult | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)

  // ── Paso 1: Upload ──────────────────────────────────────────────────────────

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !insurerId) return

    setLoading(true)
    setError(null)

    try {
      const XLSX   = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb     = XLSX.read(buffer, { cellDates: true })
      const ws     = wb.Sheets[wb.SheetNames[0]]
      const raw    = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        raw:    false,
        defval: '',
      })

      if (raw.length === 0) { setError('El archivo está vacío.'); return }

      const headers = Object.keys(raw[0])
      setFileHeaders(headers)
      setParsedRows(raw)
      setFileName(file.name)

      // Buscar mapeos guardados para esta aseguradora
      const savedMappings = await getClaimColumnMappings(insurerId)
      setMappings(savedMappings)

      if (savedMappings.length > 0) {
        // Verificar que el campo policy_number esté mapeado
        const hasPolicyMap = savedMappings.some(m => m.target_field === 'policy_number')
        if (hasPolicyMap) {
          buildPreview(raw, savedMappings)
          setStep('preview')
        } else {
          setStep('mapping')
        }
      } else {
        setStep('mapping')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al leer el archivo')
    } finally {
      setLoading(false)
      if (e.target) e.target.value = ''
    }
  }

  // ── Paso 2: Mapping guardado → Preview ────────────────────────────────────

  function buildPreview(rows: Record<string, unknown>[], maps: ClaimColumnMapping[]) {
    const parsed = rows.map(r => applyColumnMappings(r, maps))
    const matched = parsed.filter(r => !!r.policy_number_raw).length
    setParsedRows(rows)
    setPreviewRows(parsed)
    setMatchCount(matched)
  }

  function handleMappingSaved(newValues: Record<string, string>) {
    // Convertir el dict a ClaimColumnMapping[]
    const newMappings: ClaimColumnMapping[] = Object.entries(newValues)
      .filter(([, src]) => !!src && src !== 'none')
      .map(([target_field, source_column]) => ({
        id:            '',
        insurer_id:    insurerId,
        source_column,
        target_field,
        is_active:     true,
        created_at:    '',
      }))
    setMappings(newMappings)
    buildPreview(parsedRows, newMappings)
    setStep('preview')
  }

  // ── Paso 3: Confirmar importación ─────────────────────────────────────────

  async function handleImport() {
    if (!periodLabel.trim()) { setError('Ingresa el período del reporte.'); return }
    setImporting(true)
    setError(null)
    try {
      const res = await importClaims(
        { insurer_id: insurerId, file_name: fileName, period_label: periodLabel },
        previewRows
      )
      if (res.error) { setError(res.error); return }
      setResult({ total: res.total, matched: res.matched, unmatched: res.unmatched })
      setStep('done')
    } finally {
      setImporting(false)
    }
  }

  function handleReset() {
    setStep('upload')
    setInsurerId('')
    setFileName('')
    setPeriodLabel('')
    setFileHeaders([])
    setParsedRows([])
    setMappings([])
    setPreviewRows([])
    setMatchCount(0)
    setResult(null)
    setError(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Paso 1 — Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Aseguradora</Label>
            <Select value={insurerId} onValueChange={setInsurerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona la aseguradora…" />
              </SelectTrigger>
              <SelectContent>
                {insurers.map(ins => (
                  <SelectItem key={ins.id} value={ins.id}>
                    {ins.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors ${
              insurerId ? 'cursor-pointer border-gray-300 hover:border-blue-400 hover:bg-blue-50/30' : 'border-gray-200 bg-gray-50 opacity-60'
            }`}
            onClick={() => insurerId && fileRef.current?.click()}
          >
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            ) : (
              <>
                <Upload className="h-8 w-8 text-gray-400" />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">
                    {insurerId ? 'Haz clic o arrastra el archivo aquí' : 'Primero selecciona una aseguradora'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Excel (.xlsx) o CSV (.csv)</p>
                </div>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFile}
              disabled={!insurerId}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}

      {/* Paso 2 — Mapeo de columnas */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Mapeo de columnas</p>
              <p className="text-xs text-gray-500 mt-0.5">{fileName} · {parsedRows.length} filas</p>
            </div>
            <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Volver
            </button>
          </div>
          <ColumnMapper
            insurerId={insurerId}
            fileHeaders={fileHeaders}
            initialValues={Object.fromEntries(mappings.map(m => [m.target_field, m.source_column]))}
            onSaved={handleMappingSaved}
          />
        </div>
      )}

      {/* Paso 3 — Preview y confirmación */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Vista previa — {fileName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{previewRows.length} filas · {matchCount} con póliza encontrada</p>
            </div>
            <button onClick={() => setStep('mapping')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Editar mapeo
            </button>
          </div>

          {/* Resumen visual */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-lg border bg-emerald-50 p-3">
              <p className="text-2xl font-bold text-emerald-700">{matchCount}</p>
              <p className="text-xs text-emerald-600 mt-0.5">Pólizas encontradas</p>
            </div>
            <div className="flex-1 rounded-lg border bg-amber-50 p-3">
              <p className="text-2xl font-bold text-amber-700">{previewRows.length - matchCount}</p>
              <p className="text-xs text-amber-600 mt-0.5">Sin match</p>
            </div>
            <div className="flex-1 rounded-lg border bg-gray-50 p-3">
              <p className="text-2xl font-bold text-gray-700">{previewRows.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total</p>
            </div>
          </div>

          {/* Preview table (10 filas) */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">No. Póliza</th>
                  <th className="px-3 py-2 text-left font-medium">No. Siniestro</th>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previewRows.slice(0, 10).map((r, i) => (
                  <tr key={i} className={r.policy_number_raw && matchCount > i ? 'bg-white' : 'bg-amber-50/40'}>
                    <td className="px-3 py-1.5 font-mono">{r.policy_number_raw ?? '—'}</td>
                    <td className="px-3 py-1.5">{r.claim_number ?? '—'}</td>
                    <td className="px-3 py-1.5">{r.loss_date ?? '—'}</td>
                    <td className="px-3 py-1.5 max-w-[150px] truncate">{r.claim_type ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                        r.policy_number_raw ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {r.policy_number_raw ? '✓' : '?'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewRows.length > 10 && (
              <p className="px-3 py-2 text-xs text-gray-400 bg-gray-50">
                + {previewRows.length - 10} filas más
              </p>
            )}
          </div>

          {/* Período y confirmar */}
          <div className="space-y-1.5">
            <Label>Período del reporte</Label>
            <Input
              placeholder="Ej: Enero 2026"
              value={periodLabel}
              onChange={e => setPeriodLabel(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleReset}>Cancelar</Button>
            <Button size="sm" onClick={handleImport} disabled={importing || !periodLabel.trim()} className="gap-2">
              {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {importing ? 'Importando…' : `Importar ${previewRows.length} registros`}
            </Button>
          </div>
        </div>
      )}

      {/* Paso 4 — Resultado */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-emerald-800">Importación completada</p>
              <p className="text-sm text-emerald-700 mt-1">
                <strong>{result.total}</strong> registros procesados ·{' '}
                <strong>{result.matched}</strong> matcheados ·{' '}
                {result.unmatched > 0 && (
                  <span className="text-amber-700">
                    <strong>{result.unmatched}</strong> sin match (ver pestaña "Sin Match")
                  </span>
                )}
                {result.unmatched === 0 && <span>todos matcheados</span>}
              </p>
            </div>
          </div>

          {result.unmatched > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                {result.unmatched} siniestros no pudieron matchearse a una póliza.
                Puedes revisarlos en la pestaña <strong>Sin Match</strong>.
              </p>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
            <Upload className="h-3.5 w-3.5" /> Importar otro reporte
          </Button>
        </div>
      )}
    </div>
  )
}
