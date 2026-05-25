import type { MothboxNextDatasetManifest } from './dataset-manifest'
import { parseDatasetManifest } from './dataset-manifest'
import type { PatchRecord } from './records'
import { parsePatchRecords } from './parse-package-records'
import { patchAssetAbsolutePath } from './package-paths'
import { isPackageIndexedFiles } from './load-package-data'
import { formatFilesystemError } from '~/utils/fs-error'

export type PackageFileAccess = {
  readText: (absolutePath: string) => Promise<string>
  fileExists: (absolutePath: string) => Promise<boolean>
}

export type ValidateDatasetPackageResult =
  | { ok: true; manifest: MothboxNextDatasetManifest; patchCount: number }
  | { ok: false; message: string }

export async function validateDatasetPackage(params: {
  packageRoot: string
  readManifestText: () => Promise<string>
  files: PackageFileAccess
}): Promise<ValidateDatasetPackageResult> {
  const { packageRoot, readManifestText, files } = params

  let manifestRaw: unknown
  try {
    manifestRaw = JSON.parse(await readManifestText())
  } catch {
    return { ok: false, message: 'dataset.json is not valid JSON.' }
  }

  const manifest = parseDatasetManifest(manifestRaw)
  if (!manifest) return { ok: false, message: 'dataset.json is not a mothbox-next-dataset manifest.' }

  const patchesPath = `${packageRoot.replace(/\/+$/, '')}/${manifest.records.patches.replace(/^\/+/, '')}`
  if (!(await files.fileExists(patchesPath))) {
    return { ok: false, message: `Missing patches record file: ${manifest.records.patches}` }
  }

  const sourceIncluded = manifest.source?.included === true
  const patchesFolder = `${packageRoot.replace(/\/+$/, '')}/${manifest.folders.patches.replace(/^\/+/, '')}`
  if (!sourceIncluded && manifest.patches?.required_when_source_absent) {
    if (!(await files.fileExists(patchesFolder))) {
      return { ok: false, message: `Missing patches folder: ${manifest.folders.patches} (required when source is absent).` }
    }
  }

  let patchRows: PatchRecord[] = []
  try {
    const text = await files.readText(patchesPath)
    patchRows = parsePatchRecords(text)
  } catch (err) {
    return { ok: false, message: `Invalid patches.ndjson: ${formatFilesystemError(err)}` }
  }

  if (!patchRows.length) return { ok: false, message: 'patches.ndjson must contain at least one patch.' }

  const patchIds = new Set<string>()
  for (const row of patchRows) {
    if (!row.patch_id || !row.asset_path) {
      return { ok: false, message: 'Each patch row must include patch_id and asset_path.' }
    }
    if (patchIds.has(row.patch_id)) {
      return { ok: false, message: `Duplicate patch_id: ${row.patch_id}` }
    }
    patchIds.add(row.patch_id)

    const assetAbs = patchAssetAbsolutePath({ packageRoot, assetPath: row.asset_path })
    if (!(await files.fileExists(assetAbs))) {
      const staleLayoutHint =
        manifest.source?.included === true && row.asset_path.replace(/^\/+/, '').startsWith('01_patches/')
          ? ' This package keeps patch images next to the legacy source tree; records may still point at 01_patches/ from an older setup.'
          : ''
      return {
        ok: false,
        message: `Missing patch image: ${row.asset_path}. If you moved folders after setup, run Set up or Refresh datasets again.${staleLayoutHint}`,
      }
    }
  }

  return { ok: true, manifest, patchCount: patchRows.length }
}

export function isMothboxNextPackageRoot(files: Array<{ path: string; name: string }>): boolean {
  return isPackageIndexedFiles(files)
}
