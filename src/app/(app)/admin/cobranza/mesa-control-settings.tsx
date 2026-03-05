'use client'

import { useState, useTransition } from 'react'
import { updateAppSetting } from '@/app/actions/proof-actions'
import { Loader2, Save } from 'lucide-react'

interface Props {
  initialEmail: string | null
}

export function MesaControlSettings({ initialEmail }: Props) {
  const [email, setEmail]       = useState(initialEmail ?? '')
  const [saved, setSaved]       = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError]       = useState<string | null>(null)

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await updateAppSetting('mesa_control_email', email.trim())
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Mesa de Control</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Los comprobantes de pago que suban los ejecutivos se reenviarán automáticamente a este correo.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="mesa.control@murguia.com"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors shrink-0"
        >
          {isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />
          }
          Guardar
        </button>
      </div>

      {saved && (
        <p className="text-xs text-emerald-600">✓ Email guardado correctamente</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
