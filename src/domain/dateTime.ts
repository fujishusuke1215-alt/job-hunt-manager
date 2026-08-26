/**
 * Converts timestamps that carry an explicit offset into the one persistence
 * format used by AppDataV2.  A timestamp without an offset is deliberately
 * rejected: silently interpreting it in the browser's timezone would change
 * the recorded instant.
 */
export function canonicalIsoDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // PostgreSQL commonly serializes timestamptz as "YYYY-MM-DD HH:mm:ss+00".
  // It is an unambiguous instant, but not accepted by z.string().datetime().
  const hasExplicitOffset = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(trimmed)
  const hasDateAndTime = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(trimmed)
  if (!hasExplicitOffset || !hasDateAndTime) return null

  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
