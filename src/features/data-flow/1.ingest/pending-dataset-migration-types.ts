import type { DatasetFolderKind } from './classify-dataset-folder'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export type PendingDatasetMigration = {
  folderName: string
  kind: Exclude<DatasetFolderKind, 'package' | 'skip'>
  /** Sibling `_processed/<folderName>` directory, when the JSON outputs live there instead of nested inside the dataset folder. */
  processedMirrorHandle?: FileSystemDirectoryHandleLike | null
  /**
   * Path of the project folder relative to the picked folder, when it isn't
   * `folderName` (`''` when the picked folder is the project itself).
   */
  relativePath?: string
  /** Where the package gets written, relative to the picked folder (e.g. `Desert2026/_processed`). */
  packagePath?: string
}
