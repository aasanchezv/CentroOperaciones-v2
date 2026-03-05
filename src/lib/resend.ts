import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY

if (!apiKey) {
  console.warn('[resend] RESEND_API_KEY no configurado — los emails no se enviarán')
}

export const resend = new Resend(apiKey || 're_12345678901234567890')

export const EMAIL_FROM = process.env.RESEND_EMAIL_FROM ?? 'Murguía Seguros <onboarding@resend.dev>'