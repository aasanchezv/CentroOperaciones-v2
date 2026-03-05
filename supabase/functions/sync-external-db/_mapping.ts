/**
 * _mapping.ts — Carga y aplica mapeos de campos y referencias
 *
 * sync_field_mappings:  columna externa  → campo local + allow_override + transform
 * sync_reference_maps:  valor externo    → valor local (agentes, ramos, status, etc.)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface FieldMapping {
  id:            string
  externalField: string
  localField:    string
  allowOverride: boolean
  transform:     Record<string, string> | null
}

/** fieldMaps['policy'] = [{ externalField: 'POLIZA_ID', localField: 'external_id', ... }, ...] */
export type EntityFieldMaps = Record<string, FieldMapping[]>

/** refMaps['branch']['GMM'] = 'gmm' */
export type ReferenceMaps = Record<string, Record<string, string>>

export interface SyncErrorRecord {
  entity_type:   string
  external_id:   string | null
  error_type:    'upsert_failed' | 'unresolved_reference' | 'validation'
  error_message: string
  raw_data?:     Record<string, unknown>
}

export interface SyncResult {
  count:  number
  errors: SyncErrorRecord[]
}

// ─── Loaders ──────────────────────────────────────────────────────────────────

export async function loadFieldMaps(supabase: SupabaseClient): Promise<EntityFieldMaps> {
  const { data, error } = await supabase
    .from('sync_field_mappings')
    .select('id, entity_type, external_field, local_field, allow_override, transform')
    .eq('is_active', true)

  if (error) throw new Error(`Error cargando sync_field_mappings: ${error.message}`)

  const maps: EntityFieldMaps = {}
  for (const row of (data ?? [])) {
    const entity = row.entity_type as string
    if (!maps[entity]) maps[entity] = []
    maps[entity].push({
      id:            row.id,
      externalField: row.external_field,
      localField:    row.local_field,
      allowOverride: row.allow_override ?? false,
      transform:     row.transform ?? null,
    })
  }
  return maps
}

export async function loadRefMaps(supabase: SupabaseClient): Promise<ReferenceMaps> {
  const { data, error } = await supabase
    .from('sync_reference_maps')
    .select('map_type, external_value, local_value')
    .eq('is_active', true)

  if (error) throw new Error(`Error cargando sync_reference_maps: ${error.message}`)

  const maps: ReferenceMaps = {}
  for (const row of (data ?? [])) {
    const mapType = row.map_type as string
    if (!maps[mapType]) maps[mapType] = {}
    maps[mapType][row.external_value] = row.local_value
  }
  return maps
}

// ─── Resolución de valores ─────────────────────────────────────────────────────

/**
 * Traduce un valor externo al valor local usando sync_reference_maps.
 * Retorna undefined si no se encontró traducción.
 */
export function resolveRef(
  mapType: string,
  externalValue: unknown,
  refMaps: ReferenceMaps
): string | undefined {
  if (externalValue === null || externalValue === undefined) return undefined
  const strVal = String(externalValue).trim().toUpperCase()
  const bucket = refMaps[mapType]
  if (!bucket) return undefined
  // Búsqueda exacta
  if (bucket[strVal] !== undefined) return bucket[strVal]
  // Búsqueda case-insensitive adicional
  for (const key of Object.keys(bucket)) {
    if (key.toUpperCase() === strVal) return bucket[key]
  }
  return undefined
}

/**
 * Aplica la lógica de allow_override:
 * - false: COALESCE — solo escribe si localValue es null/undefined
 * - true:  siempre escribe el nuevo valor
 */
export function applyOverride(
  existingValue: unknown,
  newValue: unknown,
  allowOverride: boolean
): unknown {
  if (allowOverride) return newValue
  // COALESCE: conserva el valor local si ya existe
  if (existingValue !== null && existingValue !== undefined && existingValue !== '') {
    return existingValue
  }
  return newValue
}

/**
 * Aplica las transformaciones de enum definidas en `transform` del FieldMapping.
 * Ej: transform = {"GMM":"gmm","AUTOS":"auto"} y el valor es "GMM" → "gmm"
 */
export function applyTransform(
  value: unknown,
  transform: Record<string, string> | null
): unknown {
  if (!transform || value === null || value === undefined) return value
  const strVal = String(value).trim().toUpperCase()
  // Búsqueda exacta
  if (transform[strVal] !== undefined) return transform[strVal]
  // Búsqueda case-insensitive
  for (const key of Object.keys(transform)) {
    if (key.toUpperCase() === strVal) return transform[key]
  }
  return value
}

// ─── Mapeo de una fila ─────────────────────────────────────────────────────────

export interface MapRowResult {
  mapped:   Record<string, unknown>
  extId:    string | null
  warnings: SyncErrorRecord[]
}

/**
 * Transforma una fila de la BD externa en el objeto listo para upsert en Supabase.
 * - Aplica transforms de enum
 * - Aplica resolución de referencias (mapType configurado en transform como "__ref:mapType")
 *
 * Convención especial en sync_field_mappings.transform:
 *   { "__ref": "branch" }   → usar resolveRef('branch', value, refMaps)
 *   { "__ref": "status" }   → usar resolveRef('status', value, refMaps)
 *   { "__ref": "agent" }    → usar resolveRef('agent', value, refMaps)
 *   { "KEY": "val", ... }  → mapeo de enum directo
 */
export function mapRow(
  extRow: Record<string, unknown>,
  entityMaps: FieldMapping[],
  refMaps: ReferenceMaps,
  entityType: string
): MapRowResult {
  const mapped: Record<string, unknown> = {}
  const warnings: SyncErrorRecord[] = []
  let extId: string | null = null

  for (const fm of entityMaps) {
    // Buscar el campo externo (case-insensitive)
    const rawValue = getFieldCaseInsensitive(extRow, fm.externalField)

    if (rawValue === undefined) continue // Campo no existe en la fila — omitir

    let value: unknown = rawValue

    // Aplicar transformación
    if (fm.transform) {
      const refType   = (fm.transform as Record<string, string>)['__ref']
      const normalize = (fm.transform as Record<string, unknown>)['__normalize']
      if (refType) {
        // Resolución de referencia
        const resolved = resolveRef(refType, value, refMaps)
        if (resolved === undefined && value !== null && value !== undefined && value !== '') {
          warnings.push({
            entity_type:   entityType,
            external_id:   null,
            error_type:    'unresolved_reference',
            error_message: `No se encontró mapeo para ${refType}="${value}". Ve a Admin → Sincronización → Mapeos para resolver.`,
            raw_data:      { field: fm.externalField, value },
          })
          // No asignar el campo para no romper el registro
          continue
        }
        value = resolved ?? null
      } else if (normalize === true) {
        // Normalizar: trim + uppercase (para usar como clave de deduplicación)
        value = typeof value === 'string' ? value.trim().toUpperCase() : value
      } else {
        // Mapeo de enum directo
        value = applyTransform(value, fm.transform)
      }
    }

    // Guardar extId para referencia en errores
    if (fm.localField === 'external_id' && value !== null && value !== undefined) {
      extId = String(value)
    }

    mapped[fm.localField] = value
  }

  // Actualizar external_id en warnings ahora que lo tenemos
  if (extId) {
    for (const w of warnings) w.external_id = extId
  }

  return { mapped, extId, warnings }
}

function getFieldCaseInsensitive(
  row: Record<string, unknown>,
  fieldName: string
): unknown {
  if (fieldName in row) return row[fieldName]
  const lower = fieldName.toLowerCase()
  const upper = fieldName.toUpperCase()
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lower || key.toUpperCase() === upper) return row[key]
  }
  return undefined
}

// ─── Validación de mapeos mínimos requeridos ──────────────────────────────────

export function validateMapsPresent(
  fieldMaps: EntityFieldMaps,
  requiredEntities: string[] = ['account', 'policy']
): void {
  for (const entity of requiredEntities) {
    if (!fieldMaps[entity] || fieldMaps[entity].length === 0) {
      throw new Error(
        `Sin mapeo de campos para "${entity}". Ve a Admin → Sincronización → Configuración para agregar los mapeos de columnas.`
      )
    }
    const hasExternalId = fieldMaps[entity].some(m => m.localField === 'external_id')
    if (!hasExternalId) {
      throw new Error(
        `El mapeo de "${entity}" debe incluir un campo que mapee a "external_id". Agrega el mapeo del ID externo primero.`
      )
    }
  }
}
