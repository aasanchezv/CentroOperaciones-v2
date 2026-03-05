'use client'

import { useState, useTransition } from 'react'
import { updateTeamSettings } from '@/app/actions/admin-actions'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import { Label }   from '@/components/ui/label'
import { Settings, Loader2, Save } from 'lucide-react'

interface Props {
  teamId:     string
  teamName:   string
  emailCc:    string | null
  vipEmailCc: string | null
}

export function TeamSettingsDialog({ teamId, teamName, emailCc, vipEmailCc }: Props) {
  const [open, setOpen]       = useState(false)
  const [cc,   setCc]         = useState(emailCc ?? '')
  const [vip,  setVip]        = useState(vipEmailCc ?? '')
  const [msg,  setMsg]        = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setMsg(null)
    startTransition(async () => {
      const res = await updateTeamSettings(teamId, {
        email_cc:     cc.trim()  || null,
        vip_email_cc: vip.trim() || null,
      })
      if ('error' in res) {
        setMsg({ ok: false, text: res.error })
      } else {
        setMsg({ ok: true, text: '✓ Guardado' })
        setTimeout(() => { setMsg(null); setOpen(false) }, 1500)
      }
    })
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-400 hover:text-blue-500"
        title="Configuración del equipo"
        onClick={() => setOpen(true)}
      >
        <Settings className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
      <div
        className="bg-white rounded-xl shadow-xl border w-full max-w-sm p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Config. {teamName}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Correos CC para los envíos automáticos de este equipo.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">CC global (todos los correos)</Label>
            <Input
              type="email"
              value={cc}
              onChange={e => setCc(e.target.value)}
              placeholder="operaciones@murguia.com"
              className="h-8 text-sm"
            />
            <p className="text-[11px] text-gray-400">Se agrega como copia en todos los correos salientes de este equipo.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">CC adicional clientes VIP</Label>
            <Input
              type="email"
              value={vip}
              onChange={e => setVip(e.target.value)}
              placeholder="gerencia@murguia.com"
              className="h-8 text-sm"
            />
            <p className="text-[11px] text-gray-400">Copia extra cuando el cliente tiene el flag VIP activo.</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div>
            {msg && (
              <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{msg.text}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-1.5">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
