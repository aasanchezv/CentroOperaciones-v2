// ─── Variables de plantillas de cobranza ──────────────────────
// Reemplaza variables conocidas en el cuerpo de un mensaje.
// NO usa eval — solo sustituye las vars definidas en CollectionVars.

export const BRANCH_LABELS: Record<string, string> = {
  gmm:        'Gastos Médicos',
  vida:       'Vida',
  auto:       'Autos',
  rc:         'Responsabilidad Civil',
  danos:      'Daños',
  transporte: 'Transporte',
  fianzas:    'Fianzas',
  ap:         'Accidentes Personales',
  tecnicos:   'Técnicos',
  otro:       'Otro',
}

export interface CollectionVars {
  // Campos base (requeridos)
  nombre:        string   // full_name del tomador
  monto:         string   // premium formateado en MXN
  numero_poliza: string   // policy_number o 'S/N'
  aseguradora:   string   // insurer
  vencimiento:   string   // end_date formateado dd MMM yyyy
  cuenta:        string   // account.name
  ejecutivo:     string   // full_name del ejecutivo que envía
  fecha_hoy:     string   // fecha actual formateada
  // Campos extendidos (opcionales)
  ramo?:              string   // ramo del seguro (GMM, Vida, Autos…)
  inicio_vigencia?:   string   // start_date formateado
  dias_vencimiento?:  string   // días hasta vencimiento o "X días vencida"
  telefono_cliente?:  string   // teléfono del tomador/contacto
  email_cliente?:     string   // correo del tomador/contacto
  conducto?:          string   // conducto de cobro (Domiciliado, Directo…)
}

export const COLLECTION_VAR_KEYS: (keyof CollectionVars)[] = [
  'nombre', 'telefono_cliente', 'email_cliente',
  'numero_poliza', 'aseguradora', 'ramo', 'inicio_vigencia', 'vencimiento', 'dias_vencimiento',
  'monto', 'conducto',
  'cuenta', 'ejecutivo', 'fecha_hoy',
]

export const COLLECTION_VAR_LABELS: Record<keyof CollectionVars, string> = {
  nombre:            'Nombre del tomador',
  monto:             'Prima / monto a cobrar',
  numero_poliza:     'Número de póliza',
  aseguradora:       'Aseguradora',
  vencimiento:       'Fecha de vencimiento',
  cuenta:            'Nombre de la cuenta',
  ejecutivo:         'Nombre del ejecutivo',
  fecha_hoy:         'Fecha de hoy',
  ramo:              'Ramo del seguro',
  inicio_vigencia:   'Fecha inicio de vigencia',
  dias_vencimiento:  'Días hasta vencimiento',
  telefono_cliente:  'Teléfono del cliente',
  email_cliente:     'Correo del cliente',
  conducto:          'Conducto de cobro',
}

// Grupos para el editor de plantillas
export const COLLECTION_VAR_GROUPS = [
  { label: 'Contacto',  color: 'indigo' as const, keys: ['nombre', 'telefono_cliente', 'email_cliente']                                                             as (keyof CollectionVars)[] },
  { label: 'Póliza',    color: 'blue'   as const, keys: ['numero_poliza', 'aseguradora', 'ramo', 'inicio_vigencia', 'vencimiento', 'dias_vencimiento']              as (keyof CollectionVars)[] },
  { label: 'Cobranza',  color: 'amber'  as const, keys: ['monto', 'conducto']                                                                                       as (keyof CollectionVars)[] },
  { label: 'Sistema',   color: 'gray'   as const, keys: ['cuenta', 'ejecutivo', 'fecha_hoy']                                                                        as (keyof CollectionVars)[] },
]

/**
 * Reemplaza todas las variables conocidas en el template.
 * Las variables tienen la forma {nombre}, {monto}, etc.
 * Cualquier variable desconocida se deja sin cambios.
 */
export function renderTemplate(body: string, vars: Partial<CollectionVars>): string {
  let result = body
  for (const key of COLLECTION_VAR_KEYS) {
    result = result.replaceAll(`{${key}}`, vars[key] ?? '')
  }
  return result
}

// ─── Variables de plantillas de renovación ────────────────────

export interface RenewalVars {
  // Campos base (requeridos)
  nombre:         string   // full_name del tomador
  aseguradora:    string   // insurer de la póliza
  ejecutivo:      string   // full_name del ejecutivo
  fecha_hoy:      string   // fecha actual formateada
  numero_poliza:  string   // policy_number de la póliza actual
  vencimiento:    string   // end_date de la póliza actual
  prima_anterior: string   // premium formateado de la póliza actual
  prima_nueva:    string   // premium formateado de la nueva póliza
  nueva_poliza:   string   // policy_number de la nueva póliza
  // Campos extendidos (opcionales)
  ramo?:              string   // ramo del seguro
  cuenta?:            string   // nombre de la cuenta
  inicio_vigencia?:   string   // start_date de la póliza
  dias_vencimiento?:  string   // días hasta vencimiento
  telefono_cliente?:  string   // teléfono del tomador
  email_cliente?:     string   // correo del tomador
}

export const RENEWAL_VAR_KEYS: (keyof RenewalVars)[] = [
  'nombre', 'telefono_cliente', 'email_cliente',
  'numero_poliza', 'aseguradora', 'ramo', 'inicio_vigencia', 'vencimiento', 'dias_vencimiento', 'prima_anterior',
  'nueva_poliza', 'prima_nueva',
  'cuenta', 'ejecutivo', 'fecha_hoy',
]

export const RENEWAL_VAR_LABELS: Record<keyof RenewalVars, string> = {
  nombre:            'Nombre del tomador',
  aseguradora:       'Aseguradora',
  ejecutivo:         'Nombre del ejecutivo',
  fecha_hoy:         'Fecha de hoy',
  numero_poliza:     'Número de póliza actual',
  vencimiento:       'Fecha de vencimiento',
  prima_anterior:    'Prima de la póliza anterior',
  prima_nueva:       'Prima de la nueva póliza',
  nueva_poliza:      'Número de la nueva póliza',
  ramo:              'Ramo del seguro',
  cuenta:            'Nombre de la cuenta',
  inicio_vigencia:   'Fecha inicio de vigencia',
  dias_vencimiento:  'Días hasta vencimiento',
  telefono_cliente:  'Teléfono del cliente',
  email_cliente:     'Correo del cliente',
}

// Grupos para el editor de plantillas
export const RENEWAL_VAR_GROUPS = [
  { label: 'Contacto',      color: 'indigo'  as const, keys: ['nombre', 'telefono_cliente', 'email_cliente']                                                                    as (keyof RenewalVars)[] },
  { label: 'Póliza actual', color: 'blue'    as const, keys: ['numero_poliza', 'aseguradora', 'ramo', 'inicio_vigencia', 'vencimiento', 'dias_vencimiento', 'prima_anterior']   as (keyof RenewalVars)[] },
  { label: 'Nueva póliza',  color: 'emerald' as const, keys: ['nueva_poliza', 'prima_nueva']                                                                                    as (keyof RenewalVars)[] },
  { label: 'Sistema',       color: 'gray'    as const, keys: ['cuenta', 'ejecutivo', 'fecha_hoy']                                                                               as (keyof RenewalVars)[] },
]

export function renderRenewalTemplate(body: string, vars: Partial<RenewalVars>): string {
  let result = body
  for (const key of RENEWAL_VAR_KEYS) {
    result = result.replaceAll(`{${key}}`, vars[key] ?? '')
  }
  return result
}

// ─── Helpers de formato ───────────────────────────────────────

export function formatMXN(amount: number | null | undefined): string {
  if (!amount) return '$0'
  return new Intl.NumberFormat('es-MX', {
    style:    'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  })
}

export function calcDaysUntil(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp   = new Date(isoDate + 'T12:00:00')
  const diff  = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0)   return `${Math.abs(diff)} días vencida`
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  return `${diff} días`
}
