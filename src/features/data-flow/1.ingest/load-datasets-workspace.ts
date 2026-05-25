import { loadDatasetsDirectory } from '~/features/data-flow/3.persist/files.persistence'
import { setDatasetsWorkspaceFolderName, clearDatasetsWorkspace } from '~/stores/datasets-workspace'
import { clearDatasetsRegistry } from '~/stores/datasets-registry'
import { scanDatasetsFolder } from './scan-datasets-folder'

export async function hydrateDatasetsWorkspaceFromDisk() {
  const handle = await loadDatasetsDirectory()
  if (!handle) {
    clearDatasetsWorkspace()
    clearDatasetsRegistry()
    return false
  }

  const name = (handle as { name?: string }).name?.trim()
  if (name) setDatasetsWorkspaceFolderName(name)
  await scanDatasetsFolder().catch(() => null)
  return true
}
