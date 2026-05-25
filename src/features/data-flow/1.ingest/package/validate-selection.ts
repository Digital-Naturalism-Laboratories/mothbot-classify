import { validateDatasetPackage } from '~/features/mothbox-next/validate-dataset-package'
import { isPackageIndexedFiles } from '~/features/mothbox-next/load-package-data'
import { findPackageManifestInIndexedFiles, ADAPTER_COMMAND } from '~/features/mothbox-next/load-package-data'
import { legacyIngestEnabled } from '~/config/ingest'
import { validateProjectRootSelection } from '../files.validation'
import {
  buildIndexedFileMap,
  createPackageFileAccessFromIndexedFiles,
  readIndexedEntryText,
} from '~/features/mothbox-next/package-indexed-access'
import { formatFilesystemError } from '~/utils/fs-error'

export async function validateFolderSelection(params: {
  files: Array<{ file?: File; handle?: unknown; path: string; name: string; size: number }>
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { files } = params
  if (!files?.length) return { ok: false, message: 'No files found in the selected folder.' }

  if (isPackageIndexedFiles(files)) {
    return validateMothboxNextIndexedSelection({ files })
  }

  if (legacyIngestEnabled) {
    const legacy = validateProjectRootSelection({ files })
    if (legacy.ok) return legacy
  }

  return {
    ok: false,
    message: `This folder is not a Mothbox Next package (missing dataset.json) and is not a legacy Dinalab tree. Convert with:\n${ADAPTER_COMMAND}`,
  }
}

async function validateMothboxNextIndexedSelection(params: {
  files: Array<{ file?: File; handle?: unknown; path: string; name: string; size: number }>
}) {
  const { files } = params
  const manifestInfo = findPackageManifestInIndexedFiles(files)
  if (!manifestInfo) {
    return { ok: false, message: 'dataset.json was not found in the selected folder.' }
  }

  const { packageRoot, manifestPath } = manifestInfo
  const byPath = buildIndexedFileMap(files)
  const manifestEntry = byPath[manifestPath]
  if (!manifestEntry) {
    return { ok: false, message: 'dataset.json is not readable.' }
  }

  try {
    const result = await validateDatasetPackage({
      packageRoot,
      readManifestText: () => readIndexedEntryText(manifestEntry as any),
      files: createPackageFileAccessFromIndexedFiles({ files: files as any, packageRoot }),
    })

    if (!result.ok) return enrichMissingPatchMessage({ files, result })
    return { ok: true }
  } catch (err) {
    return { ok: false, message: formatFilesystemError(err) }
  }
}

function enrichMissingPatchMessage(params: {
  files: Array<{ path: string }>
  result: { ok: false; message: string }
}) {
  const { files, result } = params
  if (!result.message.includes('Missing patch image:')) return result

  const indexedPatchSamples = files
    .map((file) => file.path.replaceAll('\\', '/'))
    .filter((path) => path.includes('/patches/') && /\.(jpg|jpeg|png)$/i.test(path))
    .slice(0, 3)

  if (!indexedPatchSamples.length) return result

  return {
    ok: false as const,
    message: `${result.message} Indexed patch files on disk look like: ${indexedPatchSamples.join(', ')}. Run Set up or Refresh datasets to rebuild records.`,
  }
}
