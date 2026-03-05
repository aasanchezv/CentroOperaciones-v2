'use client'

import { useState } from 'react'
import { Check }    from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Label }    from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { saveClaimColumnMappings }  from '@/app/actions/claim-actions'
import { CLAIM_TARGET_FIELDS }      from '@/types/database.types'

interface Props {
  insurerId:     string
  fileHeaders:   string[]                             // columnas del Excel
  initialValues: Record<string, string>               // target_field → source_column
  onSaved:       (mappings: Record<string, string>) => void
}

export function ColumnMapper({ insurerId, fileHeaders, initialValues, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const hasPolicyNumber = !!values['policy_number']

  async function handleSave() {
    if (!hasPolicyNumber) {
      setError('El campo "Número de póliza" es requerido para hacer el match.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const mappings = Object.entries(values)
        .filter(([, src]) => !!src && src !== 'none')
        .map(([target_field, source_column]) => ({ source_column, target_field }))

      const result = await saveClaimColumnMappings(insurerId, mappings)
      if (result.error) { setError(result.error); return }
      onSaved(values)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Este es el primer reporte de esta aseguradora. Indica qué columna del Excel corresponde a cada campo.
        El mapeo se guardará y se aplicará automáticamente en importaciones futuras.
      </div>

      <div className="divide-y divide-gray-100 rounded-lg border bg-white">
        {CLAIM_TARGET_FIELDS.map(tf => (
          <div key={tf.field} className="flex items-center gap-4 px-4 py-2.5">
            <div className="w-44 shrink-0">
              <Label className="text-xs font-medium text-gray-700">
                {tf.label}
                {tf.required && <span className="ml-1 text-red-500">*</span>}
              </Label>
            </div>
            <div className="flex-1">
              <Select
                value={values[tf.field] ?? 'none'}
                onValueChange={v => setValues(prev => ({ ...prev, [tf.field]: v === 'none' ? '' : v }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="— sin mapear —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— sin mapear —</SelectItem>
                  {fileHeaders.map(h => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !hasPolicyNumber}
          className="gap-2"
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? 'Guardando…' : 'Guardar mapeo y continuar'}
        </Button>
      </div>
    </div>
  )
}
