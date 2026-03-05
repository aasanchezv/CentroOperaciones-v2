'use client'

import { useState, useTransition } from 'react'
import {
  Plus, Pencil, Trash2, Play, RefreshCw,
  CheckCircle2, AlertCircle, ToggleLeft, ToggleRight,
  FileText, CreditCard, Zap, ChevronDown, ChevronUp, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  saveRule, deleteRule, toggleRule, evaluateRules,
  type PolicyBusinessRule, type SaveRuleInput, type EvaluateResult,
} from '@/app/actions/rules-actions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  initialRules: PolicyBusinessRule[]
  stages:       { id: string; name: string }[]
  teams:        { id: string; name: string }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  policy:  'Póliza',
  receipt: 'Recibo',
}

const ACTION_LABELS: Record<string, string> = {
  create_renewal:     'Crear renovación "Por iniciar"',
  set_cobranza_stage: 'Mover a etapa de cobranza',
  create_task:        'Crear tarea',
}

function ruleDescription(rule: PolicyBusinessRule): string {
  const entity = ENTITY_LABELS[rule.entity_type] ?? rule.entity_type
  let action = ACTION_LABELS[rule.action_type] ?? rule.action_type
  if (rule.action_type === 'set_cobranza_stage' && rule.action_config?.stage_name) {
    action = `Mover a etapa "${rule.action_config.stage_name}"`
  }
  return `${entity} · ${rule.trigger_days} días antes del vencimiento → ${action}`
}

const ENTITY_ICON: Record<string, React.ElementType> = {
  policy:  FileText,
  receipt: CreditCard,
}

const ENTITY_COLOR: Record<string, string> = {
  policy:  'text-blue-600 bg-blue-50',
  receipt: 'text-amber-600 bg-amber-50',
}

// ─── Form defaults ────────────────────────────────────────────────────────────

function emptyForm(): SaveRuleInput {
  return {
    name:           '',
    description:    '',
    entity_type:    'policy',
    trigger_days:   30,
    action_type:    'create_renewal',
    action_config:  {},
    is_active:      true,
    sort_order:     0,
    filter_team_id: null,
  }
}

function ruleToForm(rule: PolicyBusinessRule): SaveRuleInput {
  return {
    id:             rule.id,
    name:           rule.name,
    description:    rule.description ?? '',
    entity_type:    rule.entity_type,
    trigger_days:   rule.trigger_days,
    action_type:    rule.action_type,
    action_config:  rule.action_config,
    is_active:      rule.is_active,
    sort_order:     rule.sort_order,
    filter_team_id: rule.filter_team_id,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RulesClient({ initialRules, stages, teams }: Props) {
  const [rules, setRules]           = useState<PolicyBusinessRule[]>(initialRules)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm]             = useState<SaveRuleInput>(emptyForm())
  const [formError, setFormError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [evaluating, setEvaluating]   = useState(false)
  const [evalResult, setEvalResult]   = useState<EvaluateResult | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t.name]))

  // ── CRUD ──────────────────────────────────────────────────────────────────

  function openCreate() {
    setForm(emptyForm())
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(rule: PolicyBusinessRule) {
    setForm(ruleToForm(rule))
    setFormError(null)
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return }
    if (!form.trigger_days || form.trigger_days < 1) { setFormError('Los días deben ser ≥ 1'); return }
    if (form.entity_type === 'receipt' && form.action_type === 'set_cobranza_stage') {
      const sn = form.action_config?.stage_name as string | undefined
      if (!sn?.trim()) { setFormError('Selecciona una etapa de cobranza'); return }
    }

    startTransition(async () => {
      try {
        await saveRule(form)
        const updated = form.id
          ? rules.map(r => r.id === form.id ? { ...r, ...form } as PolicyBusinessRule : r)
          : [...rules, { ...form, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: null } as PolicyBusinessRule]
        setRules(updated.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)))
        setDialogOpen(false)
      } catch (e) {
        setFormError((e as Error).message)
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta regla?')) return
    startTransition(async () => {
      await deleteRule(id)
      setRules(prev => prev.filter(r => r.id !== id))
    })
  }

  function handleToggle(rule: PolicyBusinessRule) {
    startTransition(async () => {
      await toggleRule(rule.id, !rule.is_active)
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
    })
  }

  // ── Evaluate ──────────────────────────────────────────────────────────────

  async function handleEvaluate() {
    setEvaluating(true)
    setEvalResult(null)
    setDetailsOpen(false)
    try {
      const result = await evaluateRules()
      setEvalResult(result)
      if (result.details.length > 0) setDetailsOpen(true)
    } catch (e) {
      setEvalResult({ applied: 0, skipped: 0, errors: [(e as Error).message], details: [] })
    } finally {
      setEvaluating(false)
    }
  }

  // ── Form helpers ──────────────────────────────────────────────────────────

  function setField<K extends keyof SaveRuleInput>(field: K, value: SaveRuleInput[K]) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'entity_type') {
        if (value === 'policy') {
          next.action_type   = 'create_renewal'
          next.action_config = {}
        } else {
          next.action_type   = 'set_cobranza_stage'
          next.action_config = stages[0] ? { stage_name: stages[0].name } : {}
        }
      }
      return next
    })
    setFormError(null)
  }

  const activeCount = rules.filter(r => r.is_active).length
  const totalDetails = evalResult?.details.reduce((acc, d) => acc + d.items.length, 0) ?? 0

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{activeCount} activa{activeCount !== 1 ? 's' : ''}</span>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nueva regla
        </Button>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-gray-50 px-6 py-10 text-center">
          <Zap className="mx-auto h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm font-medium text-gray-500">Sin reglas configuradas</p>
          <p className="text-xs text-gray-400 mt-1">
            Crea la primera regla para automatizar renovaciones o cobranza
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => {
            const Icon  = ENTITY_ICON[rule.entity_type] ?? FileText
            const color = ENTITY_COLOR[rule.entity_type] ?? 'text-gray-600 bg-gray-50'
            const teamName = rule.filter_team_id ? teamsMap[rule.filter_team_id] : null
            return (
              <div
                key={rule.id}
                className={[
                  'rounded-xl border bg-white shadow-sm px-4 py-3.5',
                  !rule.is_active && 'opacity-50',
                ].filter(Boolean).join(' ')}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{rule.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{ruleDescription(rule)}</p>
                    {/* Team badge */}
                    <div className="flex items-center gap-2 mt-1">
                      {teamName ? (
                        <span className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                          <Users className="h-3 w-3" />
                          {teamName}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Todos los equipos</span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{rule.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggle(rule)}
                      disabled={isPending}
                      title={rule.is_active ? 'Desactivar' : 'Activar'}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      {rule.is_active
                        ? <ToggleRight className="h-4 w-4 text-emerald-500" />
                        : <ToggleLeft  className="h-4 w-4" />}
                    </button>

                    <button
                      onClick={() => openEdit(rule)}
                      title="Editar"
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(rule.id)}
                      disabled={isPending}
                      title="Eliminar"
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Evaluate button + result */}
      <div className="pt-2 space-y-3">
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleEvaluate}
          disabled={evaluating || activeCount === 0}
        >
          {evaluating
            ? <RefreshCw className="h-4 w-4 animate-spin" />
            : <Play        className="h-4 w-4" />}
          {evaluating ? 'Aplicando reglas…' : 'Aplicar reglas ahora'}
        </Button>

        {evalResult && (
          <div className={[
            'rounded-lg border text-sm',
            evalResult.errors.length > 0
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800',
          ].join(' ')}>
            {/* Summary row */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              {evalResult.errors.length > 0
                ? <AlertCircle  className="h-4 w-4 shrink-0" />
                : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              <p className="font-medium flex-1">
                {evalResult.applied} aplicada{evalResult.applied !== 1 ? 's' : ''}
                {' · '}
                {evalResult.skipped} omitida{evalResult.skipped !== 1 ? 's' : ''}
              </p>
              {totalDetails > 0 && (
                <button
                  onClick={() => setDetailsOpen(o => !o)}
                  className="flex items-center gap-1 text-xs font-medium underline underline-offset-2"
                >
                  {detailsOpen ? 'Ocultar' : 'Ver detalle'}
                  {detailsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}
            </div>

            {/* Errors */}
            {evalResult.errors.length > 0 && (
              <ul className="px-4 pb-2.5 text-xs text-amber-700 list-disc list-inside space-y-0.5">
                {evalResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}

            {/* Details */}
            {detailsOpen && evalResult.details.length > 0 && (
              <div className="border-t border-emerald-200 px-3 pb-3 pt-2.5 space-y-3">
                {evalResult.details.map((d, i) => (
                  <div key={i}>
                    <p className="text-xs font-semibold mb-1">{d.ruleName}</p>
                    <ul className="space-y-0.5">
                      {d.items.map((item, j) => (
                        <li key={j} className="text-xs text-emerald-700 flex items-start gap-1.5">
                          <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5 text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar regla' : 'Nueva regla'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nombre */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Nombre *</label>
              <input
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="Ej. Iniciar renovación"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            {/* Descripción */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Descripción (opcional)</label>
              <input
                value={form.description ?? ''}
                onChange={e => setField('description', e.target.value)}
                placeholder="Describe cuándo se aplica esta regla"
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            {/* Entidad */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Entidad</label>
              <div className="flex gap-2">
                {(['policy', 'receipt'] as const).map(et => (
                  <button
                    key={et}
                    onClick={() => setField('entity_type', et)}
                    className={[
                      'flex-1 rounded-lg border py-2 text-sm font-medium transition-colors',
                      form.entity_type === et
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-gray-600 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {ENTITY_LABELS[et]}
                  </button>
                ))}
              </div>
            </div>

            {/* Trigger days */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Umbral de días</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Cuando falten</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={form.trigger_days}
                  onChange={e => setField('trigger_days', parseInt(e.target.value) || 1)}
                  className="w-20 border rounded-lg px-3 py-2 text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                <span className="text-sm text-gray-500">días para el vencimiento</span>
              </div>
            </div>

            {/* Acción */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Acción</label>
              {form.entity_type === 'policy' ? (
                <div className="rounded-lg border bg-slate-50 px-3 py-2.5">
                  <p className="text-sm text-gray-700 font-medium">Crear renovación &quot;Por iniciar&quot;</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Se asigna al agente que creó la póliza
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Mover el recibo a la etapa:</p>
                  <select
                    value={(form.action_config?.stage_name as string) ?? ''}
                    onChange={e => setField('action_config', { stage_name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    <option value="">— Selecciona etapa —</option>
                    {stages.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">
                    Solo avanza etapa, nunca retrocede. Pólizas domiciliadas se excluyen.
                  </p>
                </div>
              )}
            </div>

            {/* Equipo */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Aplicar a</label>
              <select
                value={form.filter_team_id ?? ''}
                onChange={e => setField('filter_team_id', e.target.value || null)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="">Todos los equipos (global)</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400">
                Limita la regla a las cuentas del equipo seleccionado
              </p>
            </div>

            {/* Toggle activa */}
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setField('is_active', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
              </label>
              <span className="text-sm text-gray-600">Regla activa</span>
            </div>

            {/* Error */}
            {formError && (
              <div className="flex items-center gap-2 rounded-lg border bg-red-50 border-red-200 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Guardando…' : (form.id ? 'Guardar cambios' : 'Crear regla')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
