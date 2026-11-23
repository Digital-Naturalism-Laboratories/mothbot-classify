import { isDeepStrictEqual } from './deep-equal'
import {
  CAMEL_CASE_PACKAGE_VERSION,
  convertNdjsonTextToCamelCase,
  fileKeyStyleOfManifestText,
  fromFileKeys,
  manifestFromFile,
  manifestToFile,
} from './file-keys'
import {
  fileExistsAt,
  getDirectoryAt,
  listNdjsonPathsInFolder,
  readTextFile,
  removeFileAt,
  writeTextFile,
  type FileSystemDirectoryHandleLike,
} from '~/utils/fs-directory-handle'

/**
 * Converts a package's files from snake_case (format ≤ 3) to camelCase (format 4)
 * (ontology: Field Names). Runs when a package is opened.
 *
 * 1. Reads dataset.json and every `.ndjson` file in the records and classifications folders.
 * 2. Writes a backup of each to `00_format_backup/<stamp>/<path>.bak` and reads it back to
 *    check it is byte-for-byte the original. Backups end in `.bak`, so nothing else in the
 *    app ever picks them up as package files.
 * 3. Writes the converted files, dataset.json last: if this stops part-way, the package is
 *    still format 3 with some camelCase files, which reads correctly and converts again
 *    next time.
 * 4. Re-reads every converted file and checks each row says exactly what the original
 *    row said (same lines in the same order, same fields and values once read).
 * 5. Only then deletes the backup. If anything differs, the originals are written back,
 *    checked, and the backup is kept.
 */

export const FORMAT_BACKUP_DIR = '00_format_backup'

export type PackageFileSystem = {
  readText: (path: string) => Promise<string>
  writeText: (path: string, text: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  listNdjson: (folder: string) => Promise<string[]>
  remove: (path: string) => Promise<void>
  /** Removes a directory only if it is empty; optional. */
  removeEmptyDirectory?: (path: string) => Promise<void>
}

export type CamelCaseMigrationResult =
  | { status: 'not-a-package' | 'not-needed' }
  | { status: 'migrated'; fileCount: number }
  | { status: 'failed'; error: string; restored: boolean; backupPath?: string }

type FilePlan = { path: string; original: string; converted: string }

export async function migratePackageToCamelCase(params: {
  fs: PackageFileSystem
  now?: Date
}): Promise<CamelCaseMigrationResult> {
  const { fs } = params

  let manifestText: string
  let manifestRaw: Record<string, unknown>
  try {
    manifestText = await fs.readText('dataset.json')
    manifestRaw = JSON.parse(manifestText)
  } catch {
    return { status: 'not-a-package' }
  }
  const manifest = manifestFromFile(manifestRaw) as Record<string, unknown> & {
    format?: string
    version?: number
    folders?: { records?: string; classifications?: string }
  }
  if (manifest.format !== 'mothbox-next-dataset' || typeof manifest.version !== 'number') return { status: 'not-a-package' }
  if (manifest.version >= CAMEL_CASE_PACKAGE_VERSION) return { status: 'not-needed' }

  // 1. Read everything first.
  const folders = [manifest.folders?.records ?? '02_records/', manifest.folders?.classifications ?? '03_classifications/']
  const plans: FilePlan[] = []
  for (const folder of folders) {
    for (const path of await fs.listNdjson(folder)) {
      const original = await fs.readText(path)
      plans.push({ path, original, converted: convertNdjsonTextToCamelCase(original) })
    }
  }
  const convertedManifest =
    JSON.stringify(manifestToFile({ ...manifest, version: CAMEL_CASE_PACKAGE_VERSION }), null, 2) + '\n'
  const manifestPlan: FilePlan = { path: 'dataset.json', original: manifestText, converted: convertedManifest }
  const allPlans = [...plans, manifestPlan]

  // 2. Back up and check the backup.
  const backupDir = `${FORMAT_BACKUP_DIR}/format-${manifest.version}-${stamp(params.now ?? new Date())}`
  const backupPath = (path: string) => `${backupDir}/${path}.bak`
  try {
    for (const plan of allPlans) {
      await fs.writeText(backupPath(plan.path), plan.original)
      if ((await fs.readText(backupPath(plan.path))) !== plan.original) throw new Error(`Backup of ${plan.path} does not match`)
    }
  } catch (err) {
    // Nothing has been converted yet; leave whatever backup got written for a person to look at.
    return { status: 'failed', error: `Could not back up the package: ${message(err)}`, restored: true, backupPath: backupDir }
  }

  // 3–4. Convert (dataset.json last) and check every file.
  try {
    for (const plan of plans) await fs.writeText(plan.path, plan.converted)
    await fs.writeText(manifestPlan.path, manifestPlan.converted)

    for (const plan of plans) {
      const problem = compareNdjson(plan.original, await fs.readText(plan.path))
      if (problem) throw new Error(`${plan.path}: ${problem}`)
    }
    const problem = compareManifest(manifestPlan.original, await fs.readText(manifestPlan.path))
    if (problem) throw new Error(`dataset.json: ${problem}`)
  } catch (err) {
    const restored = await restoreOriginals(fs, allPlans)
    return { status: 'failed', error: message(err), restored, backupPath: backupDir }
  }

  // 5. Everything checked: remove exactly the backup files written above.
  for (const plan of allPlans) {
    try {
      await fs.remove(backupPath(plan.path))
    } catch {
      // A leftover backup file is harmless.
    }
  }
  await removeEmptyDirectories(fs, backupDir)

  return { status: 'migrated', fileCount: allPlans.length }
}

/** Every original written back and checked; dataset.json first, so the package reads as format 3 again. */
async function restoreOriginals(fs: PackageFileSystem, plans: FilePlan[]): Promise<boolean> {
  let ok = true
  for (const plan of [...plans].reverse()) {
    try {
      await fs.writeText(plan.path, plan.original)
      if ((await fs.readText(plan.path)) !== plan.original) ok = false
    } catch {
      ok = false
    }
  }
  return ok
}

/** Null when both texts hold the same rows; otherwise what differs. */
export function compareNdjson(originalText: string, convertedText: string): string | null {
  const original = nonEmptyLines(originalText)
  const converted = nonEmptyLines(convertedText)
  if (original.length !== converted.length) return `line count changed (${original.length} → ${converted.length})`
  for (let i = 0; i < original.length; i++) {
    const before = parseRow(original[i]!)
    const after = parseRow(converted[i]!)
    if (before === undefined || after === undefined) {
      if (original[i] !== converted[i]) return `line ${i + 1} changed`
      continue
    }
    if (!isDeepStrictEqual(before, after)) return `line ${i + 1} reads differently`
  }
  return null
}

function compareManifest(originalText: string, convertedText: string): string | null {
  try {
    const before = manifestFromFile(JSON.parse(originalText)) as Record<string, unknown>
    const after = manifestFromFile(JSON.parse(convertedText)) as Record<string, unknown>
    if (after.version !== CAMEL_CASE_PACKAGE_VERSION) return 'version not updated'
    return isDeepStrictEqual({ ...before, version: CAMEL_CASE_PACKAGE_VERSION }, after) ? null : 'reads differently'
  } catch {
    return 'not valid JSON'
  }
}

function nonEmptyLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim())
}

/** A line's row in the internal form, or undefined for lines that aren't JSON objects. */
function parseRow(line: string): unknown {
  try {
    const value = JSON.parse(line)
    return value && typeof value === 'object' && !Array.isArray(value) ? fromFileKeys(value) : undefined
  } catch {
    return undefined
  }
}

async function removeEmptyDirectories(fs: PackageFileSystem, backupDir: string) {
  if (!fs.removeEmptyDirectory) return
  // Deepest first: subfolders mirror the package's own folders.
  const dirs = new Set<string>()
  for (const sub of ['02_records', '03_classifications']) dirs.add(`${backupDir}/${sub}`)
  for (const dir of [...dirs, backupDir, FORMAT_BACKUP_DIR]) {
    try {
      await fs.removeEmptyDirectory(dir)
    } catch {
      // not empty (another backup) or already gone
    }
  }
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** The migration's file access for a browser directory handle (the package folder). */
export function packageFileSystemFromHandle(handle: FileSystemDirectoryHandleLike): PackageFileSystem {
  return {
    readText: (path) => readTextFile(handle, path),
    writeText: (path, text) => writeTextFile(handle, path, text),
    exists: (path) => fileExistsAt(handle, path),
    listNdjson: (folder) => listNdjsonPathsInFolder(handle, folder),
    remove: (path) => removeFileAt(handle, path),
    removeEmptyDirectory: async (path) => {
      const parts = path.split('/').filter(Boolean)
      const name = parts.pop()
      if (!name) return
      const parent = parts.length ? await getDirectoryAt(handle, parts.join('/')) : handle
      // Never recursive: fails (and is ignored) unless the folder is already empty.
      await parent?.removeEntry?.(name, { recursive: false })
    },
  }
}

/**
 * Converts the package in `handle` to camelCase when it is older than format 4, with a
 * toast either way. Needs write access; without it the package opens as it is and is
 * converted on a later open.
 */
export async function migratePackageToCamelCaseIfNeeded(params: {
  handle: FileSystemDirectoryHandleLike
  canWrite: () => Promise<boolean>
  notify?: (result: CamelCaseMigrationResult) => void
}): Promise<CamelCaseMigrationResult> {
  const { handle } = params
  let manifestText = ''
  try {
    manifestText = await readTextFile(handle, 'dataset.json')
  } catch {
    return { status: 'not-a-package' }
  }
  if (fileKeyStyleOfManifestText(manifestText) === 'camel') return { status: 'not-needed' }
  if (!(await params.canWrite())) return { status: 'not-needed' }

  const result = await migratePackageToCamelCase({ fs: packageFileSystemFromHandle(handle) })
  params.notify?.(result)
  return result
}
