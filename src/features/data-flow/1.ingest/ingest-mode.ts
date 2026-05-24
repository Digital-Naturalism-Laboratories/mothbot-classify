import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { detectIngestMode as detectIngestModeFromIndexed } from '~/features/mothbox-next/package-indexed-access'

export type IngestMode = 'legacy' | 'mothbox-next'

export function getIngestMode(): IngestMode {
  return mothboxNextPackageStore.get() ? 'mothbox-next' : 'legacy'
}

export function isLegacyIngestMode(): boolean {
  return getIngestMode() === 'legacy'
}

export function isMothboxNextIngestMode(): boolean {
  return getIngestMode() === 'mothbox-next'
}

export function detectIngestModeFromFiles(files: Array<{ path: string; name: string }>): IngestMode {
  return detectIngestModeFromIndexed(files)
}
