import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'


const ApiKey = process.env.ANTHROPIC_API_KEY;

if (!ApiKey) {
  console.warn('[anthropic] ANTHROPIC_API_KEY no configurado — la extracción IA no funcionará')
}

let _anthropicInstance: Anthropic | null = null;

export const anthropic = new Proxy({} as Anthropic, {
  get(target, prop, receiver) {
    if (!_anthropicInstance) {
      _anthropicInstance = new Anthropic({
        // Usamos || para que si es string vacío también use el placeholder válido
  apiKey: ApiKey ?? 'placeholder',
      });
    }
    return Reflect.get(_anthropicInstance, prop, receiver);
  }
});

// Modelo: Haiku 4.5 — rápido y preciso para extracción estructurada
export const CAPTURE_MODEL = 'claude-haiku-4-5-20251001'

/**
 * Devuelve un cliente Anthropic con la API key configurada desde la DB.
 * Si no hay key en DB (tabla api_keys), usa la variable de entorno como fallback.
 * Las rutas API deben usar esta función en vez del singleton `anthropic`.
 * Sin cache: Next.js serverless no mantiene estado entre invocaciones.
 */
export async function getAnthropicClient(): Promise<Anthropic> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('api_keys')
      .select('key_value')
      .eq('provider', 'anthropic')
      .eq('is_active', true)
      .single()
    if (data?.key_value) {
      return new Anthropic({ apiKey: data.key_value })
    }
  } catch {
    // Tabla aún no existe o sin registros → fallback a env var
  }
  return new Anthropic({ apiKey: ApiKey ?? 'placeholder' })
}
