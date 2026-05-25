import { parseDatasetManifest } from '~/features/mothbox-next/dataset-manifest'
import { fileExistsAt, readTextFile } from '~/utils/fs-directory-handle'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export type DatasetManifestSummary = {
  hasManifest: boolean
  datasetId?: string
}

export async function directoryHasDatasetManifest(
  directory: FileSystemDirectoryHandleLike,
): Promise<boolean> {
  const summary = await readDatasetManifestSummary(directory)
  return summary.hasManifest
}

export async function readDatasetManifestSummary(
  directory: FileSystemDirectoryHandleLike,
): Promise<DatasetManifestSummary> {
  const hasFile = await fileExistsAt(directory, 'dataset.json')
  if (!hasFile) return { hasManifest: false }

  try {
    const text = await readTextFile(directory, 'dataset.json')
    const manifest = parseDatasetManifest(JSON.parse(text))
    if (!manifest) return { hasManifest: false }

    return { hasManifest: true, datasetId: manifest.dataset_id }
  } catch {
    return { hasManifest: false }
  }
}
