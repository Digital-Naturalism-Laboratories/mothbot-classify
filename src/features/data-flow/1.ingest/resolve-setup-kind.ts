import { classifyDatasetFolder, type DatasetFolderKind } from './classify-dataset-folder'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export type DatasetSetupKind = Exclude<DatasetFolderKind, 'package' | 'skip'>

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
      'No supported files found. Add patch images, legacy *_botdetection.json files, Mothbox _processed outputs, or AMI parquet/CSV metadata with processed crops.',
    )
  }

  return classified
}
