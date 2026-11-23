import { nonTargetPathKey, parseNonTargetPath } from '~/models/non-target'

/**
 * The Non-Target categories people added to a dataset (ontology: Non-Target), one per line:
 *   {"path":"Error/Glare","addedAt":"2026-11-23T14:02:00.000Z","addedBy":"AQ"}
 * The built-in Error and Abiotic are never stored. Lines are only ever appended.
 * Field names are camelCase, as decided for all files (ontology: Field Names).
 */
export const PACKAGE_NON_TARGET_CATEGORIES_RECORD = '02_records/non-target-categories.ndjson'

export type NonTargetCategoryRecord = {
  path: string
  addedAt?: string
  addedBy?: string
}

/** Category path keys ("Error/Glare") from the file's text; unreadable lines are skipped. */
export function parseNonTargetCategories(text: string): string[] {
  const keys: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const value = JSON.parse(trimmed) as { path?: unknown }
      const path = Array.isArray(value?.path)
        ? value.path.filter((s): s is string => typeof s === 'string')
        : typeof value?.path === 'string'
          ? parseNonTargetPath(value.path)
          : []
      const key = nonTargetPathKey(path)
      if (key && !keys.includes(key)) keys.push(key)
    } catch {
      // skip a damaged line rather than lose the rest
    }
  }
  return keys
}

/** NDJSON lines for new categories, ready to append. */
export function serializeNonTargetCategories(records: NonTargetCategoryRecord[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '')
}
