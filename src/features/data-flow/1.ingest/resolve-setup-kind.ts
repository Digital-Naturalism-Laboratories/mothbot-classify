import { classifyDatasetFolder, type DatasetFolderKind } from './classify-dataset-folder'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export type DatasetSetupKind = Exclude<DatasetFolderKind, 'package' | 'skip'>

export function isPatchImagesOnlyKind(kind: DatasetSetupKind) {
  return kind === 'patch-images-only'
}

export async function resolveDatasetSetupKind(params: {
  directory: FileSystemDirectoryHandleLike
  folderName: string
}): Promise<DatasetSetupKind> {
  const { directory, folderName } = params
  const classified = await classifyDatasetFolder({ directory, folderName })

  if (classified === 'package') {
    throw new Error('This folder is already a Mothbox dataset package (dataset.json exists).')
  }

  if (classified === 'skip') {
    throw new Error(
      'No supported files found. Add patch images (.jpg, .jpeg, .png) or legacy *_botdetection.json files.',
    )
  }

  return classified
}
