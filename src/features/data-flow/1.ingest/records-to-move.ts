/**
 * Records that follow their folders between projects.
 *
 * When Mothbot Process moves a folder of results to another project (a deployment
 * moved, or a project split into its folders), it adds the move to a note in the
 * receiving project: `_processed/mothbox-records-to-move.json`. The next time the
 * picked folder shows both projects, the records and identifications of those
 * folders move across (mothbox-next/move-project-records.ts), with both projects'
 * records backed up first, and the note is cleared.
 */
import { moveProjectRecords, type FolderMove, type PackageTexts } from '~/features/mothbox-next/move-project-records'
import { fileExistsAt, readTextFile, removeFileAt, writeTextFile, type FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { BACKUPS_DIR } from './combine-project-packages'
import { directoryName, getChildDirectory, PROCESSED_DIR_NAME } from './project-folder'

export const RECORDS_TO_MOVE_FILE = 'mothbox-records-to-move.json'

type DirectoryHandleWithIter = FileSystemDirectoryHandleLike & {
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  entries?: () => AsyncIterable<[string, { kind?: string }]>
  removeEntry?: (name: string, opts?: { recursive?: boolean }) => Promise<void>
}

type NoteMove = FolderMove & { fromProject?: string; fromProjectPath?: string; at?: string }

type ProjectHere = { path: string; name: string; processed: FileSystemDirectoryHandleLike }

export type RecordsMoveResult = {
  moved: Array<{ from: string; to: string; patches: number; humanLines: number }>
  /** Moves whose giving project isn't inside the picked folder: open a folder holding both. */
  waiting: Array<{ to: string; from: string }>
}

/** The picked folder's own project and the projects directly inside it, by path ('' for the folder itself). */
async function projectsHere(root: FileSystemDirectoryHandleLike): Promise<ProjectHere[]> {
  const out: ProjectHere[] = []
  const rootName = directoryName(root)
  if (rootName === PROCESSED_DIR_NAME) return out // a lone _processed: no other project is visible
  const own = await getChildDirectory(root, PROCESSED_DIR_NAME)
  if (own) out.push({ path: '', name: rootName || 'Project', processed: own })
  const dir = root as DirectoryHandleWithIter
  if (dir.entries) {
    for await (const [name, handle] of dir.entries()) {
      if (handle?.kind !== 'directory' || name.startsWith('.') || name.startsWith('_')) continue
      const processed = await getChildDirectory(handle as FileSystemDirectoryHandleLike, PROCESSED_DIR_NAME)
      if (processed) out.push({ path: name, name, processed })
    }
  }
  return out
}

function joinProjectPath(from: string, relative: string): string {
  const parts = from ? from.split('/') : []
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/')
}

async function readNote(processed: FileSystemDirectoryHandleLike): Promise<NoteMove[]> {
  if (!(await fileExistsAt(processed, RECORDS_TO_MOVE_FILE))) return []
  try {
    const data = JSON.parse(await readTextFile(processed, RECORDS_TO_MOVE_FILE)) as { moves?: NoteMove[] }
    return Array.isArray(data?.moves) ? data.moves.filter((m) => typeof m?.fromFolder === 'string') : []
  } catch {
    return []
  }
}

async function readPackage(processed: FileSystemDirectoryHandleLike): Promise<PackageTexts | null> {
  if (!(await fileExistsAt(processed, 'dataset.json'))) return null
  const files: Record<string, string> = {}
  for (const folder of ['02_records', '03_classifications']) {
    let sub: DirectoryHandleWithIter | null = null
    try {
      sub = (await (processed as DirectoryHandleWithIter).getDirectoryHandle?.(folder, { create: false })) as DirectoryHandleWithIter
    } catch {
      sub = null
    }
    if (!sub?.entries) continue
    for await (const [name, handle] of sub.entries()) {
      if (handle?.kind === 'file' && !name.startsWith('.')) files[`${folder}/${name}`] = await readTextFile(processed, `${folder}/${name}`)
    }
  }
  return { manifestText: await readTextFile(processed, 'dataset.json'), files }
}

async function backUp(processed: FileSystemDirectoryHandleLike, stamp: string, label: string, pkg: PackageTexts) {
  const base = `${BACKUPS_DIR}/${stamp}/${label}`
  const texts: Record<string, string> = { 'dataset.json': pkg.manifestText, ...pkg.files }
  for (const [path, text] of Object.entries(texts)) {
    await writeTextFile(processed, `${base}/${path}`, text)
    if ((await readTextFile(processed, `${base}/${path}`)) !== text) {
      throw new Error(`The backup of ${label}/${path} could not be checked; nothing was changed.`)
    }
  }
}

function stampNow(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `move-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

/** True if a project in or directly inside *root* has records waiting to move in. */
export async function hasRecordsToMove(root: FileSystemDirectoryHandleLike): Promise<boolean> {
  for (const project of await projectsHere(root)) {
    if ((await readNote(project.processed)).length) return true
  }
  return false
}

export async function applyRecordsToMove(params: {
  root: FileSystemDirectoryHandleLike
  onProgress?: (message: string) => void
}): Promise<RecordsMoveResult> {
  const { root, onProgress } = params
  const projects = await projectsHere(root)
  const byPath = new Map(projects.map((project) => [project.path, project]))
  const result: RecordsMoveResult = { moved: [], waiting: [] }
  const stamp = stampNow()
  const backedUp = new Set<string>()

  for (const receiver of projects) {
    const note = await readNote(receiver.processed)
    if (!note.length) continue
    const remaining: NoteMove[] = []
    // One pass per giving project, so its records are read and rewritten once.
    const byGiver = new Map<string, NoteMove[]>()
    for (const move of note) {
      const giverPath = joinProjectPath(receiver.path, move.fromProjectPath ?? '..')
      const giver = byPath.get(giverPath)
      if (!giver || giver.path === receiver.path) {
        remaining.push(move)
        result.waiting.push({ to: receiver.name, from: move.fromProject ?? giverPath })
        continue
      }
      byGiver.set(giverPath, [...(byGiver.get(giverPath) ?? []), move])
    }

    for (const [giverPath, moves] of byGiver) {
      const giver = byPath.get(giverPath)!
      onProgress?.(`Moving records from ${giver.name} to ${receiver.name}…`)
      const giverPackage = await readPackage(giver.processed)
      if (!giverPackage) continue // nothing recorded there: the folders get set up as new nights
      const receiverPackage = await readPackage(receiver.processed)
      const outcome = moveProjectRecords({
        giver: giverPackage,
        receiver: receiverPackage,
        receiverName: receiver.name,
        moves: moves.map(({ fromFolder, toFolder }) => ({ fromFolder, toFolder: toFolder ?? '' })),
      })

      if (!backedUp.has(giver.path)) {
        await backUp(giver.processed, stamp, `from-${giver.name}`, giverPackage)
        backedUp.add(giver.path)
      }
      if (receiverPackage && !backedUp.has(receiver.path)) {
        await backUp(receiver.processed, stamp, `to-${receiver.name}`, receiverPackage)
        backedUp.add(receiver.path)
      }

      for (const [path, text] of Object.entries(outcome.receiver.files)) await writeTextFile(receiver.processed, path, text)
      await writeTextFile(receiver.processed, 'dataset.json', outcome.receiver.manifestText)
      if (outcome.giverEmpty) {
        // Nothing left there: its records are in the backup; it's just a folder now.
        const dir = giver.processed as DirectoryHandleWithIter
        for (const [name, recursive] of [['dataset.json', false], ['adapter-report.json', false], ['02_records', true], ['03_classifications', true]] as const) {
          try {
            await dir.removeEntry?.(name, { recursive })
          } catch (err) {
            if ((err as { name?: string })?.name !== 'NotFoundError') throw err
          }
        }
      } else {
        for (const [path, text] of Object.entries(outcome.giverFiles)) await writeTextFile(giver.processed, path, text)
      }
      result.moved.push({ from: giver.name, to: receiver.name, patches: outcome.movedPatches, humanLines: outcome.movedHumanLines })
    }

    if (remaining.length) {
      await writeTextFile(
        receiver.processed,
        RECORDS_TO_MOVE_FILE,
        JSON.stringify({ format: 'mothbox-records-to-move', formatVersion: 1, moves: remaining }, null, 2) + '\n',
      )
    } else {
      await removeFileAt(receiver.processed, RECORDS_TO_MOVE_FILE)
    }
  }
  return result
}
