'use client'

import { useTransition } from 'react'
import { deletePolicy } from '@/app/actions/policy-actions'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export function DeletePolicyButton({ policyId, accountId }: { policyId: string; accountId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
      disabled={pending}
      onClick={() => startTransition(() => deletePolicy(policyId, accountId))}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}
