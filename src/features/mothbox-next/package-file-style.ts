import { readTextFile, type FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { fileKeyStyleOfManifestText, type FileKeyStyle } from './file-keys'

/** The field-name style of the package in `packageHandle` (read from its dataset.json). */
export async function fileKeyStyleOfPackageHandle(packageHandle: FileSystemDirectoryHandleLike): Promise<FileKeyStyle> {
  try {
    return fileKeyStyleOfManifestText(await readTextFile(packageHandle, 'dataset.json'))
  } catch {
    return 'snake'
  }
}
