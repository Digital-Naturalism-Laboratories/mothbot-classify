import { toast } from 'sonner'
import {
  clearDatasetAutoLoadInFlight,
  getDatasetAutoLoadInFlight,
  isDatasetAutoLoadDisabled,
  loadLastActiveDatasetFolderName,
  setDatasetAutoLoadDisabled,
  setDatasetAutoLoadInFlight,
} from '~/features/data-flow/3.persist/files.persistence'
import {
  activeDatasetFolderNameStore,
  datasetsRegistryStore,
  setActiveDatasetFolderName,
} from '~/stores/datasets-registry'
import { isMothboxNextPackageOpen } from '~/features/mothbox-next/active-package'
import { openDatasetByFolderName } from './open-dataset-by-folder'
import { resolveDefaultDatasetFolderName } from './resolve-default-dataset-folder'

/** Highlights last-used dataset in the registry without loading package data from disk. */
export function rememberDefaultDatasetSelection(): boolean {
  if (activeDatasetFolderNameStore.get()) return false

  const folderName = resolveDefaultDatasetFolderName({
    entries: datasetsRegistryStore.get(),
    lastUsedFolderName: loadLastActiveDatasetFolderName(),
  })
  if (!folderName) return false

  setActiveDatasetFolderName(folderName)
  return true
}

export async function ensureDefaultDatasetOpen(): Promise<boolean> {
  if (isMothboxNextPackageOpen()) return false

  const folderName = resolveDefaultDatasetFolderName({
    entries: datasetsRegistryStore.get(),
    lastUsedFolderName: loadLastActiveDatasetFolderName(),
  })
  if (!folderName) return false

  return openDatasetByFolderName({ folderName })
}

// Coalesces the multiple startup triggers (the warm query + the focus check both
// call this). Without it, a second concurrent call would observe the first call's
// in-flight marker and mistake it for a previous-session crash.
let warmInFlight: Promise<boolean> | null = null

export async function warmDefaultDatasetInBackground(): Promise<boolean> {
  if (isDatasetAutoLoadDisabled()) return false // user cancelled a stuck load
  if (isMothboxNextPackageOpen()) return false
  if (warmInFlight) return warmInFlight

  warmInFlight = (async () => {
    // Cross-session crash guard: a leftover in-flight marker from a PREVIOUS run
    // means the load froze / crashed / ran out of memory (e.g. a huge 50k-patch
    // night). Skip it and stay disabled so the app stays usable instead of
    // re-freezing every launch. Opening a dataset manually re-enables auto-open.
    const stalled = getDatasetAutoLoadInFlight()
    if (stalled) {
      clearDatasetAutoLoadInFlight()
      setDatasetAutoLoadDisabled(true)
      toast.warning(`Skipped auto-opening “${stalled}”`, {
        description: "The previous load didn't finish. Open it from the list to try again.",
        duration: 10000,
      })
      return false
    }

    const folderName = resolveDefaultDatasetFolderName({
      entries: datasetsRegistryStore.get(),
      lastUsedFolderName: loadLastActiveDatasetFolderName(),
    })
    if (!folderName) return false

    setDatasetAutoLoadInFlight(folderName)
    try {
      return await openDatasetByFolderName({ folderName, showSuccessToast: false })
    } finally {
      // Cleared only if the load actually returns; a freeze/crash leaves it set,
      // which is exactly what the guard above keys on next launch.
      clearDatasetAutoLoadInFlight()
    }
  })()

  try {
    return await warmInFlight
  } finally {
    warmInFlight = null
  }
}
