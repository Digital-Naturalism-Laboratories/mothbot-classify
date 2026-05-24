import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { idbGet } from '~/utils/index-db'
import type { PackageTextWriter } from './persist-human-classifications'
import { persistPackageClassifications } from './persist-human-classifications'
import { isMothboxNextPackageOpen } from '../active-package'
import { normalizePackageRelativePath } from '../package-paths'
import {
  fileExistsAt,
  listNdjsonPathsInFolder,
  readTextFile,
  writeTextFile,
  type FileSystemDirectoryHandleLike,
} from '~/utils/fs-directory-handle'

export async function exportUserDetectionsForMothboxNextPackage() {
  if (!isMothboxNextPackageOpen()) return

  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null

  if (!root) return

  const granted = await ensureReadWritePermission(root as FileSystemDirectoryHandleLike)
  if (!granted) return

  const writer = createPackageWriterFromRoot(root)
  await persistPackageClassifications({ writer })
}

function createPackageWriterFromRoot(root: FileSystemDirectoryHandleLike): PackageTextWriter {
  return {
    readText: (relativePath) => readTextFile(root, relativePath),
    writeText: (relativePath, text) => writeTextFile(root, relativePath, text),
    fileExists: (relativePath) => fileExistsAt(root, relativePath),
    listClassificationNdjsonPaths: (classificationsFolder) => {
      const folderRel = normalizePackageRelativePath(classificationsFolder).replace(/\/+$/, '')
      return listNdjsonPathsInFolder(root, folderRel)
    },
  }
}
