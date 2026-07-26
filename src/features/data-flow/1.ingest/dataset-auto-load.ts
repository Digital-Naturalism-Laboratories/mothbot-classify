import { toast } from 'sonner'
import { clearDatasetAutoLoadInFlight, setDatasetAutoLoadDisabled } from '~/features/data-flow/3.persist/files.persistence'

/** Shared id for the "Opening dataset…" toast so it can be updated/dismissed. */
export const OPEN_PACKAGE_TOAST_ID = 'open-mothbox-next-package'

/**
 * Escape hatch for a dataset load that is too big, too slow, or corrupt. Disables
 * startup auto-open (so the same dataset doesn't re-hang on the next launch) and
 * reloads the page to hard-stop the in-flight work. The user lands on the picker;
 * manually opening any dataset re-enables auto-open (see useOpenDatasetMutation).
 */
export function cancelDatasetAutoLoad(): void {
  setDatasetAutoLoadDisabled(true)
  clearDatasetAutoLoadInFlight() // deliberate stop, not a crash — don't trip the guard
  toast.dismiss(OPEN_PACKAGE_TOAST_ID)
  toast.message('Cancelled loading — reloading…')
  // A page reload is the only reliable way to abort the FS scan / ingest, which
  // isn't wired for cooperative cancellation.
  setTimeout(() => window.location.reload(), 50)
}
