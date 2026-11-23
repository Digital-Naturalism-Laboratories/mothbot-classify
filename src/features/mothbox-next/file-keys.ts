/**
 * Field names in package files (ontology: Field Names).
 *
 * Decided 2026-11-22: anything written to a file is camelCase, including the package's own
 * files. Packages up to format version 3 were written in snake_case (`patch_id`,
 * `classifier_type`). The app keeps snake_case internally, and converts at the file
 * boundary:
 *
 * - `fromFileKeys` turns a row from a file, in either style, into the internal form. Every
 *   package reader uses it, so camelCase files (from a version 4 package, or another tool)
 *   read the same as snake_case ones.
 * - `toFileKeys` turns an internal row into the camelCase form for a version 4 package.
 *
 * Only top-level keys are converted; nested objects (a taxon, a labelled box, source
 * metadata) keep their own keys. Files that are camelCase internally too (sessions,
 * Non-Target categories) have their own readers and don't go through these. Where the ontology renames a field, the camelCase name is
 * the ontology's (e.g. `classifier_type: bot` ↔ `identifierType: machine`).
 */

/** Package format version that writes camelCase files (versions up to 3 are snake_case). */
export const CAMEL_CASE_PACKAGE_VERSION = 4
/** Newest package format this app can read. */
export const SUPPORTED_PACKAGE_VERSION = 4

/** Internal (snake_case) name → file (camelCase) name, where the plain conversion isn't wanted. */
const RENAMED: Record<string, string> = {
  classifier_type: 'identifierType',
  classifier_id: 'identifierID',
  confidence: 'identificationScore',
  species_list: 'taxaList',
  species_list_exclusions: 'taxaListExclusions',
  classified_at: 'identifiedAt',
  is_error: 'isNonTarget',
}
const RENAMED_BACK: Record<string, string> = Object.fromEntries(Object.entries(RENAMED).map(([a, b]) => [b, a]))

/** Values the ontology names differently, per internal field. */
const VALUES: Record<string, Record<string, string>> = {
  classifier_type: { bot: 'machine' },
  classification_type: { error: 'nonTarget' },
}
const VALUES_BACK: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(VALUES).map(([field, map]) => [field, Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]))]),
)

/** `camera_day_id` → `cameraDayID`: camelCase, with `id` written `ID` as in Darwin Core. */
export function snakeToCamel(key: string): string {
  if (RENAMED[key]) return RENAMED[key]!
  if (!key.includes('_')) return key
  const parts = key.split('_').filter(Boolean)
  return parts
    .map((part, i) => {
      const lower = part.toLowerCase()
      if (i > 0 && lower === 'id') return 'ID'
      if (i > 0 && lower === 'doi') return 'DOI'
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
}

/** `cameraDayID` → `camera_day_id`; snake_case keys are returned unchanged. */
export function camelToSnake(key: string): string {
  if (RENAMED_BACK[key]) return RENAMED_BACK[key]!
  if (key.includes('_') || !/[A-Z]/.test(key)) return key
  return key
    .replace(/ID(?=[A-Z]|$)/g, 'Id')
    .replace(/DOI(?=[A-Z]|$)/g, 'Doi')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

/** A row from a package file, in either style → the internal (snake_case) form. */
export function fromFileKeys<T = Record<string, unknown>>(row: unknown): T {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row as T
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    const internal = camelToSnake(key)
    const valueMap = VALUES_BACK[internal]
    out[internal] = typeof value === 'string' && valueMap?.[value] ? valueMap[value] : value
  }
  return out as T
}

/** An internal row → the camelCase form written to version 4 package files. */
export function toFileKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const valueMap = VALUES[key]
    out[snakeToCamel(key)] = typeof value === 'string' && valueMap?.[value] ? valueMap[value] : value
  }
  return out
}

/** A dataset.json in either style → the internal form (nested sections converted too). */
export function manifestFromFile(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const top = fromFileKeys<Record<string, unknown>>(raw)
  for (const section of ['folders', 'records', 'source', 'patches', 'cloud_upload_default']) {
    if (top[section] && typeof top[section] === 'object' && !Array.isArray(top[section])) {
      top[section] = fromFileKeys(top[section])
    }
  }
  return top
}

/** An internal dataset.json → the camelCase form (nested sections converted too). */
export function manifestToFile(manifest: Record<string, unknown>): Record<string, unknown> {
  const top: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(manifest)) {
    const converted =
      value && typeof value === 'object' && !Array.isArray(value) && ['folders', 'records', 'source', 'patches', 'cloud_upload_default'].includes(key)
        ? toFileKeys(value as Record<string, unknown>)
        : value
    top[snakeToCamel(key)] = converted
  }
  return top
}

/**
 * Rewrites one NDJSON package file in camelCase, line by line, keeping the order and every
 * value. Lines that aren't JSON objects are kept exactly as they are. For moving a
 * version 3 package to version 4; not run automatically.
 */
export function convertNdjsonTextToCamelCase(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      try {
        const value = JSON.parse(trimmed)
        if (!value || typeof value !== 'object' || Array.isArray(value)) return line
        return JSON.stringify(toFileKeys(fromFileKeys(value)))
      } catch {
        return line
      }
    })
    .join('\n')
}

/** Which field-name style a package's files are written in. */
export type FileKeyStyle = 'snake' | 'camel'

export function fileKeyStyleForVersion(version?: number | null): FileKeyStyle {
  return typeof version === 'number' && version >= CAMEL_CASE_PACKAGE_VERSION ? 'camel' : 'snake'
}

/** The style of the package whose dataset.json text is given; snake_case when unreadable. */
export function fileKeyStyleOfManifestText(text: string | null | undefined): FileKeyStyle {
  try {
    const manifest = manifestFromFile(JSON.parse(text ?? '')) as { version?: number }
    return fileKeyStyleForVersion(manifest?.version)
  } catch {
    return 'snake'
  }
}

/** One row as an NDJSON line in the package's style. */
export function packageRowLine(row: object, style: FileKeyStyle): string {
  return JSON.stringify(style === 'camel' ? toFileKeys(row as Record<string, unknown>) : row)
}

/** Rows as NDJSON text in the package's style (internal rows are snake_case). */
export function serializePackageRows(rows: readonly object[], style: FileKeyStyle): string {
  return rows.map((row) => packageRowLine(row, style)).join('\n') + (rows.length ? '\n' : '')
}
