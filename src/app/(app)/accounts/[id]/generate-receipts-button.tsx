'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generatePolicyReceipts } from '@/app/actions/cobranza-receipt-actions'

interface Props {
  policyId:         string
  paymentFrequency: string | null
}

export function GenerateReceiptsButton({ policyId, paymentFrequency }: Props) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  if (!paymentFrequency) return null

  function handleClick() {
    setMessage(null)
    startTransition(async () => {
      const result = await generatePolicyReceipts(policyId)
      if (result.error) {
        setMessage(`Error: ${result.error}`)
      } else {
        setMessage(`✓ ${result.count} recibo${result.count === 1 ? '' : 's'} generado${result.count === 1 ? '' : 's'}`)
        setTimeout(() => setMessage(null), 4000)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="h-7 text-xs gap-1.5"
      >
        {isPending
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <RefreshCw className="h-3 w-3" />
        }
        Generar recibos
      </Button>
      {message && (
        <span className={`text-xs ${message.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>
          {message}
        </span>
      )}
    </div>
  )
}
