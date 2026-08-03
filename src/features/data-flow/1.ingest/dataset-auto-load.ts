import { clearDatasetAutoLoadInFlight, setDatasetAutoLoadDisabled } from '~/features/data-flow/3.persist/files.persistence'

/** Shared id for the "Opening dataset…" toast so it can be updated/dismissed. */
export const OPEN_PACKAGE_TOAST_ID = 'open-mothbox-next-package'

/**
 * Escape hatch for a dataset load that is too big, too slow, or corrupt. Disables
 * startup auto-open (persisted synchronously, so it's honored even if the reload
 * is delayed) and reloads the page to hard-stop the in-flight work. The reload is
 * synchronous on purpose: a deferred one (setTimeout) gets starved by the ongoing
 * load and never fires. The user lands on the picker; opening any dataset manually
 * re-enables auto-open.
 */
export function cancelDatasetAutoLoad(): void {
  setDatasetAutoLoadDisabled(true)
  clearDatasetAutoLoadInFlight() // deliberate stop, not a crash — don't trip the guard
  window.location.reload()
}
