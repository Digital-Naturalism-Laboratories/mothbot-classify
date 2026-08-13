/**
 * Detecting and merging night folders that exist on disk but aren't yet in a
 * package's records.
 *
 * Mothbot Process writes new night folders (patch images + `_botdetection.json`)
 * into a deployment, but it doesn't maintain the Mothbox Next records under
 * `02_records/`. Those are only produced when the dinalab adapter runs, so a
 * night added after setup is invisible to Classify until something re-ingests
 * it. Re-running the adapter wholesale would rewrite `current-classifications`
 * and the human classifier file, destroying existing identification work — so
 * new nights are built in isolation and appended instead.
 */

const BOT_DETECTION_SUFFIX = '_botdetection.json'

/** Directory portion of a relative path, '' for a bare file name. */
export function dirnameOf(relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '')
  const slash = normalized.lastIndexOf('/')
  return slash <= 0 ? (slash === 0 ? '' : '') : normalized.slice(0, slash)
}

export function isBotDetectionFileName(fileName: string): boolean {
  return fileName.endsWith(BOT_DETECTION_SUFFIX)
}

/**
 * Night folders that hold bot detections on disk but have no patch in the
 * package records, i.e. nights the adapter has never ingested.
 *
 * Identity is the night folder path itself (e.g. `Cactus/superDorada_2026-08-12`)
 * rather than a derived camera-day id, so this never has to re-implement the
 * adapter's date/noon-split rules to decide what's already known.
 */
export function findUningestedNightFolders(params: {
  /** Source-relative paths of every `*_botdetection.json` found on disk. */
  botDetectionPaths: string[]
  /** `asset_path` of every patch already in `02_records/patches.ndjson`. */
  existingAssetPaths: string[]
}): string[] {
  const { botDetectionPaths, existingAssetPaths } = params

  const ingestedFolders = new Set<string>()
  for (const assetPath of existingAssetPaths) {
    const folder = dirnameOf(assetPath)
    if (folder) ingestedFolders.add(folder)
  }

  const found = new Set<string>()
  for (const detectionPath of botDetectionPaths) {
    const folder = dirnameOf(detectionPath)
    if (!folder) continue
    if (ingestedFolders.has(folder)) continue
    found.add(folder)
  }

  return [...found].sort()
}

/** True when `relativePath` sits inside one of `folders` (or is one of them). */
export function isPathInFolders(relativePath: string, folders: Set<string>): boolean {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '')
  for (const folder of folders) {
    if (normalized === folder) return true
    if (normalized.startsWith(`${folder}/`)) return true
  }
  return false
}

export function parseNdjson<T = Record<string, unknown>>(text: string): T[] {
  const out: T[] = []
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed) as T)
    } catch {
      // Skip malformed lines rather than losing the whole file.
    }
  }
  return out
}

/**
 * Appends `additions` to `existingText`, skipping any row whose key is already
 * present. Existing lines are preserved byte-for-byte — nothing already in the
 * file is rewritten, which is what keeps identification work intact.
 */
export function appendNdjsonRowsByKey<T extends Record<string, unknown>>(params: {
  existingText: string
  additions: T[]
  key: keyof T & string
}): { text: string; addedCount: number } {
  const { existingText, additions, key } = params

  const existingKeys = new Set<string>()
  for (const row of parseNdjson<Record<string, unknown>>(existingText)) {
    const value = row?.[key]
    if (typeof value === 'string' && value) existingKeys.add(value)
  }

  const newLines: string[] = []
  for (const row of additions) {
    const value = row?.[key]
    if (typeof value !== 'string' || !value) continue
    if (existingKeys.has(value)) continue
    existingKeys.add(value)
    newLines.push(JSON.stringify(row))
  }

  if (!newLines.length) return { text: existingText, addedCount: 0 }

  const base = existingText.length && !existingText.endsWith('\n') ? `${existingText}\n` : existingText
  return { text: `${base}${newLines.join('\n')}\n`, addedCount: newLines.length }
}

/** Appends every row unconditionally (for append-only logs like `_bot.ndjson`). */
export function appendNdjsonRows<T>(params: { existingText: string; additions: T[] }): {
  text: string
  addedCount: number
} {
  const { existingText, additions } = params
  if (!additions.length) return { text: existingText, addedCount: 0 }

  const lines = additions.map((row) => JSON.stringify(row))
  const base = existingText.length && !existingText.endsWith('\n') ? `${existingText}\n` : existingText
  return { text: `${base}${lines.join('\n')}\n`, addedCount: lines.length }
}
