import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('[resend] RESEND_API_KEY no configurado — los emails no se enviarán')
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? 're_placeholder')

// Para producción: verificar murguia.com en resend.com → Domains
// y cambiar a: 'Renovaciones Murguía <renovaciones@murguia.com>'
export const EMAIL_FROM = process.env.RESEND_EMAIL_FROM ?? 'Murguía Seguros <onboarding@resend.dev>'
