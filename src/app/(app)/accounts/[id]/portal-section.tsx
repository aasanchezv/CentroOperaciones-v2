'use client'

import { useState }                from 'react'
import { Globe, Copy, Check, RefreshCw, EyeOff, Eye, ExternalLink, Bot } from 'lucide-react'
import {
  generatePortalToken,
  togglePortalEnabled,
  revokeAndRegeneratePortalToken,
} from '@/app/actions/portal-actions'
import {
  assignPortalAIAgent,
  type getPortalAgents,
} from '@/app/actions/activity-actions'

type PortalAgent = Awaited<ReturnType<typeof getPortalAgents>>[number]

interface Props {
  accountId:              string
  initialToken:           string | null
  initialEnabled:         boolean
  initialLastAccessed:    string | null
  canManageAI?:           boolean
  portalAgents?:          PortalAgent[]
  initialAgentId?:        string | null
  isOpsOrAbove?:          boolean
}

function relativeTime(iso: string | null) {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Hace menos de 1 hora'
  if (hours < 24) return `Hace ${hours} hora${hours !== 1 ? 's' : ''}`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Hace ${days} día${days !== 1 ? 's' : ''}`
  const months = Math.floor(days / 30)
  return `Hace ${months} mes${months !== 1 ? 'es' : ''}`
}

export function PortalSection({
  accountId,
  initialToken,
  initialEnabled,
  initialLastAccessed,
  canManageAI = false,
  portalAgents = [],
  initialAgentId = null,
}: Props) {
  const [token,       setToken]       = useState(initialToken)
  const [enabled,     setEnabled]     = useState(initialEnabled)
  const [lastAccessed] = useState(initialLastAccessed)
  const [copied,      setCopied]      = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [agentId,     setAgentId]     = useState<string | null>(initialAgentId)
  const [aiSaving,    setAiSaving]    = useState(false)
  const [aiError,     setAiError]     = useState<string | null>(null)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://mc2core.vercel.app'
  const portalUrl = token ? `${baseUrl}/portal/${token}` : null

  async function handleGenerate() {
    setLoading(true); setError(null)
    const res = await generatePortalToken(accountId)
    if (res.error) { setError(res.error); setLoading(false); return }
    setToken(res.token ?? null)
    setEnabled(true)
    setLoading(false)
  }

  async function handleToggle() {
    setLoading(true); setError(null)
    const res = await togglePortalEnabled(accountId, !enabled)
    if (res.error) { setError(res.error); setLoading(false); return }
    setEnabled(v => !v)
    setLoading(false)
  }

  async function handleRegenerate() {
    if (!confirm('¿Regenerar el link? El link anterior dejará de funcionar.')) return
    setLoading(true); setError(null)
    const res = await revokeAndRegeneratePortalToken(accountId)
    if (res.error) { setError(res.error); setLoading(false); return }
    setToken(res.token ?? null)
    setEnabled(true)
    setLoading(false)
  }

  function handleCopy() {
    if (!portalUrl) return
    navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">Portal del Cliente</h2>
      </div>

      {!token ? (
        /* Sin token generado */
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Genera un link único y seguro para que tu cliente vea sus pólizas, pagos, gestiones y siniestros.
          </p>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <Globe className="h-3.5 w-3.5" />
            {loading ? 'Generando…' : 'Generar portal del cliente'}
          </button>
        </div>
      ) : (
        /* Token generado */
        <div className="space-y-3">
          {/* Status row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-600 font-medium">
                {enabled ? 'Activo' : 'Desactivado'}
              </span>
            </div>
            <button
              onClick={handleToggle}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              {enabled
                ? <><EyeOff className="h-3 w-3" /> Desactivar</>
                : <><Eye    className="h-3 w-3" /> Activar</>
              }
            </button>
          </div>

          {/* URL */}
          {portalUrl && enabled && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-600 font-mono truncate">{portalUrl}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleCopy}
                  className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Copiar link"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Abrir portal"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Last accessed */}
          {lastAccessed && (
            <p className="text-[11px] text-gray-400">
              Último acceso: {relativeTime(lastAccessed)}
            </p>
          )}

          {/* Regenerate */}
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" />
            Regenerar link
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {/* Agente IA — solo visible para admin/ops cuando hay portal generado */}
      {canManageAI && token && portalAgents.length > 0 && (
        <div className="mt-4 pt-4 border-t space-y-2">
          <div className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-700">Agente IA en el portal</span>
          </div>
          <p className="text-xs text-gray-400">
            El agente responderá automáticamente a los mensajes del cliente usando la información de sus pólizas.
          </p>
          <div className="flex items-center gap-2">
            <select
              value={agentId ?? ''}
              onChange={async e => {
                const newId = e.target.value || null
                setAgentId(newId)
                setAiSaving(true)
                setAiError(null)
                const res = await assignPortalAIAgent(accountId, newId)
                setAiSaving(false)
                if (res.error) { setAiError(res.error); setAgentId(agentId) }
              }}
              disabled={aiSaving}
              className="flex-1 text-xs border rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:opacity-50"
            >
              <option value="">Sin agente IA</option>
              {portalAgents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.persona_name ?? a.tool_name}
                </option>
              ))}
            </select>
            {agentId && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                <Bot className="h-3 w-3" /> Activo
              </span>
            )}
          </div>
          {aiSaving  && <p className="text-[11px] text-gray-400">Guardando…</p>}
          {aiError   && <p className="text-[11px] text-red-500">{aiError}</p>}
        </div>
      )}
    </div>
  )
}
