import { pickerErrorStore } from '~/stores/ui'
import { applyIndexedFilesState } from './files.initialize'
import { normalizeIndexedFilesForIngest, type IndexedPickedFile } from './files.fs'
import { validateFolderSelection } from './package/validate-selection'
import { singlePassIngest } from './files.single-pass'
import { detectIngestModeFromFiles, type IngestMode } from './ingest-mode'
import { excludePackageArchiveIndexedFiles } from './reserved-paths'
import { clearMothboxNextPackage } from '~/features/mothbox-next/active-package'

export type IngestFolderPipelineResult =
  | { ok: true; ingestMode: IngestMode; fileCount: number }
  | { ok: false; message: string; levelsUp?: number }

export async function ingestIndexedFolderFiles(params: {
  files: IndexedPickedFile[]
  /** Caller already ran `normalizeIndexedFilesForIngest` (e.g. open-directory retry loop). */
  pathsAlreadyNormalized?: boolean
}): Promise<IngestFolderPipelineResult> {
  const { files, pathsAlreadyNormalized = false } = params
  if (!files?.length) return { ok: false, message: 'No files found in the selected folder.' }

  const normalized = pathsAlreadyNormalized
    ? ({ ok: true as const, files } satisfies { ok: true; files: IndexedPickedFile[] })
    : normalizeIndexedFilesForIngest({ files })
  if (!normalized.ok) {
    return {
      ok: false,
      message:
        normalized.message ??
        `Selected folder is too deep. Please pick ${normalized.levelsUp} level(s) up so dataset/deployment/night are included.`,
      levelsUp: normalized.levelsUp,
    }
  }

  const ingestMode = detectIngestModeFromFiles(normalized.files)
  const isPackage = ingestMode === 'mothbox-next'
  const indexedForStore = isPackage ? excludePackageArchiveIndexedFiles(normalized.files) : normalized.files
  const indexedForPackageLoad = isPackage ? normalized.files : indexedForStore

  const validation = await validateFolderSelection({ files: indexedForPackageLoad })
  if (!validation.ok) return { ok: false, message: validation.message }

  if (ingestMode === 'legacy') clearMothboxNextPackage()

  applyIndexedFilesState({ indexed: indexedForStore, ingestMode })

  const ingest = await singlePassIngest({
    files: indexedForPackageLoad,
    pathsAlreadyNormalized: true,
    skipIndexedStateApply: true,
    skipValidation: true,
  })
  if (!ingest.ok) return { ok: false, message: ingest.message ?? 'Ingest failed.' }

  pickerErrorStore.set(null)
  return { ok: true, ingestMode, fileCount: indexedForPackageLoad.length }
}
