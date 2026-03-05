// ─── Modelos disponibles (allowlist server-side) ─────────────
// Solo estos model IDs son aceptados en updateToolConfig().
// Nunca confiar en model IDs provenientes del cliente.

export const ALLOWED_MODELS = [
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5 — rápido y económico' },
  { id: 'claude-sonnet-4-6',         name: 'Sonnet 4.6 — equilibrado'       },
  { id: 'claude-opus-4-6',           name: 'Opus 4.6 — máxima precisión'    },
] as const

export type AllowedModelId = typeof ALLOWED_MODELS[number]['id']

export const ALLOWED_MODEL_IDS = ALLOWED_MODELS.map(m => m.id) as string[]

// ─── Precios (USD por millón de tokens) ──────────────────────
// Fuente: anthropic.com/pricing — actualizar si cambian tarifas.

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-haiku-4-5':          { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
}

/**
 * Estima el costo en USD de una llamada a la API de Anthropic.
 * Retorna 0 si el modelo no está en la tabla de precios.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return (inputTokens / 1_000_000) * pricing.input
       + (outputTokens / 1_000_000) * pricing.output
}
