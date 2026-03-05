'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Building2, User } from 'lucide-react'

const tabs = [
  { value: '',             label: 'Todas',        icon: null },
  { value: 'empresa',      label: 'Corporativas', icon: Building2 },
  { value: 'persona_fisica', label: 'Individuales', icon: User },
] as const

export function AccountsTypeTabs({ defaultType }: { defaultType?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function handleTab(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('type', value)
    else params.delete('type')
    startTransition(() => router.replace(`${pathname}?${params.toString()}`))
  }

  const active = defaultType ?? ''

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-gray-50/80 p-0.5">
      {tabs.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => handleTab(value)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
            active === value
              ? 'bg-white shadow-sm text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </button>
      ))}
    </div>
  )
}
