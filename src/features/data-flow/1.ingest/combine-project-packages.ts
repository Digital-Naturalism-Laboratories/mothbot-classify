/**
 * Combines a project's older per-folder packages into one at `<project>/_processed`
 * (see mothbox-next/combine-project-records.ts for what changes in the records).
 *
 * Order, so a stop at any point loses nothing:
 *   1. read every folder's dataset.json and record files;
 *   2. combine them in memory (stops here on a problem, e.g. a patch in two folders);
 *   3. copy each folder's original files to `_processed/_backups/combine-<time>/<folder>/`
 *      and read the copies back to check them;
 *   4. write the combined record files, then dataset.json last, so the project only
 *      counts as set up once everything is there;
 *   5. remove each folder's old dataset.json and record folders (their backups stay).
 */
import { combineProjectRecords, type SubPackageRecords } from '~/features/mothbox-next/combine-project-records'
import { fileExistsAt, readTextFile, writeTextFile, type FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

type DirectoryHandleWithIter = FileSystemDirectoryHandleLike & {
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  entries?: () => AsyncIterable<[string, { kind?: string }]>
  removeEntry?: (name: string, opts?: { recursive?: boolean }) => Promise<void>
}

const RECORD_FOLDERS = ['02_records', '03_classifications']
const PACKAGE_FILES = ['dataset.json', 'adapter-report.json']
export const BACKUPS_DIR = '_backups'

/** Folders directly inside `_processed` that hold their own package (dataset.json). */
export async function findSubPackages(
  processed: FileSystemDirectoryHandleLike,
): Promise<Array<{ folder: string; handle: DirectoryHandleWithIter }>> {
  const found: Array<{ folder: string; handle: DirectoryHandleWithIter }> = []
  const dir = processed as DirectoryHandleWithIter
  if (!dir.entries) return found
  for await (const [name, handle] of dir.entries()) {
    if (handle?.kind !== 'directory' || name.startsWith('.') || name === BACKUPS_DIR) continue
    if (await fileExistsAt(handle as FileSystemDirectoryHandleLike, 'dataset.json')) {
      found.push({ folder: name, handle: handle as DirectoryHandleWithIter })
    }
  }
  return found.sort((a, b) => a.folder.localeCompare(b.folder))
}

async function listFiles(dir: DirectoryHandleWithIter, folder: string): Promise<string[]> {
  let sub: DirectoryHandleWithIter | undefined
  try {
    sub = (await dir.getDirectoryHandle?.(folder, { create: false })) as DirectoryHandleWithIter
  } catch {
    return []
  }
  const names: string[] = []
  if (!sub?.entries) return names
  for await (const [name, handle] of sub.entries()) {
    if (handle?.kind === 'file' && !name.startsWith('.')) names.push(`${folder}/${name}`)
  }
  return names.sort()
}

function backupStamp(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `combine-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

export type CombineProjectResult = {
  folders: string[]
  patches: number
  backupPath: string
}

export async function combineProjectPackages(params: {
  processed: FileSystemDirectoryHandleLike
  projectName: string
  onProgress?: (message: string) => void
}): Promise<CombineProjectResult | null> {
  const { processed, projectName, onProgress } = params
  const subs = await findSubPackages(processed)
  if (!subs.length) return null // already one project
  // Projects merged into one that already has records: its own records join in,
  // with nothing put in front of their paths.
  const sources: Array<{ folder: string; handle: DirectoryHandleWithIter }> = [...subs]
  if (await fileExistsAt(processed, 'dataset.json')) sources.unshift({ folder: '', handle: processed as DirectoryHandleWithIter })

  // 1. Read.
  const records: SubPackageRecords[] = []
  const originals = new Map<string, Record<string, string>>() // folder → path → text, for the backup
  for (const { folder, handle } of sources) {
    onProgress?.(`Reading ${folder || projectName}…`)
    const texts: Record<string, string> = {}
    for (const name of PACKAGE_FILES) {
      if (await fileExistsAt(handle, name)) texts[name] = await readTextFile(handle, name)
    }
    const files: Record<string, string> = {}
    for (const recordFolder of RECORD_FOLDERS) {
      for (const path of await listFiles(handle, recordFolder)) {
        const text = await readTextFile(handle, path)
        texts[path] = text
        files[path] = text
      }
    }
    originals.set(folder, texts)
    records.push({ folder, manifestText: texts['dataset.json'], files })
  }

  // 2. Combine (throws, before anything is written, if the folders can't be combined).
  onProgress?.('Combining records…')
  const combined = combineProjectRecords({ projectName, subPackages: records })

  // 3. Back up, and check the copies.
  const stamp = backupStamp()
  const backupPath = `${BACKUPS_DIR}/${stamp}`
  for (const [folder, texts] of originals) {
    onProgress?.(`Backing up ${folder || projectName}…`)
    for (const [path, text] of Object.entries(texts)) {
      const target = `${backupPath}/${folder || '_project'}/${path}`
      await writeTextFile(processed, target, text)
      if ((await readTextFile(processed, target)) !== text) {
        throw new Error(`The backup of ${folder}/${path} could not be checked; nothing was changed.`)
      }
    }
  }

  // 4. Write the project's records; dataset.json last.
  onProgress?.('Writing the project records…')
  for (const [path, text] of Object.entries(combined.files)) await writeTextFile(processed, path, text)
  await writeTextFile(processed, 'dataset.json', combined.manifestText)

  // 5. Remove each folder's old package files (backed up in step 3).
  for (const { handle } of subs) {
    for (const name of PACKAGE_FILES) await removeIfThere(handle, name, false)
    for (const name of RECORD_FOLDERS) await removeIfThere(handle, name, true)
  }

  console.log('✅ combineProjectPackages', { projectName, folders: subs.map((s) => s.folder), summary: combined.summary })
  return { folders: subs.map((s) => s.folder), patches: combined.summary.patches, backupPath }
}

async function removeIfThere(dir: DirectoryHandleWithIter, name: string, recursive: boolean) {
  try {
    await dir.removeEntry?.(name, { recursive })
  } catch (err) {
    if ((err as { name?: string })?.name !== 'NotFoundError') throw err
  }
}
