'use client'

import { useState, useTransition } from 'react'
import {
  Cpu, ChevronDown, ChevronUp, Save, AlertCircle, CheckCircle2,
  Eye, EyeOff, Play, Loader2, Key, History, Sparkles, Bot,
  Plus, Trash2, X,
} from 'lucide-react'
import { ALLOWED_MODELS } from '@/lib/ai-models'
import {
  updateToolConfig,
  saveApiKey,
  testModelCall,
  updateAgentPersona,
  createPortalAgent,
  deletePortalAgent,
} from '@/app/actions/ai-admin-actions'
import type {
  ToolConfig,
  UsageStats,
  ApiKeyStatus,
  ConfigHistoryRow,
  TestModelResult,
} from '@/app/actions/ai-admin-actions'

// ─── Helpers ─────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtUsd(n: number) {
  if (n < 0.01) return `$${(n * 100).toFixed(3)} ¢`
  return `$${n.toFixed(4)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Card de resumen ─────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-1">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ─── Botón de test de modelo ─────────────────────────────────

function TestModelButton({ toolId }: { toolId: string }) {
  const [result,  setResult]  = useState<TestModelResult | null>(null)
  const [pending, startTransition] = useTransition()

  function handleTest() {
    setResult(null)
    startTransition(async () => {
      const r = await testModelCall(toolId)
      setResult(r)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleTest}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {pending
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <Play className="h-3 w-3" />}
        {pending ? 'Probando…' : 'Probar'}
      </button>

      {result && (
        result.ok ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {result.latency_ms}ms · {result.input_tokens + result.output_tokens} tok
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-red-600 max-w-[200px] truncate" title={result.error}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {result.error ?? 'Error'}
          </span>
        )
      )}
    </div>
  )
}

// ─── Fila editable de configuración ─────────────────────────

function ModelConfigRow({ config }: { config: ToolConfig }) {
  const [model,     setModel]     = useState(config.model)
  const [maxTokens, setMaxTokens] = useState(config.max_tokens)
  const [enabled,   setEnabled]   = useState(config.is_enabled)
  const [status,    setStatus]    = useState<'idle' | 'saved' | 'error'>('idle')
  const [errMsg,    setErrMsg]    = useState('')
  const [pending,   startTransition] = useTransition()

  const isDirty = model !== config.model || maxTokens !== config.max_tokens || enabled !== config.is_enabled

  async function handleSave() {
    setStatus('idle')
    startTransition(async () => {
      const result = await updateToolConfig(config.tool_id, model, maxTokens, enabled)
      if ('error' in result) {
        setStatus('error')
        setErrMsg(result.error)
      } else {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 px-4">
        <p className="text-sm font-medium text-gray-900">{config.tool_name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {config.updater_name
            ? `Actualizado por ${config.updater_name} — ${fmtDate(config.updated_at)}`
            : `Creado ${fmtDate(config.updated_at)}`}
        </p>
      </td>
      <td className="py-3 px-4">
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          className="text-sm border rounded-md px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 w-full max-w-xs"
        >
          {ALLOWED_MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </td>
      <td className="py-3 px-4">
        <input
          type="number"
          min={256}
          max={8192}
          step={256}
          value={maxTokens}
          onChange={e => setMaxTokens(Number(e.target.value))}
          className="text-sm border rounded-md px-2 py-1.5 w-24 tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </td>
      <td className="py-3 px-4">
        <button
          type="button"
          onClick={() => setEnabled(v => !v)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            enabled ? 'bg-gray-900' : 'bg-gray-200'
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </td>
      <td className="py-3 px-4">
        <TestModelButton toolId={config.tool_id} />
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {status === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {errMsg}
            </span>
          )}
          {status === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Guardado
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || pending}
            className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="h-3 w-3" />
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Personalidad del Copiloto ───────────────────────────────

function PersonaConfigCard({ config }: { config: ToolConfig }) {
  const [personaName,  setPersonaName]  = useState(config.persona_name ?? 'Copiloto IA')
  const [systemPrompt, setSystemPrompt] = useState(config.system_prompt ?? '')
  const [status,       setStatus]       = useState<'idle' | 'saved' | 'error'>('idle')
  const [errMsg,       setErrMsg]       = useState('')
  const [pending,      startTransition] = useTransition()

  const isDirty =
    personaName   !== (config.persona_name  ?? 'Copiloto IA') ||
    systemPrompt  !== (config.system_prompt ?? '')

  function handleSave() {
    setStatus('idle')
    startTransition(async () => {
      const result = await updateAgentPersona(
        config.tool_id,
        personaName.trim() || 'Copiloto IA',
        systemPrompt.trim() || null,
      )
      if (result && 'error' in result) {
        setStatus('error')
        setErrMsg((result as { error: string }).error)
      } else {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  return (
    <div className="rounded-lg border bg-white p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-gray-800">Personalidad del Copiloto</h3>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">Nombre visible</label>
          <input
            type="text"
            maxLength={100}
            placeholder="Copiloto IA"
            value={personaName}
            onChange={e => setPersonaName(e.target.value)}
            className="w-full max-w-xs text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-xs text-gray-400">Nombre que verán los agentes en el chat flotante.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">
            Instrucciones personalizadas <span className="text-gray-400">(opcional)</span>
          </label>
          <textarea
            rows={4}
            maxLength={4000}
            placeholder={'Ej: "Sé muy proactivo. Al iniciar la app, saluda con un resumen de urgencias del día."'}
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            className="w-full text-sm border rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-xs text-gray-400">
            Se antepone al system prompt base de Murguía Seguros.
            {systemPrompt.length > 0 && (
              <span className="ml-1 text-gray-400">{systemPrompt.length}/4000</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || pending}
          className="flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {pending ? 'Guardando…' : 'Guardar identidad'}
        </button>

        {status === 'saved' && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Guardado
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {errMsg}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Agentes Portal ──────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `Eres un asistente amable y profesional de Seguros Murguía. Ayudas a los clientes con información sobre sus pólizas, recibos y siniestros. Siempre responde en español mexicano, de forma clara y concisa.

REGLAS:
- Solo responde usando la información del cliente proporcionada al inicio.
- No inventes datos sobre pólizas, montos ni fechas.
- Para trámites complejos, pagos o emergencias, indica al cliente que contacte directamente a su asesor.
- Sé conciso: máximo 3-4 oraciones por respuesta.`

interface CreateAgentDialogProps {
  onClose: () => void
  onCreated: (agent: ToolConfig) => void
}

function CreateAgentDialog({ onClose, onCreated }: CreateAgentDialogProps) {
  const [toolName,     setToolName]     = useState('')
  const [personaName,  setPersonaName]  = useState('')
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
  const [model,        setModel]        = useState<string>(ALLOWED_MODELS[ALLOWED_MODELS.length - 1]?.id ?? '')
  const [maxTokens,    setMaxTokens]    = useState(1024)
  const [error,        setError]        = useState('')
  const [pending,      startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await createPortalAgent({ toolName, personaName, systemPrompt, model, maxTokens })
      if ('error' in res) { setError(res.error); return }
      // Build a temporary ToolConfig so the parent can add it optimistically
      onCreated({
        id:           res.id,
        tool_id:      `portal_new_${res.id}`,
        tool_name:    toolName.trim(),
        model,
        max_tokens:   maxTokens,
        is_enabled:   true,
        updated_at:   new Date().toISOString(),
        updated_by:   null,
        updater_name: null,
        persona_name: personaName.trim(),
        system_prompt: systemPrompt.trim() || null,
        agent_type:   'portal',
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-900">Nuevo agente portal</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Nombre del agente</label>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="Asistente Murguía Premium"
                value={toolName}
                onChange={e => setToolName(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Nombre visible para el cliente</label>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="Asistente Murguía"
                value={personaName}
                onChange={e => setPersonaName(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Modelo</label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full text-sm border rounded-md px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {ALLOWED_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-500">Max tokens</label>
              <input
                type="number"
                min={256}
                max={8192}
                step={256}
                value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
                className="w-full text-sm border rounded-md px-3 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-gray-500">
              Instrucciones del agente
              <span className="ml-1 text-gray-400">{systemPrompt.length}/4000</span>
            </label>
            <textarea
              rows={6}
              maxLength={4000}
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="w-full text-xs border rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed"
            />
            <p className="text-xs text-gray-400">
              Se usará como system prompt. El contexto del cliente (pólizas, recibos, siniestros) se añade automáticamente.
            </p>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !toolName.trim() || !personaName.trim()}
              className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {pending ? 'Creando…' : 'Crear agente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PortalAgentsSection({ agents: initialAgents }: { agents: ToolConfig[] }) {
  const [agents,      setAgents]      = useState(initialAgents)
  const [showCreate,  setShowCreate]  = useState(false)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar el agente "${name}"? Se desasignará de todos los clientes.`)) return
    setDeletingId(id)
    setDeleteError(null)
    const res = await deletePortalAgent(id)
    setDeletingId(null)
    if ('error' in res) { setDeleteError(res.error); return }
    setAgents(prev => prev.filter(a => a.id !== id))
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Agentes Portal</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Nuevo agente
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Los agentes portal responden automáticamente a los clientes en el chat del portal usando la información de sus pólizas.
        Asigna un agente específico a cada cliente desde su ficha.
      </p>

      {agents.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-gray-50 p-6 text-center">
          <Bot className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Sin agentes portal configurados</p>
          <p className="text-xs text-gray-400 mt-0.5">Crea uno con el botón de arriba.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white divide-y">
          {agents.map(agent => (
            <div key={agent.id} className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 shrink-0 h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">{agent.tool_name}</p>
                  {agent.persona_name && agent.persona_name !== agent.tool_name && (
                    <span className="text-xs text-gray-400">→ {agent.persona_name}</span>
                  )}
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    agent.is_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {agent.is_enabled ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{agent.model}</p>
                {agent.system_prompt && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                    {agent.system_prompt}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDelete(agent.id, agent.tool_name)}
                disabled={deletingId === agent.id}
                className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 rounded-lg hover:bg-red-50"
                title="Eliminar agente"
              >
                {deletingId === agent.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteError && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {deleteError}
        </p>
      )}

      {showCreate && (
        <CreateAgentDialog
          onClose={() => setShowCreate(false)}
          onCreated={agent => setAgents(prev => [...prev, agent])}
        />
      )}
    </section>
  )
}

// ─── Sección Proveedor de API ─────────────────────────────────

interface ApiKeyCardProps {
  provider:    string
  label:       string
  initial:     ApiKeyStatus | null
}

function ApiKeyCard({ provider, label, initial }: ApiKeyCardProps) {
  const [keyValue,  setKeyValue]  = useState('')
  const [keyLabel,  setKeyLabel]  = useState(initial?.key_label ?? '')
  const [showKey,   setShowKey]   = useState(false)
  const [status,    setStatus]    = useState<'idle' | 'saved' | 'error'>('idle')
  const [errMsg,    setErrMsg]    = useState('')
  const [pending,   startTransition] = useTransition()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!keyValue.trim()) { setStatus('error'); setErrMsg('Ingresa el valor de la key'); return }
    setStatus('idle')
    startTransition(async () => {
      const result = await saveApiKey(provider, keyValue, keyLabel)
      if ('error' in result) {
        setStatus('error')
        setErrMsg(result.error)
      } else {
        setStatus('saved')
        setKeyValue('')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  return (
    <div className="rounded-lg border bg-white p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Key className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800">{label}</h3>
      </div>

      {/* Key actual mascarada */}
      {initial && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Key activa</p>
          <p className="font-mono text-xs text-gray-700 bg-gray-50 rounded px-3 py-2">
            {initial.masked_key || '(vacía)'}
          </p>
          {initial.key_label && (
            <p className="text-xs text-gray-400">Etiqueta: <span className="font-medium">{initial.key_label}</span></p>
          )}
          {initial.updated_at && (
            <p className="text-xs text-gray-400">
              Actualizada {fmtDate(initial.updated_at)}
              {initial.updated_by_name ? ` por ${initial.updated_by_name}` : ''}
            </p>
          )}
        </div>
      )}

      {!initial && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
          Sin key configurada en DB — usando variable de entorno como fallback.
        </p>
      )}

      {/* Formulario para actualizar */}
      <form onSubmit={handleSave} className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">Etiqueta</label>
          <input
            type="text"
            placeholder="ej: sk-ant consultas"
            value={keyLabel}
            onChange={e => setKeyLabel(e.target.value)}
            className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500">
            Nueva API Key <span className="text-gray-400">(deja vacío para mantener la actual)</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder="sk-ant-api03-..."
              value={keyValue}
              onChange={e => setKeyValue(e.target.value)}
              className="w-full text-sm border rounded-md px-3 py-2 pr-10 font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {pending ? 'Guardando…' : 'Actualizar key'}
          </button>

          {status === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Key actualizada
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {errMsg}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

// ─── Historial de cambios ─────────────────────────────────────

function historyBadgeClass(action: string): string {
  if (action === 'api_key.updated') return 'bg-emerald-100 text-emerald-700'
  return 'bg-blue-100 text-blue-700'
}

function parseHistoryChange(row: ConfigHistoryRow): string {
  const p = row.payload
  if (row.action === 'api_key.updated') {
    const lbl = p.key_label ? ` (${p.key_label})` : ''
    return `${p.provider ?? 'API'} key actualizada${lbl}`
  }
  if (row.action === 'ai_config.updated') {
    const parts: string[] = []
    if (p.model)        parts.push(`modelo: ${p.model}`)
    if (p.max_tokens)   parts.push(`max_tokens: ${p.max_tokens}`)
    if (p.is_enabled !== undefined) {
      parts.push(p.is_enabled ? 'habilitado' : 'deshabilitado')
    }
    return `${p.tool_id ?? 'herramienta'} — ${parts.join(', ')}`
  }
  return JSON.stringify(p)
}

// ─── Componente principal ────────────────────────────────────

interface Props {
  configs:      ToolConfig[]
  stats:        UsageStats
  anthropicKey: ApiKeyStatus | null
  history:      ConfigHistoryRow[]
}

export function IaAdminClient({ configs, stats, anthropicKey, history }: Props) {
  const [showUsers,   setShowUsers]   = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const { today, month, allTime, byTool, byUser } = stats

  const internalConfigs = configs.filter(c => c.agent_type !== 'portal')
  const portalConfigs   = configs.filter(c => c.agent_type === 'portal')

  return (
    <div className="p-6 space-y-8 max-w-5xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
          <Cpu className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Configuración IA</h1>
          <p className="text-sm text-gray-500">Proveedores, modelos y monitoreo de tokens</p>
        </div>
      </div>

      {/* ── Sección 0: Proveedores IA ────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Proveedores IA</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ApiKeyCard
            provider="anthropic"
            label="Anthropic (Claude)"
            initial={anthropicKey}
          />
        </div>
        <p className="text-xs text-gray-400">
          La key en DB sobreescribe la variable de entorno. Úsala para rotar keys sin hacer redeploy.
        </p>
      </section>

      {/* ── Sección 1: Config de modelos ────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Herramientas IA</h2>
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500">Herramienta</th>
                <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500">Modelo</th>
                <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500">Max tokens</th>
                <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500">Habilitado</th>
                <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500">Test</th>
                <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {internalConfigs.map(cfg => (
                <ModelConfigRow key={cfg.tool_id} config={cfg} />
              ))}
              {internalConfigs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-gray-400">
                    Sin herramientas configuradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400">
          Los cambios aplican de inmediato — sin redeploy necesario.
          El botón Probar valida la key y el modelo con una llamada mínima.
        </p>
      </section>

      {/* ── Sección 1b: Personalidad del Copiloto (agente) ───── */}
      {internalConfigs.filter(c => c.tool_id === 'agente').map(cfg => (
        <section key={cfg.tool_id} className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Copiloto IA</h2>
          <PersonaConfigCard config={cfg} />
        </section>
      ))}

      {/* ── Sección 1c: Agentes Portal ───────────────────────── */}
      <PortalAgentsSection agents={portalConfigs} />

      {/* ── Sección 2: Resumen de uso ────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Uso de tokens</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Tokens hoy"
            value={fmt(today.input_tokens + today.output_tokens)}
            sub={`${fmt(today.calls)} llamada${today.calls !== 1 ? 's' : ''}`}
          />
          <StatCard
            label="Costo estimado hoy"
            value={fmtUsd(today.cost_usd)}
            sub="USD"
          />
          <StatCard
            label="Tokens este mes"
            value={fmt(month.input_tokens + month.output_tokens)}
            sub={`${fmt(month.calls)} llamada${month.calls !== 1 ? 's' : ''}`}
          />
          <StatCard
            label="Costo estimado mes"
            value={fmtUsd(month.cost_usd)}
            sub="USD"
          />
        </div>

        {allTime.calls > 0 && (
          <p className="text-xs text-gray-400 pl-1">
            Total histórico: {fmt(allTime.input_tokens + allTime.output_tokens)} tokens
            ({fmt(allTime.calls)} llamadas) — est. {fmtUsd(allTime.cost_usd)} USD
          </p>
        )}
      </section>

      {/* ── Sección 3: Desglose por herramienta ─────────────── */}
      {byTool.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Desglose por herramienta</h2>
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500">Herramienta</th>
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500">Modelo activo</th>
                  <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500">Llamadas</th>
                  <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500">Input</th>
                  <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500">Output</th>
                  <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500">Costo est.</th>
                </tr>
              </thead>
              <tbody>
                {byTool.map(row => (
                  <tr key={row.tool_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{row.tool_id}</td>
                    <td className="py-3 px-4 text-sm text-gray-500 font-mono text-xs">{row.model}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-right tabular-nums">{fmt(row.calls)}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-right tabular-nums">{fmt(row.input_tokens)}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-right tabular-nums">{fmt(row.output_tokens)}</td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900 text-right tabular-nums">{fmtUsd(row.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Sección 4: Desglose por usuario (colapsible) ────── */}
      {byUser.length > 0 && (
        <section className="space-y-3">
          <button
            onClick={() => setShowUsers(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wider hover:text-gray-900"
          >
            {showUsers ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Desglose por usuario ({byUser.length})
          </button>
          {showUsers && (
            <div className="rounded-lg border bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="py-2.5 px-4 text-left text-xs font-medium text-gray-500">Usuario</th>
                    <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500">Llamadas</th>
                    <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500">Tokens totales</th>
                    <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500">Costo est.</th>
                    <th className="py-2.5 px-4 text-right text-xs font-medium text-gray-500">Última actividad</th>
                  </tr>
                </thead>
                <tbody>
                  {byUser.map(row => (
                    <tr key={row.user_id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-gray-900">{row.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{row.email}</p>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 text-right tabular-nums">{fmt(row.calls)}</td>
                      <td className="py-3 px-4 text-sm text-gray-700 text-right tabular-nums">{fmt(row.input_tokens + row.output_tokens)}</td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 text-right tabular-nums">{fmtUsd(row.cost_usd)}</td>
                      <td className="py-3 px-4 text-xs text-gray-400 text-right">{fmtDate(row.last_used)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Sección 5: Historial de cambios de config ────────── */}
      <section className="space-y-3">
        <button
          onClick={() => setShowHistory(v => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wider hover:text-gray-900"
        >
          <History className="h-3.5 w-3.5" />
          {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Historial de cambios
          {history.length > 0 && (
            <span className="ml-1 text-xs font-normal text-gray-400">({history.length})</span>
          )}
        </button>

        {showHistory && (
          history.length === 0 ? (
            <p className="text-sm text-gray-400 pl-1">Sin cambios registrados todavía.</p>
          ) : (
            <div className="rounded-lg border bg-white divide-y divide-gray-100">
              {history.map(row => (
                <div key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${historyBadgeClass(row.action)}`}>
                    {row.action === 'api_key.updated' ? 'API Key' : 'Modelo'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{parseHistoryChange(row)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fmtDateTime(row.created_at)}
                      {row.actor_name ? ` · ${row.actor_name}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {/* Empty state */}
      {byTool.length === 0 && byUser.length === 0 && (
        <div className="rounded-lg border border-dashed bg-gray-50 p-8 text-center">
          <Cpu className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Sin datos de uso todavía.</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Los registros aparecerán aquí en cuanto se procese el primer documento.
          </p>
        </div>
      )}
    </div>
  )
}
