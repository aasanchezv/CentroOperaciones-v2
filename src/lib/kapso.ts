import { WhatsAppClient } from '@kapso/whatsapp-cloud-api'

const ApiKey = process.env.KAPSO_API_KEY;

if (!ApiKey) {
  console.warn('[kapso] KAPSO_API_KEY no configurado — WhatsApp no se enviará');
}

export const kapso = new WhatsAppClient({
  baseUrl:     'https://api.kapso.ai/meta/whatsapp',
  kapsoApiKey: ApiKey ?? 'placeholder',
})

const PHONE_NUMBER_ID = process.env.KAPSO_PHONE_NUMBER_ID ?? ''

/**
 * Envía un mensaje de texto simple por WhatsApp.
 * Retorna true si el envío fue exitoso.
 */
export type WAResult =
  | { ok: true }
  | { ok: false; code: 'no_api_key' | 'session_expired' | 'send_error'; message: string }

export async function sendWhatsApp(to: string, body: string): Promise<WAResult> {
  if (!ApiKey || ApiKey === 'placeholder') {
    console.warn('[kapso] Skipping WhatsApp — no API key configured')
    return { ok: false, code: 'no_api_key', message: 'KAPSO_API_KEY no configurado' }
  }
  // Normalizar a E.164: quitar +, espacios y guiones, luego agregar +
  const normalized = to.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')
  const e164 = `+${normalized}`
  try {
    await kapso.messages.sendText({ phoneNumberId: PHONE_NUMBER_ID, to: e164, body })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err)
    console.error('[kapso] Error sending WhatsApp:', msg)
    // Ventana de 24h expirada — el cliente debe escribir primero
    if (msg.includes('24-hour') || msg.includes('non-template')) {
      return { ok: false, code: 'session_expired', message: msg }
    }
    return { ok: false, code: 'send_error', message: msg }
  }
}
