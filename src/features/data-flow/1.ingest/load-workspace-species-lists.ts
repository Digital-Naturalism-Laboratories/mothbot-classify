import { toast } from 'sonner'
import { collectFilesWithPathsRecursively, type IndexedPickedFile } from './files.fs'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import { ingestSpeciesListsFromFiles } from './species.ingest'
import { isSpeciesListIndexedPath } from './species-indexed-paths'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'

/**
 * Species list CSVs can live anywhere under the datasets folder — there's
 * no required folder name. A folder literally named "Species" is just a
 * convention some users prefer; files found there are sorted to the top of
 * the picker, but it's never required.
 */
const WORKSPACE_SPECIES_HINT_DIR = 'Species'

export async function loadWorkspaceSpeciesLists(): Promise<number> {
  const root = (await requireDatasetsFolderHandle({ mode: 'read', notifyOnDenied: false })) as
    | FileSystemDirectoryHandleLike
    | null
  if (!root) return 0

  const indexed: IndexedPickedFile[] = []
  try {
    await collectFilesWithPathsRecursively({
      directoryHandle: root,
      pathToDirectory: [],
      items: indexed,
    })
  } catch (err) {
    console.warn('🚨 species: failed to scan datasets folder for CSV/TSV files', err)
    return 0
  }

  const speciesFiles = indexed.filter((entry) => isSpeciesListIndexedPath(entry.path))

  if (!speciesFiles.length) {
    console.log('🌀 species: no CSV/TSV files found under the datasets folder')
    return 0
  }

  await ingestSpeciesListsFromFiles({ files: speciesFiles })
  return speciesFiles.length
}

export async function refreshWorkspaceSpeciesLists() {
  const count = await loadWorkspaceSpeciesLists()
  if (count > 0) {
    toast.success('Species lists loaded', {
      description: `${count} CSV/TSV file${count === 1 ? '' : 's'} found in your datasets folder`,
    })
  }
  return count
}

export { WORKSPACE_SPECIES_HINT_DIR }
