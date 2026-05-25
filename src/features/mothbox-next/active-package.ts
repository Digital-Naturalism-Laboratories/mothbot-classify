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

export function clearMothboxNextPackage() {
  mothboxNextPackageStore.set(null)
}
