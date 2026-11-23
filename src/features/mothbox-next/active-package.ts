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
