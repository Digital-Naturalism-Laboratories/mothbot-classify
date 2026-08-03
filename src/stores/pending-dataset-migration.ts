import { atom } from 'nanostores'

/** Folder names the user dismissed from the new-dataset dialog (this session). */
export const dismissedPendingMigrationFoldersStore = atom<Set<string>>(new Set())

/** True while a pending-setup or foreign-merge integration is running. */
export const contentIntegrationInProgressStore = atom(false)

/** True while focus/startup content integration checks are running. */
export const contentIntegrationCheckInFlightStore = atom(false)

export function setContentIntegrationInProgress(inProgress: boolean) {
  contentIntegrationInProgressStore.set(inProgress)
}

export function setContentIntegrationCheckInFlight(inFlight: boolean) {
  contentIntegrationCheckInFlightStore.set(inFlight)
}

export function dismissPendingMigrationFolders(folderNames: string[]) {
  const next = new Set(dismissedPendingMigrationFoldersStore.get())
  for (const name of folderNames) {
    const trimmed = name.trim()
    if (trimmed) next.add(trimmed)
  }
  dismissedPendingMigrationFoldersStore.set(next)
}

export function clearDismissedPendingMigrationFolders() {
  dismissedPendingMigrationFoldersStore.set(new Set())
}
