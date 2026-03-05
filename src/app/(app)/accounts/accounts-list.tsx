'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { deleteAccountsBulk, mergeAccounts } from '@/app/actions/account-actions'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Building2, ChevronRight, Trash2, GitMerge } from 'lucide-react'
import type { AccountStatus, AccountType } from '@/types/database.types'

const statusLabel: Record<AccountStatus, string> = {
  prospect: 'Prospecto',
  active:   'Activa',
  inactive: 'Inactiva',
}

const statusClass: Record<AccountStatus, string> = {
  prospect: 'bg-amber-50 text-amber-600 border-amber-200',
  active:   'bg-emerald-50 text-emerald-600 border-emerald-200',
  inactive: 'bg-gray-50 text-gray-400 border-gray-200',
}

const typeLabel: Record<AccountType, string> = {
  empresa:        'Empresa',
  persona_fisica: 'Persona física',
}

type AccountItem = {
  id: string
  account_code: string
  name: string
  type: string
  status: string
  team_id: string | null
  assigned_to: string | null
  updated_at: string
  teams: { name: string } | { name: string }[] | null
  profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null
}

interface Props {
  accounts:  AccountItem[]
  canDelete: boolean
  canMerge?: boolean
}

export function AccountsList({ accounts, canDelete, canMerge = false }: Props) {
  const router = useRouter()

  // ── Delete state ──────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isPendingDelete, startDeleteTransition] = useTransition()

  // ── Merge state ───────────────────────────────────────────────
  const [mergeMode,       setMergeMode]       = useState(false)
  const [mergeSelected,   setMergeSelected]   = useState<string[]>([])
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [keepId,          setKeepId]          = useState<string | null>(null)
  const [mergeError,      setMergeError]      = useState<string | null>(null)
  const [isPendingMerge,  startMergeTransition] = useTransition()

  // ── Delete handlers ───────────────────────────────────────────
  function toggleOne(id: string) {
    if (mergeMode) return
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (mergeMode) return
    if (selected.size === accounts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(accounts.map(a => a.id)))
    }
  }

  function handleDelete() {
    setDeleteError(null)
    startDeleteTransition(async () => {
      try {
        await deleteAccountsBulk(Array.from(selected))
        setSelected(new Set())
        setShowConfirm(false)
        router.refresh()
      } catch (e) {
        setDeleteError(e instanceof Error ? e.message : 'Error al eliminar las cuentas')
      }
    })
  }

  // ── Merge handlers ────────────────────────────────────────────
  function toggleMergeSelect(id: string) {
    setMergeSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 2) return prev // max 2
      return [...prev, id]
    })
  }

  function openMergeDialog() {
    setKeepId(mergeSelected[0])
    setMergeError(null)
    setShowMergeDialog(true)
  }

  function handleMerge() {
    if (!keepId || mergeSelected.length < 2) return
    const sourceId = mergeSelected.find(id => id !== keepId)!
    setMergeError(null)
    startMergeTransition(async () => {
      const result = await mergeAccounts(sourceId, keepId)
      if (result.error) {
        setMergeError(result.error)
        return
      }
      setShowMergeDialog(false)
      setMergeMode(false)
      setMergeSelected([])
      router.refresh()
    })
  }

  function exitMergeMode() {
    setMergeMode(false)
    setMergeSelected([])
    setMergeError(null)
  }

  const allSelected = accounts.length > 0 && selected.size === accounts.length

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-300">
        <Building2 className="h-10 w-10 mb-3" />
        <p className="text-sm text-gray-400">No hay cuentas aún</p>
        <p className="text-xs mt-0.5">Crea la primera usando el botón de arriba</p>
      </div>
    )
  }

  return (
    <>
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      {(canDelete || canMerge) && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-gray-50">

          {/* Modo fusión activo */}
          {mergeMode ? (
            <>
              <span className="text-xs text-gray-600 font-medium">
                {mergeSelected.length} de 2 cuentas seleccionadas
              </span>
              <Button
                size="sm"
                variant="default"
                className="h-7 px-3 text-xs gap-1.5 ml-auto bg-violet-600 hover:bg-violet-700"
                onClick={openMergeDialog}
                disabled={mergeSelected.length < 2}
              >
                <GitMerge className="h-3.5 w-3.5" />
                Fusionar →
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-3 text-xs text-gray-500"
                onClick={exitMergeMode}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              {/* Checkbox all (solo en modo delete) */}
              {canDelete && (
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 accent-slate-700 cursor-pointer"
                  title="Seleccionar todas"
                />
              )}

              {selected.size > 0 ? (
                <>
                  <span className="text-xs text-gray-600 font-medium">
                    {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-3 text-xs gap-1.5 ml-auto"
                    onClick={() => setShowConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-3 text-xs text-gray-500"
                    onClick={() => setSelected(new Set())}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  {canDelete && (
                    <span className="text-xs text-gray-400">Seleccionar todas</span>
                  )}
                  {canMerge && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-3 text-xs gap-1.5 ml-auto text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                      onClick={() => { setMergeMode(true); setSelected(new Set()) }}
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      Fusionar cuentas
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Lista ───────────────────────────────────────────────── */}
      <ul className="divide-y">
        {accounts.map((account) => {
          const teamName = (Array.isArray(account.teams)
            ? account.teams[0]
            : account.teams as { name: string } | null)?.name

          const assignedProfile = Array.isArray(account.profiles)
            ? account.profiles[0] as { full_name: string | null; email: string } | null
            : account.profiles as { full_name: string | null; email: string } | null

          const agentName    = assignedProfile?.full_name ?? assignedProfile?.email ?? null
          const isDeleteSel  = selected.has(account.id)
          const isMergeSel   = mergeSelected.includes(account.id)
          const showCheckbox = canDelete && !mergeMode
          const showMergeCb  = mergeMode

          return (
            <li key={account.id} className={`relative flex items-center ${isDeleteSel ? 'bg-red-50' : isMergeSel ? 'bg-violet-50' : ''}`}>
              {showCheckbox && (
                <div
                  className="shrink-0 w-12 flex items-center justify-center self-stretch cursor-pointer"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); toggleOne(account.id) }}
                >
                  <input
                    type="checkbox"
                    checked={isDeleteSel}
                    onChange={() => toggleOne(account.id)}
                    className="h-4 w-4 rounded border-gray-300 accent-slate-700 cursor-pointer"
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              )}
              {showMergeCb && (
                <div
                  className="shrink-0 w-12 flex items-center justify-center self-stretch cursor-pointer"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); toggleMergeSelect(account.id) }}
                >
                  <input
                    type="checkbox"
                    checked={isMergeSel}
                    onChange={() => toggleMergeSelect(account.id)}
                    className="h-4 w-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
                    onClick={e => e.stopPropagation()}
                    disabled={!isMergeSel && mergeSelected.length >= 2}
                  />
                </div>
              )}
              <Link
                href={mergeMode ? '#' : `/accounts/${account.id}`}
                onClick={mergeMode ? (e) => { e.preventDefault(); toggleMergeSelect(account.id) } : undefined}
                className={`flex flex-1 items-center gap-4 px-4 py-3 transition-colors group ${
                  mergeMode
                    ? `cursor-pointer ${isMergeSel ? 'hover:bg-violet-100' : mergeSelected.length >= 2 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-violet-50'}`
                    : `hover:bg-gray-50 ${isDeleteSel ? 'hover:bg-red-50' : ''}`
                }`}
              >
                {/* Icon */}
                <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-slate-400" />
                </div>

                {/* Name + code */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
                    <span className="text-xs text-gray-300 font-mono shrink-0">{account.account_code}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400">{typeLabel[account.type as AccountType]}</span>
                    {teamName && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">{teamName}</span>
                      </>
                    )}
                    {agentName && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">{agentName}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shrink-0 ${statusClass[account.status as AccountStatus]}`}>
                  {statusLabel[account.status as AccountStatus]}
                </span>

                {!mergeMode && (
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 group-hover:text-gray-400 transition-colors" />
                )}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* ── Dialog: Eliminar ────────────────────────────────────── */}
      <Dialog open={showConfirm} onOpenChange={v => { if (!isPendingDelete) { setShowConfirm(v); setDeleteError(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar {selected.size} cuenta{selected.size !== 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-700">
              Esta acción eliminará permanentemente <strong>{selected.size} cuenta{selected.size !== 1 ? 's' : ''}</strong> junto con todos sus contactos, pólizas y datos asociados.
            </p>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Esta operación no se puede deshacer.
            </p>
            {deleteError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {deleteError}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowConfirm(false)} disabled={isPendingDelete}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPendingDelete} className="gap-2">
              {isPendingDelete && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Fusionar ────────────────────────────────────── */}
      <Dialog open={showMergeDialog} onOpenChange={v => { if (!isPendingMerge) { setShowMergeDialog(v); setMergeError(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-violet-600" />
              Fusionar cuentas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-700">
              Selecciona cuál cuenta <strong>conservar</strong>. La otra se marcará como fusionada y sus pólizas, contactos y tareas pasarán a la cuenta seleccionada.
            </p>
            <div className="space-y-2">
              {mergeSelected.map(id => {
                const acc = accounts.find(a => a.id === id)
                if (!acc) return null
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      keepId === id ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="keep_account"
                      value={id}
                      checked={keepId === id}
                      onChange={() => setKeepId(id)}
                      className="accent-violet-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{acc.name}</p>
                      <p className="text-xs text-gray-400">{acc.account_code}</p>
                    </div>
                    {keepId === id && (
                      <span className="text-xs text-violet-600 font-medium shrink-0">Conservar</span>
                    )}
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Esta operación no se puede deshacer directamente. La cuenta fusionada quedará marcada en el sistema.
            </p>
            {mergeError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {mergeError}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowMergeDialog(false)} disabled={isPendingMerge}>
              Cancelar
            </Button>
            <Button
              onClick={handleMerge}
              disabled={!keepId || isPendingMerge}
              className="gap-2 bg-violet-600 hover:bg-violet-700"
            >
              {isPendingMerge && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Fusionar y conservar seleccionada →
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
