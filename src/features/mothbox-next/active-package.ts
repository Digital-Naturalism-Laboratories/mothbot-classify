import { fileKeyStyleForVersion, type FileKeyStyle } from './file-keys'
import { atom } from 'nanostores'
import type { MothboxNextDatasetManifest } from './dataset-manifest'
import type { LoadedMothboxNextPackage } from './load-package-data'

export type ActiveMothboxNextPackage = {
  packageRoot: string
  manifest: MothboxNextDatasetManifest
  loaded?: LoadedMothboxNextPackage
}

export const mothboxNextPackageStore = atom<ActiveMothboxNextPackage | null>(null)

/**
 * The original source folder of a package kept in a `_processed` mirror (full-size photos
 * stay there); null when the photos are inside the package folder.
 */
export const originalSourceFolderStore = atom<unknown | null>(null)

export function isMothboxNextPackageOpen(): boolean {
  return mothboxNextPackageStore.get() !== null
}

/** The field-name style the open package's files are written in (format 4+ is camelCase). */
export function activePackageFileKeyStyle(): FileKeyStyle {
  return fileKeyStyleForVersion(mothboxNextPackageStore.get()?.manifest?.version)
}

export function clearMothboxNextPackage() {
  mothboxNextPackageStore.set(null)
}
