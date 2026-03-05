'use client'

import { useState, useTransition } from 'react'
import { Settings } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MODULE_CATALOG, type ModuleId } from '@/lib/modules'
import { setTeamSkills } from '@/app/actions/admin-actions'

interface TeamSkillsDialogProps {
  teamId:   string
  teamName: string
  skills:   string[]   // moduleIds ya configurados
}

export function TeamSkillsDialog({ teamId, teamName, skills }: TeamSkillsDialogProps) {
  const [open,    setOpen]    = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(skills))
  const [error,   setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle(moduleId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else                    next.add(moduleId)
      return next
    })
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await setTeamSkills(teamId, [...selected] as ModuleId[])
      if ('error' in result) {
        setError(result.error)
      } else {
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
          <Settings className="h-3.5 w-3.5" />
          Módulos
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Módulos · {teamName}
          </DialogTitle>
          <p className="text-xs text-gray-400 mt-0.5">
            Selecciona los módulos que este equipo puede usar.
            Si no seleccionas ninguno, se muestran todos.
          </p>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {MODULE_CATALOG.map(mod => {
            const Icon    = mod.Icon
            const checked = selected.has(mod.id)
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => toggle(mod.id)}
                className={[
                  'w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                  checked
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white hover:border-gray-300',
                ].join(' ')}
              >
                <div className={`${checked ? 'bg-white/20' : mod.bgClass} ${checked ? 'text-white' : mod.iconClass} rounded-lg p-1.5 shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${checked ? 'text-white' : 'text-gray-900'}`}>
                    {mod.label}
                  </p>
                  <p className={`text-xs truncate ${checked ? 'text-gray-300' : 'text-gray-400'}`}>
                    {mod.description}
                  </p>
                </div>
                <div className={[
                  'h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center',
                  checked ? 'border-white bg-white' : 'border-gray-300',
                ].join(' ')}>
                  {checked && (
                    <svg className="h-2.5 w-2.5 text-gray-900" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
