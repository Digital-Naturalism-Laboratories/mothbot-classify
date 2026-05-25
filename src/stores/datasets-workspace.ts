import { atom } from 'nanostores'

export type DatasetsWorkspaceState = {
  folderName: string
}

export const datasetsWorkspaceStore = atom<DatasetsWorkspaceState | null>(null)

export function setDatasetsWorkspaceFolderName(folderName: string) {
  const trimmed = folderName.trim()
  if (!trimmed) {
    datasetsWorkspaceStore.set(null)
    return
  }
  datasetsWorkspaceStore.set({ folderName: trimmed })
}

export function clearDatasetsWorkspace() {
  datasetsWorkspaceStore.set(null)
}
