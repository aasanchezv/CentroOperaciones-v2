'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useRef } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Search } from 'lucide-react'

export function AccountsSearch({ defaultQ, defaultStatus }: { defaultQ?: string; defaultStatus?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function push(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page') // reset pagination if any
    startTransition(() => router.replace(`${pathname}?${params.toString()}`))
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => push('q', e.target.value), 300)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <Input
          className="pl-8 w-52 h-8 text-sm"
          placeholder="Buscar cuenta…"
          defaultValue={defaultQ}
          onChange={handleSearch}
        />
      </div>
      <Select
        defaultValue={defaultStatus ?? 'all'}
        onValueChange={(v) => push('status', v === 'all' ? '' : v)}
      >
        <SelectTrigger className="h-8 text-sm w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="prospect">Prospectos</SelectItem>
          <SelectItem value="active">Activas</SelectItem>
          <SelectItem value="inactive">Inactivas</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
