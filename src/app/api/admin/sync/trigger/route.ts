import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  // Verificar que el usuario es admin/ops
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (!['admin', 'ops'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  // Llamar a la Edge Function (cuando esté disponible)
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Configuración de sync no disponible' }, { status: 503 })
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/sync-external-db`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ triggered_by: 'manual' }),
    })

    if (!res.ok) {
      const text = await res.text()
      // Si la función no existe aún, devolver mensaje amigable
      if (res.status === 404) {
        return NextResponse.json(
          { error: 'La Edge Function de sync aún no está desplegada. Próximamente disponible.' },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: `Error en sync: ${text}` }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'No se pudo conectar con el servicio de sync. Verifica la configuración.' },
      { status: 503 }
    )
  }
}
