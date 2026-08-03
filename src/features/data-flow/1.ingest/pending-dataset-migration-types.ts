import type { DatasetFolderKind } from './classify-dataset-folder'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export type PendingDatasetMigration = {
  folderName: string
  kind: Exclude<DatasetFolderKind, 'package' | 'skip'>
  /** Sibling `_processed/<folderName>` directory, when the JSON outputs live there instead of nested inside the dataset folder. */
  processedMirrorHandle?: FileSystemDirectoryHandleLike | null
}
