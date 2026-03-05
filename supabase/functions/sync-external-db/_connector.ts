/**
 * _connector.ts — Configuración y conexión a la BD externa
 *
 * Lee los parámetros de conexión desde app_settings y la contraseña
 * desde el Supabase Secret SYNC_EXTERNAL_DB_PASSWORD.
 */
import postgres from 'npm:postgres'

export interface ExtDbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean | 'require'
  // Nombres de tablas en la BD externa (configurables)
  accountsTable: string
  contactsTable: string
  policiesTable: string
  receiptsTable: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export async function loadExtDbConfig(supabase: SupabaseClient): Promise<ExtDbConfig> {
  const { data: rows, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .like('key', 'sync_%')

  if (error) throw new Error(`Error cargando app_settings: ${error.message}`)

  const s: Record<string, string> = {}
  for (const row of (rows ?? [])) {
    s[row.key] = row.value ?? ''
  }

  const password = Deno.env.get('SYNC_EXTERNAL_DB_PASSWORD') ?? ''

  const host     = s['sync_external_db_host']     ?? ''
  const database = s['sync_external_db_name']     ?? ''
  const user     = s['sync_external_db_user']     ?? ''

  if (!host || !database || !user) {
    throw new Error(
      'Conexión externa no configurada. Ve a Admin → Sincronización → Configuración para ingresar host, base de datos y usuario.'
    )
  }
  if (!password) {
    throw new Error(
      'Secret SYNC_EXTERNAL_DB_PASSWORD no configurado. Agrégalo en Supabase Dashboard → Edge Functions → Secrets.'
    )
  }

  return {
    host,
    port:          parseInt(s['sync_external_db_port'] ?? '5432', 10),
    database,
    user,
    password,
    ssl:           (s['sync_external_db_ssl'] ?? 'true') === 'true' ? 'require' : false,
    accountsTable: s['sync_external_accounts_table'] ?? 'clientes',
    contactsTable: s['sync_external_contacts_table'] ?? 'contactos',
    policiesTable: s['sync_external_policies_table'] ?? 'polizas',
    receiptsTable: s['sync_external_receipts_table'] ?? 'recibos',
  }
}

export type ExtDb = ReturnType<typeof postgres>

export function createExtDb(cfg: ExtDbConfig): ExtDb {
  return postgres({
    host:            cfg.host,
    port:            cfg.port,
    database:        cfg.database,
    username:        cfg.user,
    password:        cfg.password,
    ssl:             cfg.ssl,
    max:             3,
    idle_timeout:    20,
    connect_timeout: 15,
    // No transformar snake_case; usar los nombres originales de la BD externa
    transform:       postgres.camel,
  })
}
