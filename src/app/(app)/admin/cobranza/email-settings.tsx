'use client'

import { useState, useTransition } from 'react'
import { updateAppSetting } from '@/app/actions/proof-actions'
import { Loader2, Save } from 'lucide-react'

interface Props {
  initialGlobalCc:     string | null
  initialVipCc:        string | null
  initialIncomeGoal:   string | null
}

function SettingRow({
  label,
  description,
  value,
  onChange,
  placeholder,
  type = 'email',
}: {
  label:        string
  description:  string
  value:        string
  onChange:     (v: string) => void
  placeholder:  string
  type?:        'email' | 'number'
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </div>
  )
}

export function EmailSettings({ initialGlobalCc, initialVipCc, initialIncomeGoal }: Props) {
  const [globalCc,    setGlobalCc]    = useState(initialGlobalCc   ?? '')
  const [vipCc,       setVipCc]       = useState(initialVipCc      ?? '')
  const [incomeGoal,  setIncomeGoal]  = useState(initialIncomeGoal ?? '')

  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await Promise.all([
          updateAppSetting('global_email_cc',          globalCc.trim()),
          updateAppSetting('vip_email_cc',             vipCc.trim()),
          updateAppSetting('agent_monthly_income_goal', incomeGoal.trim()),
        ])
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm p-6 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Configuración de correos</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          CC automático en correos salientes y objetivo mensual de ingresos.
        </p>
      </div>

      <div className="space-y-4">
        <SettingRow
          label="CC global (todos los correos)"
          description="Se agrega como copia en todos los correos que envía el sistema (renovaciones, cobranza, contact center)."
          value={globalCc}
          onChange={setGlobalCc}
          placeholder="operaciones@murguia.com"
        />
        <SettingRow
          label="CC adicional para clientes VIP"
          description="Además del CC global, este correo recibe copia cuando el cliente tiene marcado el flag VIP."
          value={vipCc}
          onChange={setVipCc}
          placeholder="gerencia@murguia.com"
        />
        <SettingRow
          label="Objetivo mensual de ingresos (MXN)"
          description="Meta de prima cobrada por agente al mes. Aparece en el dashboard del agente como barra de progreso."
          value={incomeGoal}
          onChange={setIncomeGoal}
          placeholder="150000"
          type="number"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div>
          {saved && <p className="text-xs text-emerald-600">✓ Configuración guardada</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />
          }
          Guardar
        </button>
      </div>
    </div>
  )
}
