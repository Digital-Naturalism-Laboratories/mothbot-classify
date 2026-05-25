import type { DatasetFolderKind } from './classify-dataset-folder'

export type PendingDatasetMigration = {
  folderName: string
  kind: Exclude<DatasetFolderKind, 'package' | 'skip'>
}
