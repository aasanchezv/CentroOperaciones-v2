import {
  RefreshCw,
  FileText,
  CreditCard,
  ClipboardList,
  ScanText,
  Headphones,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react'

export type ModuleId =
  | 'renovaciones'
  | 'cotizaciones'
  | 'cobranza'
  | 'tareas'
  | 'captura'
  | 'contact_center'
  | 'movimientos'

export interface ModuleDef {
  id:          ModuleId
  label:       string
  Icon:        LucideIcon
  href:        string
  bgClass:     string    // bg color para el ícono (Tailwind)
  iconClass:   string    // text color del ícono
  badgeClass:  string    // badge de status
  description: string
}

export const MODULE_CATALOG: ModuleDef[] = [
  {
    id:          'renovaciones',
    label:       'Renovaciones',
    Icon:        RefreshCw,
    href:        '/renovaciones',
    bgClass:     'bg-blue-50',
    iconClass:   'text-blue-500',
    badgeClass:  'bg-blue-100 text-blue-700',
    description: 'Gestión del ciclo de renovación de pólizas',
  },
  {
    id:          'cotizaciones',
    label:       'Cotizaciones',
    Icon:        FileText,
    href:        '/cotizaciones',
    bgClass:     'bg-violet-50',
    iconClass:   'text-violet-500',
    badgeClass:  'bg-violet-100 text-violet-700',
    description: 'Seguimiento de cotizaciones y propuestas',
  },
  {
    id:          'cobranza',
    label:       'Cobranza',
    Icon:        CreditCard,
    href:        '/cobranza',
    bgClass:     'bg-emerald-50',
    iconClass:   'text-emerald-500',
    badgeClass:  'bg-emerald-100 text-emerald-700',
    description: 'Envío de avisos de cobro y gestión de pagos',
  },
  {
    id:          'tareas',
    label:       'Mis Tareas',
    Icon:        ClipboardList,
    href:        '/tareas',
    bgClass:     'bg-amber-50',
    iconClass:   'text-amber-500',
    badgeClass:  'bg-amber-100 text-amber-700',
    description: 'Pendientes y seguimiento de actividades',
  },
  {
    id:          'captura',
    label:       'Captura IA',
    Icon:        ScanText,
    href:        '/captura',
    bgClass:     'bg-purple-50',
    iconClass:   'text-purple-500',
    badgeClass:  'bg-purple-100 text-purple-700',
    description: 'Extracción inteligente de datos de pólizas',
  },
  {
    id:          'contact_center',
    label:       'Contact Center',
    Icon:        Headphones,
    href:        '/contact-center',
    bgClass:     'bg-rose-50',
    iconClass:   'text-rose-500',
    badgeClass:  'bg-rose-100 text-rose-700',
    description: 'Bandeja omnicanal WA + Email + Teléfono',
  },
  {
    id:          'movimientos',
    label:       'Movimientos',
    Icon:        ArrowLeftRight,
    href:        '/movimientos',
    bgClass:     'bg-orange-50',
    iconClass:   'text-orange-500',
    badgeClass:  'bg-orange-100 text-orange-700',
    description: 'Altas, bajas y modificaciones de pólizas',
  },
]
