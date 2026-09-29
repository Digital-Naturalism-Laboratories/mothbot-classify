import type { ClassificationRecord } from './records'
import { classifierFileName } from './package-paths'

const CLASSIFICATIONS_DIR = '03_classifications'

/**
 * Turns the initials an old-Classify user typed (`identifier_human: "HS"`) into a
 * classifier id, matching how the current app derives one from session initials
 * (trimmed, lower-case) so that person's new IDs land in the same file.
 * Returns null when the value can't name a classifier file.
 */
export function classifierIdFromIdentifierHuman(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    // Stripping leading "_" also keeps it from ever naming the `_bot` file.
    .replace(/^[._]+|[._]+$/g, '')
  return id || null
}

export function humanClassifierFilePath(classifierId: string): string {
  return `${CLASSIFICATIONS_DIR}/${classifierFileName(classifierId)}`
}

/** Splits human rows into one `03_classifications/<classifier>.ndjson` file per person. */
export function groupHumanRowsByClassifierFile(params: {
  rows: ClassificationRecord[]
  fallbackClassifierId: string
}): Array<{ path: string; rows: ClassificationRecord[] }> {
  const { rows, fallbackClassifierId } = params
  const rowsByPath = new Map<string, ClassificationRecord[]>()

  for (const row of rows) {
    const path = humanClassifierFilePath(row.classifier_id?.trim() || fallbackClassifierId)
    const bucket = rowsByPath.get(path)
    if (bucket) bucket.push(row)
    else rowsByPath.set(path, [row])
  }

  return [...rowsByPath.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, fileRows]) => ({ path, rows: fileRows }))
}
