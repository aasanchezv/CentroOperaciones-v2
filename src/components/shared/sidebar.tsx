'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Building2, LayoutDashboard, LogOut, ChevronRight, Contact, Layers3, RefreshCw, Upload, ClipboardList, ScanText, Cpu, CreditCard, Headphones, FileText, Landmark, BookOpen, DatabaseZap, History, UsersRound, ArrowLeftRight, ShieldAlert, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useTransition } from 'react'
import { setUserStatus, type UserStatus } from '@/app/actions/user-status-actions'

// ─── Status helpers ───────────────────────────────────────────

const statusDot: Record<string, string> = {
  online:  'bg-emerald-500',
  busy:    'bg-amber-400',
  offline: 'bg-gray-300',
}
const statusLabel: Record<string, string> = {
  online:  'En línea',
  busy:    'Ocupado',
  offline: 'Desconectado',
}

// ─── Nav definition ──────────────────────────────────────────

type NavSection = { section: true; label: string; adminOnly?: boolean; nonReadonly?: boolean }
type NavLink    = { section?: false; label: string; href: string; icon: React.ElementType; adminOnly?: boolean; adminOrOps?: boolean; nonReadonly?: boolean; moduleId?: string; notAgent?: boolean }
type NavEntry   = NavSection | NavLink

const navItems: NavEntry[] = [
  { label: 'Dashboard',            href: '/dashboard',          icon: LayoutDashboard },
  { label: 'Clientes',             section: true },
  { label: 'Clientes',             href: '/accounts',           icon: Building2 },
  { label: 'Contactos',            href: '/contacts',           icon: Contact },
  { label: 'Equipo en línea',      href: '/equipo',             icon: UsersRound,         nonReadonly: true, notAgent: true },
  { label: 'Operaciones',          section: true,                                         nonReadonly: true },
  { label: 'Renovaciones',         href: '/renovaciones',       icon: RefreshCw,          nonReadonly: true, moduleId: 'renovaciones' },
  { label: 'Cotizaciones',         href: '/cotizaciones',       icon: FileText,           nonReadonly: true, moduleId: 'cotizaciones' },
  { label: 'Cobranza',             href: '/cobranza',           icon: CreditCard,         nonReadonly: true, moduleId: 'cobranza'     },
  { label: 'Mis tareas',           href: '/tareas',             icon: ClipboardList,      nonReadonly: true, moduleId: 'tareas'       },
  { label: 'Agente de Captura',    href: '/captura',            icon: ScanText,           nonReadonly: true, moduleId: 'captura'      },
  { label: 'Contact Center',       href: '/contact-center',     icon: Headphones,         nonReadonly: true, moduleId: 'contact_center' },
  { label: 'Movimientos',          href: '/movimientos',        icon: ArrowLeftRight,     nonReadonly: true, moduleId: 'movimientos'    },
  { label: 'Go to Market',         href: '/go-to-market',       icon: Rocket,             nonReadonly: true },
  { label: 'Admin',                section: true,                                         adminOnly: true },
  { label: 'Usuarios',             href: '/admin/users',        icon: Users,              adminOnly: true },
  { label: 'Equipos',              href: '/admin/teams',        icon: Layers3,            adminOnly: true },
  { label: 'Importar',             href: '/admin/imports',      icon: Upload,             adminOnly: true },
  { label: 'Config. Renovaciones', href: '/admin/renovaciones', icon: RefreshCw,          adminOnly: true },
  { label: 'Config. Cotizaciones', href: '/admin/cotizaciones', icon: FileText,           adminOnly: true },
  { label: 'Config. IA',           href: '/admin/ia',           icon: Cpu,                adminOnly: true },
  { label: 'Config. Cobranza',     href: '/admin/cobranza',     icon: CreditCard,         adminOnly: true },
  { label: 'Reglas de pólizas',    href: '/admin/polizas',      icon: BookOpen,            adminOnly: true },
  { label: 'Plantillas',           href: '/admin/plantillas',   icon: BookOpen,            adminOnly: true },
  { label: 'Aseguradoras',         href: '/admin/aseguradoras', icon: Landmark,            adminOnly: true },
  { label: 'Sincronización',       href: '/admin/sync',         icon: DatabaseZap,         adminOnly: true },
  { label: 'Config. Movimientos',  href: '/admin/movimientos',  icon: ArrowLeftRight,      adminOnly: true },
  { label: 'Siniestros',           href: '/admin/siniestros',   icon: ShieldAlert,         adminOnly: true },
  { label: 'Config. GTM',          href: '/admin/go-to-market', icon: Rocket,              adminOnly: true },
  { label: 'Bitácora de cambios', href: '/admin/cambios',      icon: History,             adminOrOps: true },
]

// ─── Component ───────────────────────────────────────────────

interface SidebarProps {
  userEmail?: string
  userInitial?: string
  userRole?: string
  userStatus?: string
  unreadCcCount?: number
  teamSkills?: string[]
}

export function Sidebar({ userEmail, userInitial, userRole = 'readonly', userStatus = 'offline', unreadCcCount = 0, teamSkills = [] }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const [liveUnread, setLiveUnread]         = useState(unreadCcCount)
  const [status, setStatus]                 = useState<UserStatus>(userStatus as UserStatus)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [, startTransition]                 = useTransition()

  // Actualizar badge en tiempo real
  useEffect(() => {
    setLiveUnread(unreadCcCount)
  }, [unreadCcCount])

  useEffect(() => {
    if (userRole === 'readonly') return
    // Debounce de 2s para evitar renders por cada INSERT/UPDATE en conversations
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const fetchUnread = () => {
      supabase
        .from('conversations')
        .select('unread_count')
        .neq('status', 'resolved')
        .gt('unread_count', 0)
        .then(({ data }) => {
          setLiveUnread((data ?? []).reduce((acc, r) => acc + (r.unread_count ?? 0), 0))
        })
    }
    const ch = supabase
      .channel('sidebar-cc-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(fetchUnread, 2000)
        }
      )
      .subscribe()
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(ch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole])

  const isAdmin    = userRole === 'admin'
  const isReadonly = userRole === 'readonly'
  const isAgent    = userRole === 'agent'
  const isOps      = userRole === 'ops'

  const hasSkillsFilter = isAgent && teamSkills.length > 0

  const visibleItems = navItems.filter(item => {
    if (item.adminOnly   && !isAdmin)              return false
    if ('adminOrOps' in item && item.adminOrOps && !isAdmin && !isOps) return false
    if (item.nonReadonly && isReadonly) return false
    if ('notAgent' in item && item.notAgent && isAgent) return false
    if (hasSkillsFilter && !('section' in item && item.section)) {
      const navItem = item as NavLink
      if (navItem.moduleId && !teamSkills.includes(navItem.moduleId)) return false
    }
    return true
  })

  function handleStatusChange(newStatus: UserStatus) {
    setStatus(newStatus)
    setShowStatusMenu(false)
    startTransition(() => {
      setUserStatus(newStatus)
    })
  }

  async function handleSignOut() {
    await setUserStatus('offline')
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Murguía" className="h-11 w-auto" />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {visibleItems.map((item, i) => {
          if ('section' in item && item.section) {
            return (
              <p key={i} className="px-2 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-300">
                {item.label}
              </p>
            )
          }

          const navItem = item as NavLink
          const Icon = navItem.icon
          const isActive = pathname === navItem.href || pathname.startsWith(navItem.href + '/')

          const showBadge = navItem.href === '/contact-center' && liveUnread > 0

          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              className={cn(
                'group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-all',
                isActive
                  ? 'bg-gray-900 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" />
                {navItem.label}
              </span>
              {showBadge && (
                <span className="bg-red-500 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                  {liveUnread > 99 ? '99+' : liveUnread}
                </span>
              )}
              {isActive && !showBadge && <ChevronRight className="h-3 w-3 opacity-50" />}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t p-2">
        {/* Avatar + email */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1">
          <div className="relative shrink-0">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-xs font-semibold text-white">
              {userInitial ?? '?'}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${statusDot[status]}`} />
          </div>
          <p className="text-xs text-gray-500 truncate flex-1">{userEmail ?? ''}</p>
        </div>

        {/* Status selector */}
        {userRole !== 'readonly' && (
          <div className="relative mb-0.5">
            <button
              onClick={() => setShowStatusMenu(v => !v)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot[status]}`} />
              <span>{statusLabel[status]}</span>
              <ChevronRight className="h-3 w-3 ml-auto rotate-90 opacity-50" />
            </button>
            {showStatusMenu && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border rounded-lg shadow-lg py-1 w-40 z-50">
                {(['online', 'busy', 'offline'] as UserStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors',
                      status === s ? 'text-gray-900 font-medium' : 'text-gray-600'
                    )}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${statusDot[s]}`} />
                    {statusLabel[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Salir
        </button>
      </div>
    </aside>
  )
}
