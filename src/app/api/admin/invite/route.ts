import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types/database.types'

export async function POST(request: NextRequest) {
  // Verificar que quien llama es admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const body = await request.json()
  const { email, role } = body as { email: string; role: UserRole }

  if (!email || !role) {
    return NextResponse.json({ error: 'Email y rol requeridos' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Enviar invitación
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mc2core.vercel.app'}/auth/callback`,
    }
  )

  if (inviteError) {
    const msg = inviteError.message.includes('already registered')
      ? 'Este email ya tiene una cuenta'
      : inviteError.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // El trigger handle_new_user ya creó el profile con role='readonly'.
  // Actualizamos al rol deseado.
  if (inviteData.user) {
    await adminClient
      .from('profiles')
      .update({ role })
      .eq('id', inviteData.user.id)

    // Audit event
    await adminClient.from('audit_events').insert({
      actor_id: user.id,
      action: 'user.invited',
      entity_type: 'profile',
      entity_id: inviteData.user.id,
      payload: { email, role },
    })
  }

  return NextResponse.json({ ok: true })
}
