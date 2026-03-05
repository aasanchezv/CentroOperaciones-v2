/**
 * Helpers de almacenamiento (Supabase Storage)
 */

/**
 * Limpia un nombre de archivo para usarlo como path en Storage.
 * Elimina acentos, espacios y caracteres especiales.
 */
export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // eliminar acentos
    .replace(/[^a-zA-Z0-9._-]/g, '_') // reemplazar caracteres especiales
    .replace(/_+/g, '_')               // colapsar múltiples guiones
    .slice(0, 100)
}
