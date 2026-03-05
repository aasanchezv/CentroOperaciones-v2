'use client'

import { useState, useTransition } from 'react'
import { MoreHorizontal, UserCheck, UserX, Shield, Users, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { updateUserRole, toggleUserActive, assignUserTeam, updateUserName } from '@/app/actions/admin-actions'
import type { UserRole, Team } from '@/types/database.types'

const roles: { value: UserRole; label: string }[] = [
  { value: 'admin',    label: 'Admin' },
  { value: 'ops',      label: 'Ops' },
  { value: 'manager',  label: 'Manager' },
  { value: 'agent',    label: 'Agente' },
  { value: 'readonly', label: 'Solo lectura' },
]

interface Props {
  userId: string
  currentRole: UserRole
  currentTeamId: string | null
  currentName: string | null
  isActive: boolean
  isSelf: boolean
  teams: Pick<Team, 'id' | 'name'>[]
}

export function UserRowActions({ userId, currentRole, currentTeamId, currentName, isActive, isSelf, teams }: Props) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [nameValue, setNameValue] = useState(currentName ?? '')

  function handleRoleChange(role: UserRole) {
    setOpen(false)
    startTransition(() => updateUserRole(userId, role))
  }

  function handleToggleActive() {
    setOpen(false)
    startTransition(() => toggleUserActive(userId, isActive))
  }

  function handleTeamChange(teamId: string | null) {
    setOpen(false)
    startTransition(() => assignUserTeam(userId, teamId))
  }

  function handleSaveName() {
    if (!nameValue.trim()) return
    setNameDialogOpen(false)
    startTransition(() => updateUserName(userId, nameValue))
  }

  return (
    <>
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          disabled={isPending}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Acciones</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Cambiar rol */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Shield className="h-4 w-4" />
            Cambiar rol
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {roles.map((r) => (
              <DropdownMenuItem
                key={r.value}
                onClick={() => handleRoleChange(r.value)}
                className={currentRole === r.value ? 'font-medium bg-gray-50' : ''}
                disabled={isSelf && r.value !== 'admin'}
              >
                {r.label}
                {currentRole === r.value && (
                  <span className="ml-auto text-xs text-gray-400">actual</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Asignar equipo */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Users className="h-4 w-4" />
            Asignar equipo
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onClick={() => handleTeamChange(null)}
              className={!currentTeamId ? 'font-medium bg-gray-50' : ''}
            >
              Sin equipo
              {!currentTeamId && <span className="ml-auto text-xs text-gray-400">actual</span>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {teams.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onClick={() => handleTeamChange(t.id)}
                className={currentTeamId === t.id ? 'font-medium bg-gray-50' : ''}
              >
                {t.name}
                {currentTeamId === t.id && (
                  <span className="ml-auto text-xs text-gray-400">actual</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Editar nombre */}
        <DropdownMenuItem
          onClick={() => { setOpen(false); setNameDialogOpen(true) }}
          className="gap-2"
        >
          <Pencil className="h-4 w-4" />
          Editar nombre
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleToggleActive}
          disabled={isSelf}
          className={isActive ? 'text-red-600 focus:text-red-600' : 'text-green-600 focus:text-green-600'}
        >
          {isActive ? (
            <><UserX className="h-4 w-4 mr-2" />Desactivar</>
          ) : (
            <><UserCheck className="h-4 w-4 mr-2" />Activar</>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar nombre</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Nombre completo"
          value={nameValue}
          onChange={e => setNameValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSaveName()}
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setNameDialogOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSaveName} disabled={!nameValue.trim() || isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
