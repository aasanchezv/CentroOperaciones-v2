/**
 * Utilidades para parseo y normalización de datos de siniestros.
 * Se usan tanto client-side (import wizard) como server-side (importClaims action).
 */

import type { ClaimColumnMapping, ParsedClaimRow } from '@/types/database.types'

// Normaliza número de póliza para comparación fuzzy
export function normalizePolicyNumber(s: string): string {
  return s.trim().toUpperCase().replace(/[\s\-\/]/g, '')
}

export function parseAmount(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = Number(String(val).replace(/[,$\s]/g, ''))
  return isNaN(n) ? null : n
}

export function parseDate(val: unknown): string | null {
  if (!val) return null
  const s = String(val).trim()
  if (!s) return null
  // Handle Excel serial dates (numbers)
  const num = Number(s)
  if (!isNaN(num) && num > 1000 && num < 100000) {
    // Excel date serial: days since 1900-01-01 (with Lotus 1-2-3 leap year bug)
    const date = new Date((num - 25569) * 86400 * 1000)
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}

/**
 * Aplica los mapeos de columnas a una fila cruda del Excel y devuelve un ParsedClaimRow.
 * Las columnas no mapeadas se guardan en extra_fields.
 */
export function applyColumnMappings(
  row: Record<string, unknown>,
  mappings: ClaimColumnMapping[]
): ParsedClaimRow {
  const mapped: Record<string, string | null> = {}
  const mappedKeys = new Set<string>()

  for (const m of mappings) {
    const raw = row[m.source_column] ?? ''
    mappedKeys.add(m.source_column)
    mapped[m.target_field] = raw !== '' ? String(raw) : null
  }

  const extra_fields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (!mappedKeys.has(k) && v !== '' && v !== null && v !== undefined) {
      extra_fields[k] = v
    }
  }

  return {
    claim_number:     mapped['claim_number']   ?? null,
    policy_number_raw: mapped['policy_number'] ?? null,
    loss_date:        parseDate(mapped['loss_date']),
    report_date:      parseDate(mapped['report_date']),
    claim_type:       mapped['claim_type']     ?? null,
    description:      mapped['description']    ?? null,
    amount_claimed:   parseAmount(mapped['amount_claimed']),
    amount_approved:  parseAmount(mapped['amount_approved']),
    amount_paid:      parseAmount(mapped['amount_paid']),
    status_insurer:   mapped['status_insurer'] ?? null,
    extra_fields,
  }
}
