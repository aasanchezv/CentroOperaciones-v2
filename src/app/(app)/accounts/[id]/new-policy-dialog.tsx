'use client'

import { useState, useRef } from 'react'
import { createPolicy } from '@/app/actions/policy-actions'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Loader2 } from 'lucide-react'
import type { Contact, PolicyBranch } from '@/types/database.types'

const branches: { value: PolicyBranch; label: string }[] = [
  { value: 'gmm',        label: 'Gastos Médicos Mayores' },
  { value: 'vida',       label: 'Vida' },
  { value: 'auto',       label: 'Autos' },
  { value: 'rc',         label: 'Responsabilidad Civil' },
  { value: 'danos',      label: 'Daños' },
  { value: 'transporte', label: 'Transportes' },
  { value: 'fianzas',    label: 'Fianzas' },
  { value: 'ap',         label: 'Accidentes Personales' },
  { value: 'tecnicos',   label: 'Riesgos Técnicos' },
  { value: 'otro',       label: 'Otro' },
]

interface CommissionCodeOption {
  id:           string
  insurer_name: string
  code:         string
  branch:       string | null
  rate_pct:     number | null
  rate_flat:    number | null
  description:  string | null
}

interface InsurerOption {
  id:         string
  name:       string
  short_name: string | null
}

interface Props {
  accountId:        string
  contacts:         Pick<Contact, 'id' | 'full_name' | 'position'>[]
  insurers?:        InsurerOption[]
  commissionCodes?: CommissionCodeOption[]
}

export function NewPolicyDialog({ accountId, contacts, insurers = [], commissionCodes = [] }: Props) {
  const [open,              setOpen]              = useState(false)
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const [selectedInsurerId, setSelectedInsurerId] = useState<string>('')
  const [selectedCodeId,    setSelectedCodeId]    = useState<string>('')
  const [premium,           setPremium]           = useState('')
  const [selectedBranch,    setSelectedBranch]    = useState<string>('')
  const formRef = useRef<HTMLFormElement>(null)

  const hasInsurers = insurers.length > 0

  // Códigos filtrados por aseguradora y ramo seleccionados
  const filteredCodes = commissionCodes.filter(c => {
    const selectedInsurerName = insurers.find(i => i.id === selectedInsurerId)?.name
    const insurerMatch = selectedInsurerId ? c.insurer_name === selectedInsurerName : true
    const branchMatch  = !c.branch || !selectedBranch || c.branch === selectedBranch
    return insurerMatch && branchMatch
  })

  // Comisión estimada
  const selectedCode = commissionCodes.find(c => c.id === selectedCodeId)
  const estimatedCommission = (() => {
    const p = Number(premium)
    if (!selectedCode || !p) return null
    if (selectedCode.rate_pct != null) return (p * selectedCode.rate_pct) / 100
    if (selectedCode.rate_flat != null) return selectedCode.rate_flat
    return null
  })()

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    // Si hay lista de aseguradoras, inyectar el nombre seleccionado
    if (hasInsurers && selectedInsurerId) {
      const ins = insurers.find(i => i.id === selectedInsurerId)
      if (ins) formData.set('insurer', ins.name)
    }
    try {
      const result = await createPolicy(accountId, formData)
      if (result && 'error' in result) {
        setError(result.error)
        return
      }
      setOpen(false)
      formRef.current?.reset()
      setSelectedInsurerId('')
      setSelectedCodeId('')
      setPremium('')
      setSelectedBranch('')
    } catch {
      setError('Error inesperado. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva póliza
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva póliza</DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={handleSubmit} className="space-y-4 mt-2">
          {/* Ramo + Aseguradora */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="branch">Ramo *</Label>
              <Select name="branch" required value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger id="branch">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map(b => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="insurer">Aseguradora *</Label>
              {hasInsurers ? (
                <>
                  <Select
                    value={selectedInsurerId}
                    onValueChange={v => { setSelectedInsurerId(v); setSelectedCodeId('') }}
                  >
                    <SelectTrigger id="insurer">
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {insurers.map(ins => (
                        <SelectItem key={ins.id} value={ins.id}>
                          {ins.name}{ins.short_name ? ` (${ins.short_name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Campo oculto — la acción lo leerá como 'insurer' */}
                  <input type="hidden" name="insurer" value={
                    insurers.find(i => i.id === selectedInsurerId)?.name ?? ''
                  } />
                </>
              ) : (
                <Input id="insurer" name="insurer" placeholder="GNP, AXA, Mapfre…" required />
              )}
            </div>
          </div>

          {/* Número de póliza + Estatus */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="policy_number">Número de póliza</Label>
              <Input id="policy_number" name="policy_number" placeholder="0000000000" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="status">Estatus</Label>
              <Select name="status" defaultValue="active">
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Vigente</SelectItem>
                  <SelectItem value="pending_renewal">Por renovar</SelectItem>
                  <SelectItem value="quote">Cotización</SelectItem>
                  <SelectItem value="expired">Vencida</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vigencia + Prima */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="start_date">Inicio</Label>
              <Input id="start_date" name="start_date" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end_date">Vencimiento</Label>
              <Input id="end_date" name="end_date" type="date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="premium">Prima anual</Label>
              <Input
                id="premium" name="premium" type="number" step="0.01" placeholder="0.00"
                value={premium} onChange={e => setPremium(e.target.value)}
              />
            </div>
          </div>

          {/* Frecuencia de pago */}
          <div className="space-y-1">
            <Label htmlFor="payment_frequency">Frecuencia de pago</Label>
            <Select name="payment_frequency" defaultValue="anual">
              <SelectTrigger id="payment_frequency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensual">Mensual</SelectItem>
                <SelectItem value="bimestral">Bimestral</SelectItem>
                <SelectItem value="trimestral">Trimestral</SelectItem>
                <SelectItem value="semestral">Semestral</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Código de comisión */}
          {commissionCodes.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="commission_code_id">Código de comisión</Label>
              <Select
                name="commission_code_id"
                value={selectedCodeId}
                onValueChange={setSelectedCodeId}
              >
                <SelectTrigger id="commission_code_id">
                  <SelectValue placeholder="Sin código asignado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin código</SelectItem>
                  {filteredCodes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code}
                      {c.rate_pct != null ? ` · ${c.rate_pct}%` : ''}
                      {c.branch ? ` · ${c.branch.toUpperCase()}` : ''}
                      {c.description ? ` — ${c.description}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {estimatedCommission != null && (
                <p className="text-xs text-emerald-700 font-medium">
                  Comisión estimada:{' '}
                  {new Intl.NumberFormat('es-MX', {
                    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
                  }).format(estimatedCommission)}
                  {selectedCode?.rate_pct != null && ` (${selectedCode.rate_pct}% de prima)`}
                </p>
              )}
            </div>
          )}

          {/* Tomador */}
          {contacts.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="tomador_id">Tomador / decisor</Label>
              <Select name="tomador_id">
                <SelectTrigger id="tomador_id">
                  <SelectValue placeholder="Sin tomador asignado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin tomador</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}{c.position ? ` — ${c.position}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* URL de la póliza */}
          <div className="space-y-1">
            <Label htmlFor="policy_url">URL de la póliza</Label>
            <Input id="policy_url" name="policy_url" type="url" placeholder="https://…" />
          </div>

          {/* Notas */}
          <div className="space-y-1">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Coberturas, endosos, observaciones…" />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || (hasInsurers && !selectedInsurerId)}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar póliza
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
