'use client'

import { useState, useTransition } from 'react'
import { saveSemaphoreSettings }   from '@/app/actions/renewal-actions'
import { Button }                  from '@/components/ui/button'
import { Activity, Loader2 }       from 'lucide-react'

interface Props {
  settings: { green: number; yellow: number }
}

export function SemaphoreConfig({ settings }: Props) {
  const [green,  setGreen]  = useState(settings.green)
  const [yellow, setYellow] = useState(settings.yellow)
  const [error,  setError]  = useState<string | null>(null)
  const [saved,  setSaved]  = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    if (yellow >= green) {
      setError('El umbral verde debe ser mayor que el amarillo')
      return
    }
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await saveSemaphoreSettings(green, yellow)
      if ('error' in res) {
        setError(res.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2 pb-4 border-b">
        <Activity className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-medium text-gray-700">Configuración del semáforo</h2>
        <span className="ml-1 text-xs text-gray-400">(% de renovaciones completadas este mes)</span>
      </div>

      <div className="space-y-4 max-w-sm">
        {/* Green threshold */}
        <div className="flex items-center gap-3">
          <span className="text-base">🟢</span>
          <label className="text-sm text-gray-600 flex-1">
            Verde si renovado ≥
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={100}
              value={green}
              onChange={e => setGreen(parseInt(e.target.value) || 0)}
              className="w-16 text-sm text-center border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-gray-400"
            />
            <span className="text-sm text-gray-400">%</span>
          </div>
        </div>

        {/* Yellow threshold */}
        <div className="flex items-center gap-3">
          <span className="text-base">🟡</span>
          <label className="text-sm text-gray-600 flex-1">
            Amarillo si renovado ≥
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={100}
              value={yellow}
              onChange={e => setYellow(parseInt(e.target.value) || 0)}
              className="w-16 text-sm text-center border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-gray-400"
            />
            <span className="text-sm text-gray-400">%</span>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          🔴 Rojo si renovado &lt; {yellow}% &nbsp;·&nbsp;
          Por debajo del umbral amarillo
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {saved && (
        <p className="text-xs text-green-600">✓ Configuración guardada</p>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleSave}
        disabled={pending}
        className="gap-1.5"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Guardar
      </Button>
    </div>
  )
}
