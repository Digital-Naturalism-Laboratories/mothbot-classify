import { toast } from 'sonner'
import { collectFilesWithPathsRecursively, type IndexedPickedFile } from './files.fs'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import { ingestSpeciesListsFromFiles } from './species.ingest'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'

const WORKSPACE_SPECIES_DIR = 'Species'

type DirectoryHandleWithGet = FileSystemDirectoryHandleLike & {
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
}

export async function loadWorkspaceSpeciesLists(): Promise<number> {
  const root = (await requireDatasetsFolderHandle({ mode: 'read', notifyOnDenied: false })) as
    | DirectoryHandleWithGet
    | null
  if (!root) return 0

  const speciesDir = await getWorkspaceSpeciesDirectory(root)
  if (!speciesDir) return 0

  const indexed: IndexedPickedFile[] = []
  await collectFilesWithPathsRecursively({
    directoryHandle: speciesDir,
    pathToDirectory: [WORKSPACE_SPECIES_DIR],
    items: indexed,
  })

  if (!indexed.length) {
    console.log('🌀 species: no CSV/TSV files under workspace Species/')
    return 0
  }

  await ingestSpeciesListsFromFiles({ files: indexed })
  return indexed.length
}

export async function refreshWorkspaceSpeciesLists() {
  const count = await loadWorkspaceSpeciesLists()
  if (count > 0) {
    toast.success('Species lists loaded', {
      description: `${count} file${count === 1 ? '' : 's'} from ${WORKSPACE_SPECIES_DIR}/`,
    })
  }
  return count
}

async function getWorkspaceSpeciesDirectory(root: DirectoryHandleWithGet) {
  try {
    const speciesDir = await root.getDirectoryHandle?.(WORKSPACE_SPECIES_DIR, { create: false })
    return speciesDir ?? null
  } catch {
    return null
  }
}
