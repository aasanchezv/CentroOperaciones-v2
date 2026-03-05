'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, AlertCircle, Link2, ToggleLeft, ToggleRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolveReference, saveSyncReferenceMap } from '@/app/actions/sync-actions'
import type { SyncReferenceMap, SyncError } from '@/types/database.types'

interface Profile {
  id:        string
  full_name: string | null
  email:     string | null
}

interface Props {
  unresolvedErrors: SyncError[]
  referenceMaps:    SyncReferenceMap[]
  profiles:         Profile[]
}

type MapType = 'branch' | 'status' | 'conducto' | 'payment_freq' | 'agent' | string

const MAP_TYPE_LABELS: Record<string, string> = {
  branch:       'Ramo',
  status:       'Estatus',
  conducto:     'Conducto de cobro',
  payment_freq: 'Frecuencia de pago',
  agent:        'Agente ejecutivo',
  insurer:      'Aseguradora',
}

const ENUM_OPTIONS: Record<string, { value: string; label: string }[]> = {
  branch: [
    { value: 'gmm',      label: 'GMM' },
    { value: 'vida',     label: 'Vida' },
    { value: 'auto',     label: 'Auto' },
    { value: 'rc',       label: 'Responsabilidad Civil' },
    { value: 'danos',    label: 'Daños' },
    { value: 'transporte', label: 'Transporte' },
    { value: 'fianzas',  label: 'Fianzas' },
    { value: 'ap',       label: 'Accidentes Personales' },
    { value: 'tecnicos', label: 'Técnicos' },
    { value: 'misc',     label: 'Misc' },
  ],
  status: [
    { value: 'active',         label: 'Activa' },
    { value: 'expired',        label: 'Vencida' },
    { value: 'cancelled',      label: 'Cancelada' },
    { value: 'pending_renewal',label: 'Por renovar' },
    { value: 'quote',          label: 'Cotización' },
  ],
  conducto: [
    { value: 'domiciliacion', label: 'Domiciliación (cargo automático)' },
    { value: 'directo',       label: 'Cobro directo' },
  ],
  payment_freq: [
    { value: 'mensual',    label: 'Mensual' },
    { value: 'bimestral',  label: 'Bimestral' },
    { value: 'trimestral', label: 'Trimestral' },
    { value: 'semestral',  label: 'Semestral' },
    { value: 'anual',      label: 'Anual' },
  ],
}

interface PendingResolution {
  mapType:       MapType
  externalValue: string
  localValue:    string
}

export function ReferenceResolver({ unresolvedErrors, referenceMaps, profiles }: Props) {
  const [activeSection, setActiveSection] = useState<'unresolved' | 'active'>('unresolved')
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Agrupar errores de referencias sin resolver
  const unresolvedGroups = unresolvedErrors.reduce<Record<string, { mapType: string; values: string[] }>>((acc, err) => {
    if (err.error_type !== 'unresolved_reference') return acc
    const rawData = err.raw_data as Record<string, unknown> | null
    if (!rawData) return acc
    const field = String(rawData.field ?? '')
    const value = String(rawData.value ?? '')
    if (!field || !value) return acc
    // Extraer mapType del mensaje (contiene 'branch=', 'status=', etc.)
    const mapTypeMatch = err.error_message.match(/^No se encontró mapeo para (\w+)=/)
    const mapType = mapTypeMatch?.[1] ?? 'unknown'
    const key = `${mapType}::${value}`
    if (!acc[key]) acc[key] = { mapType, values: [] }
    if (!acc[key].values.includes(value)) acc[key].values.push(value)
    return acc
  }, {})

  const unresolvedList = Object.entries(unresolvedGroups).map(([key, v]) => ({
    key,
    mapType:       v.mapType,
    externalValue: v.values[0] ?? key,
  }))

  const [resolutions, setResolutions] = useState<Record<string, string>>(
    Object.fromEntries(unresolvedList.map(u => [u.key, '']))
  )

  function updateResolution(key: string, localValue: string) {
    setResolutions(prev => ({ ...prev, [key]: localValue }))
  }

  async function handleSaveResolutions() {
    setMessage(null)
    const toSave = unresolvedList.filter(u => resolutions[u.key]?.trim())
    if (toSave.length === 0) {
      setMessage({ type: 'error', text: 'Asigna al menos un valor local antes de guardar.' })
      return
    }

    startTransition(async () => {
      let savedCount = 0
      const errors: string[] = []
      for (const u of toSave) {
        const localValue = resolutions[u.key].trim()
        try {
          await resolveReference(u.externalValue, u.mapType, localValue)
          savedCount++
        } catch (e) {
          errors.push(`${u.externalValue}: ${(e as Error).message}`)
        }
      }
      if (errors.length > 0) {
        setMessage({ type: 'error', text: `${savedCount} guardados. Errores: ${errors.join(' | ')}` })
      } else {
        setMessage({ type: 'success', text: `${savedCount} referencias resueltas. En el próximo sync se usarán automáticamente.` })
      }
    })
  }

  async function handleToggleActive(refMap: SyncReferenceMap) {
    startTransition(async () => {
      try {
        await saveSyncReferenceMap(refMap.id, {
          map_type:       refMap.map_type,
          external_value: refMap.external_value,
          local_value:    refMap.local_value,
          auto_detected:  refMap.auto_detected,
          is_active:      !refMap.is_active,
          notes:          refMap.notes,
        })
      } catch (e) {
        setMessage({ type: 'error', text: (e as Error).message })
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Tabs internos */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {([
          { key: 'unresolved', label: `Sin resolver (${unresolvedList.length})` },
          { key: 'active',     label: `Mapeos activos (${referenceMaps.length})` },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={[
              'px-3 py-1.5 text-xs rounded-md transition-all',
              activeSection === tab.key
                ? 'bg-white text-gray-900 font-medium shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message && (
        <div className={[
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          message.type === 'success'
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-red-700 bg-red-50 border-red-200',
        ].join(' ')}>
          {message.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          {message.text}
        </div>
      )}

      {/* Sin resolver */}
      {activeSection === 'unresolved' && (
        unresolvedList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-300">
            <Link2 className="h-8 w-8 mb-2" />
            <p className="text-sm text-gray-400">Sin referencias pendientes</p>
            <p className="text-xs mt-0.5">Todos los valores del externo tienen mapeo local</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Asigna el valor local para cada valor externo no reconocido.
              Después de guardar, el próximo sync los usará automáticamente.
            </p>
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Tipo</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Valor externo</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Valor local</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {unresolvedList.map(u => (
                    <tr key={u.key} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {MAP_TYPE_LABELS[u.mapType] ?? u.mapType}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-amber-700 bg-amber-50 rounded-sm">
                        {u.externalValue}
                      </td>
                      <td className="px-4 py-2.5">
                        {u.mapType === 'agent' ? (
                          <select
                            value={resolutions[u.key] ?? ''}
                            onChange={e => updateResolution(u.key, e.target.value)}
                            className="text-xs border rounded px-2 py-1 w-full bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                          >
                            <option value="">— Selecciona agente —</option>
                            {profiles.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.full_name ?? p.email ?? p.id}
                              </option>
                            ))}
                          </select>
                        ) : ENUM_OPTIONS[u.mapType] ? (
                          <select
                            value={resolutions[u.key] ?? ''}
                            onChange={e => updateResolution(u.key, e.target.value)}
                            className="text-xs border rounded px-2 py-1 w-full bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                          >
                            <option value="">— Selecciona valor —</option>
                            {ENUM_OPTIONS[u.mapType].map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={resolutions[u.key] ?? ''}
                            onChange={e => updateResolution(u.key, e.target.value)}
                            placeholder="Valor local…"
                            className="text-xs border rounded px-2 py-1 w-full bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" className="gap-2" onClick={handleSaveResolutions} disabled={isPending}>
              <CheckCircle2 className="h-4 w-4" />
              Guardar resoluciones
            </Button>
          </div>
        )
      )}

      {/* Mapeos activos */}
      {activeSection === 'active' && (
        referenceMaps.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            Sin mapeos de referencias. Se crean automáticamente al resolver errores.
          </div>
        ) : (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Tipo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Externo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Local</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-400">Auto</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-400">Activo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {referenceMaps.map(rm => (
                  <tr key={rm.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {MAP_TYPE_LABELS[rm.map_type] ?? rm.map_type}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{rm.external_value}</td>
                    <td className="px-4 py-2 font-mono text-xs text-emerald-700">{rm.local_value}</td>
                    <td className="px-4 py-2 text-center">
                      {rm.auto_detected && (
                        <span className="text-xs text-blue-500 bg-blue-50 border border-blue-200 rounded-full px-1.5">auto</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => handleToggleActive(rm)}
                        disabled={isPending}
                        className="text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        {rm.is_active
                          ? <ToggleRight className="h-4 w-4 text-emerald-500" />
                          : <ToggleLeft className="h-4 w-4 text-gray-300" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
