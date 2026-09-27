import type { IndexedFile } from '~/stores/entities/photos'
import { reloadActivePackageFromIndexedFiles } from '~/features/mothbox-next/reload-package'
import { findPackageManifestInIndexedFiles } from '~/features/mothbox-next/load-package-data'
import {
  buildIndexedFileMap,
  normalizeIndexedPathsToPackageRoot,
  readIndexedEntryText,
} from '~/features/mothbox-next/package-indexed-access'
import { parseDatasetManifest } from '~/features/mothbox-next/dataset-manifest'
export async function ingestMothboxNextPackageFromIndexedFiles(params: {
  files: IndexedFile[]
  /**
   * Extra files (already relative to their own root, not the package root)
   * used only for resolving full-size source photos not present in the
   * package itself — e.g. the original source folder when the package
   * lives in a `_processed` mirror. Never used for patches, JSON, or writes.
   */
  extraSourceResolutionFiles?: IndexedFile[]
}) {
  const { files, extraSourceResolutionFiles } = params
  const manifestInfo = findPackageManifestInIndexedFiles(files)
  if (!manifestInfo) return { ok: false as const, message: 'No dataset.json found.' }

  const { packageRoot, manifestPath } = manifestInfo
  const byRelativePath = buildIndexedFileMap(files)
  const manifestEntry = byRelativePath[manifestPath]
  if (!manifestEntry) return { ok: false as const, message: 'dataset.json not readable.' }

  try {
    const normalizedFiles = normalizeIndexedPathsToPackageRoot(files)
    const sourceResolutionIndexed = extraSourceResolutionFiles?.length
      ? [...normalizedFiles, ...extraSourceResolutionFiles]
      : normalizedFiles

    const loaded = await reloadActivePackageFromIndexedFiles({
      files: normalizedFiles,
      sourceResolutionIndexed,
    })

    console.log('✅ ingestMothboxNextPackage: complete', {
      datasetId: loaded.manifest.dataset_id,
      patchCount: loaded.patches.length,
    })

    return { ok: true as const, patchCount: loaded.patches.length }
  } catch (err) {
    console.error('🚨 ingestMothboxNextPackage: load failed', err)
    // Only blame dataset.json when it really is invalid. Everything else (out of
    // memory, unreadable records, a bug) used to be reported as "Invalid
    // dataset.json (load failed)", which sent people hunting in the wrong place.
    const manifestProblem = await describeInvalidManifest(manifestEntry)
    if (manifestProblem) return { ok: false as const, message: `Invalid mothbox-next dataset.json (${manifestProblem}).` }
    const reason = err instanceof Error ? err.message : String(err)
    return { ok: false as const, message: `Could not load this dataset: ${reason}` }
  }
}

/** Why dataset.json is invalid, or null when it parses as a valid manifest. */
async function describeInvalidManifest(manifestEntry: IndexedFile): Promise<string | null> {
  try {
    const raw = JSON.parse(await readIndexedEntryText(manifestEntry))
    if (!parseDatasetManifest(raw)) return `format=${String((raw as { format?: string }).format)}`
    return null
  } catch (err) {
    return String(err)
  }
}
