'use server'

import { revalidatePath } from 'next/cache'
import { createClient }   from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, EMAIL_FROM } from '@/lib/resend'
import { sanitizeFileName }   from '@/lib/storage'

// ─── Auth helper ──────────────────────────────────────────────

async function requireOperator() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!profile || profile.role === 'readonly') throw new Error('Acceso denegado')
  return { user, supabase, profile }
}

// ─── createProofUploadUrl ─────────────────────────────────────
/**
 * Genera una URL firmada de subida directa al bucket 'comprobantes'.
 * El browser sube el archivo directamente a Storage sin pasar por el servidor.
 */
export async function createProofUploadUrl(
  collectionSendId: string,
  fileName: string,
): Promise<{ token: string; path: string }> {
  const { user } = await requireOperator()
  const admin = createAdminClient()

  // Verificar que el collection_send existe
  const { data: send } = await admin
    .from('collection_sends')
    .select('id, policy_id')
    .eq('id', collectionSendId)
    .single()

  if (!send) throw new Error('Envío de cobranza no encontrado')

  const safeName = sanitizeFileName(fileName)
  const uid      = Math.random().toString(36).slice(2, 10)
  const path     = `${send.policy_id ?? user.id}/${collectionSendId}/${uid}-${safeName}`

  const { data, error } = await admin.storage
    .from('comprobantes')
    .createSignedUploadUrl(path)

  if (error || !data) throw new Error(error?.message ?? 'Error al generar URL de subida')

  return { token: data.token, path }
}

// ─── registerProof ────────────────────────────────────────────
/**
 * Registra el comprobante en la tabla payment_proofs y,
 * si hay un email de Mesa de Control configurado, lo envía ahí.
 */
export async function registerProof(
  collectionSendId: string,
  filePath:         string,
  fileName:         string,
  sizeBytes:        number,
  mimeType:         string,
): Promise<{ ok: boolean; sentToControl: boolean }> {
  const { user } = await requireOperator()
  const admin = createAdminClient()

  // Obtener policy_id del envío
  const { data: send } = await admin
    .from('collection_sends')
    .select('id, policy_id')
    .eq('id', collectionSendId)
    .single()

  if (!send) throw new Error('Envío de cobranza no encontrado')

  // Insertar payment_proof
  const { data: proof, error } = await admin
    .from('payment_proofs')
    .insert({
      collection_send_id: collectionSendId,
      policy_id:          send.policy_id,
      file_name:          fileName,
      file_path:          filePath,
      size_bytes:         sizeBytes,
      mime_type:          mimeType,
      sent_by:            user.id,
    })
    .select('id')
    .single()

  if (error || !proof) throw new Error(error?.message ?? 'Error al registrar comprobante')

  // Enviar a Mesa de Control si está configurado
  let sentToControl = false

  const { data: setting } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'mesa_control_email')
    .single()

  const mesaEmail = setting?.value?.trim()

  if (mesaEmail) {
    const { data: signedUrl } = await admin.storage
      .from('comprobantes')
      .createSignedUrl(filePath, 604800) // 7 días

    if (signedUrl?.signedUrl) {
      await resend.emails.send({
        from:    EMAIL_FROM,
        to:      mesaEmail,
        subject: `Comprobante de pago subido — ${fileName}`,
        text:    `Un ejecutivo ha subido un comprobante de pago.\n\nArchivo: ${fileName}\n\nDescargarlo aquí (válido 7 días):\n${signedUrl.signedUrl}`,
        html:    `<p>Un ejecutivo ha subido un comprobante de pago.</p><p><strong>Archivo:</strong> ${fileName}</p><p><a href="${signedUrl.signedUrl}">Descargar comprobante</a> (válido 7 días)</p>`,
      })

      await admin
        .from('payment_proofs')
        .update({ sent_to_control_at: new Date().toISOString() })
        .eq('id', proof.id)

      sentToControl = true
    }
  }

  revalidatePath('/cobranza')
  return { ok: true, sentToControl }
}

// ─── App Settings ─────────────────────────────────────────────

export async function getAppSetting(key: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single()
  return data?.value ?? null
}

export async function updateAppSetting(key: string, value: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Solo admin puede cambiar la configuración')

  const admin = createAdminClient()
  await admin.from('app_settings').upsert({
    key,
    value,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  })

  revalidatePath('/admin/cobranza')
}
