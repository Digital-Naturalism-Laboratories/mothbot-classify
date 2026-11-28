/**
 * Mothbox projects: the folder that is processed, shared and opened as one unit.
 *
 * Mothbot Process keeps each project's results in a `_processed` folder inside the
 * project, and marks the project with `mothbox-project.json` (a copy sits inside
 * `_processed`, so a shared `_processed` still names its project):
 *
 *   Field Data/                    ← may be picked: lists its projects
 *     Desert2026/                  ← may be picked: opens straight into it
 *       mothbox-project.json
 *       Cactus/superDorada_2026-08-11/*.jpg
 *       _processed/                ← may be picked: opens straight into it
 *         mothbox-project.json, dataset.json, 02_records/, Cactus/…
 *
 * The package (dataset.json, 02_records/, 03_classifications/) lives inside
 * `_processed`, so `_processed` on its own is the whole project.
 */
import { readDatasetManifestSummary } from './dataset-manifest'
import type { PendingDatasetMigration } from './pending-dataset-migration-types'
import type { DatasetRegistryEntry } from '~/stores/datasets-registry'
import { fileExistsAt, readTextFile, type FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export const PROJECT_MARKER_FILE = 'mothbox-project.json'
export const PROCESSED_DIR_NAME = '_processed'

type DirectoryHandleWithIter = FileSystemDirectoryHandleLike & {
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  entries?: () => AsyncIterable<[string, { kind?: string }]>
  values?: () => AsyncIterable<{ kind?: string; name?: string }>
}

export type ProjectMarker = { projectID?: string; name?: string }

export async function readProjectMarker(directory: FileSystemDirectoryHandleLike): Promise<ProjectMarker | null> {
  if (!(await fileExistsAt(directory, PROJECT_MARKER_FILE))) return null
  try {
    const parsed = JSON.parse(await readTextFile(directory, PROJECT_MARKER_FILE)) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as ProjectMarker) : {}
  } catch {
    return {} // a marker that can't be read still marks the folder as a project
  }
}

export async function getChildDirectory(
  directory: FileSystemDirectoryHandleLike,
  name: string,
): Promise<DirectoryHandleWithIter | null> {
  try {
    const child = await (directory as DirectoryHandleWithIter).getDirectoryHandle?.(name, { create: false })
    return (child as DirectoryHandleWithIter) ?? null
  } catch {
    return null
  }
}

/** True if *directory* holds any sub-folder. Doesn't recurse: patch folders can be huge. */
export async function directoryHasSubdirectory(directory: FileSystemDirectoryHandleLike): Promise<boolean> {
  const d = directory as DirectoryHandleWithIter
  if (!d.entries) return false
  for await (const [, handle] of d.entries()) {
    if (handle?.kind === 'directory') return true
  }
  return false
}

export function directoryName(directory: FileSystemDirectoryHandleLike): string {
  return ((directory as { name?: string }).name ?? '').trim()
}

/**
 * When the picked folder is itself one project (or a project's `_processed`), the
 * entry that opens it, or the setup it needs. Returns `null` when the picked folder
 * is not a project, so its sub-folders are listed instead.
 */
export type RootProjectResult =
  | { kind: 'package'; entry: DatasetRegistryEntry }
  | { kind: 'pending'; pending: PendingDatasetMigration }
  | { kind: 'not-processed'; projectName: string }

export async function detectProjectAtRoot(root: FileSystemDirectoryHandleLike): Promise<RootProjectResult | null> {
  const rootName = directoryName(root) || 'project'
  const marker = await readProjectMarker(root)
  const isProcessedFolder = rootName === PROCESSED_DIR_NAME
  // A `_processed` folder is named after its project (from its marker copy).
  const displayName = (isProcessedFolder ? marker?.name?.trim() : '') || rootName

  // The package itself was picked: a project's _processed, or an older single package.
  const rootManifest = await readDatasetManifestSummary(root)
  if (rootManifest.hasManifest) {
    return {
      kind: 'package',
      entry: { folderName: displayName, datasetId: rootManifest.datasetId, hasManifest: true, packagePath: '' },
    }
  }

  // A project folder: its package lives in its own _processed.
  const processed = isProcessedFolder ? null : await getChildDirectory(root, PROCESSED_DIR_NAME)
  if (processed) {
    const manifest = await readDatasetManifestSummary(processed)
    if (manifest.hasManifest) {
      return {
        kind: 'package',
        entry: { folderName: displayName, datasetId: manifest.datasetId, hasManifest: true, packagePath: PROCESSED_DIR_NAME },
      }
    }
  }

  if (!marker) return null

  if (isProcessedFolder) {
    // A project's _processed picked on its own (e.g. shared without photos).
    if (!(await directoryHasSubdirectory(root))) return { kind: 'not-processed', projectName: displayName }
    return {
      kind: 'pending',
      pending: { folderName: displayName, kind: 'mothbox-project', relativePath: '', packagePath: '', processedMirrorHandle: root },
    }
  }

  if (processed && (await directoryHasSubdirectory(processed))) {
    return {
      kind: 'pending',
      pending: {
        folderName: displayName,
        kind: 'mothbox-project',
        relativePath: '',
        packagePath: PROCESSED_DIR_NAME,
        processedMirrorHandle: processed,
      },
    }
  }
  return { kind: 'not-processed', projectName: displayName }
}

/**
 * A project folder inside the picked folder (`<child>/_processed`): the entry that
 * opens it, the setup it needs, or `null` if *child* doesn't keep its own `_processed`.
 */
export async function detectChildProject(
  child: FileSystemDirectoryHandleLike,
  folderName: string,
): Promise<{ entry?: DatasetRegistryEntry; pending?: PendingDatasetMigration } | null> {
  const processed = await getChildDirectory(child, PROCESSED_DIR_NAME)
  if (!processed) return null
  const packagePath = `${folderName}/${PROCESSED_DIR_NAME}`
  const manifest = await readDatasetManifestSummary(processed)
  if (manifest.hasManifest) {
    return { entry: { folderName, datasetId: manifest.datasetId, hasManifest: true, packagePath } }
  }
  if (!(await directoryHasSubdirectory(processed))) return null
  return { pending: { folderName, kind: 'mothbox-project', packagePath, processedMirrorHandle: processed } }
}

/**
 * For a package at *packagePath* (relative to the picked folder), the path of the
 * folder that holds its full-size photos, when that folder is inside the picked one.
 * `undefined` when the photos can't be reached from here.
 */
export function originalSourcePathForPackage(params: { folderName: string; packagePath?: string }): string | undefined {
  const { folderName, packagePath } = params
  if (packagePath === undefined || packagePath === folderName) return undefined
  if (packagePath === PROCESSED_DIR_NAME) return '' // the picked folder is the project
  const suffix = `/${PROCESSED_DIR_NAME}`
  if (packagePath.endsWith(suffix)) return packagePath.slice(0, -suffix.length)
  if (packagePath === '') return undefined // the picked folder is the package; photos are above it
  return folderName // older layout: _processed/<folderName> beside the photos in <folderName>
}

/**
 * Plain-language help when the picked folder holds no project, so people know
 * which folder to pick instead. The browser can't look above the picked folder.
 */
export async function describeFolderWithoutProject(root: FileSystemDirectoryHandleLike): Promise<{
  title: string
  description: string
}> {
  const name = directoryName(root) || 'this folder'
  let photos = 0
  let detections = 0
  let datedFolders = 0
  const d = root as DirectoryHandleWithIter
  if (d.entries) {
    for await (const [entryName, handle] of d.entries()) {
      if (handle?.kind === 'directory' && /\d{4}-\d{2}-\d{2}/.test(entryName)) datedFolders++
      if (handle?.kind !== 'file') continue
      if (/_botdetection\.json$/i.test(entryName)) detections++
      else if (/\.(jpe?g)$/i.test(entryName)) photos++
    }
  }
  const title = `No project in “${name}”`
  if (detections > 0) {
    return {
      title,
      description:
        'This looks like one night of a processed project. Pick the project folder instead: it is usually two levels up, and holds a _processed folder.',
    }
  }
  if (datedFolders > 0) {
    return {
      title,
      description:
        'This looks like one deployment (its nights are dated folders). Pick the project folder above it instead.',
    }
  }
  if (photos > 0) {
    return {
      title,
      description: `Found ${photos} photo${photos === 1 ? '' : 's'} but no Mothbot results. Pick a higher folder that contains your project, or process these photos in Mothbot Process first.`,
    }
  }
  return {
    title,
    description:
      'Pick a project folder (it holds a _processed folder), or a folder that contains several projects.',
  }
}
