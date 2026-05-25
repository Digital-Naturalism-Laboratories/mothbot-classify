import { ensureReadPermission, loadDatasetsDirectory } from '~/features/data-flow/3.persist/files.persistence'
import { clearDatasetsRegistry } from '~/stores/datasets-registry'
import { clearDatasetsWorkspace, setDatasetsWorkspaceFolderName } from '~/stores/datasets-workspace'
import { pickerErrorStore } from '~/stores/ui'
import { rememberDefaultDatasetSelection } from './ensure-default-dataset-open'
import { loadWorkspaceSpeciesLists } from './load-workspace-species-lists'
import { scanDatasetsFolder, type ScanDatasetsFolderOptions } from './scan-datasets-folder'

export type DatasetsWorkspaceSetupResult = {
  rememberedDefaultDataset: boolean
  speciesFileCount: number
}

const DATASETS_PERMISSION_MESSAGE =
  'Could not read the saved datasets folder. Choose it again and grant access.'

const DATASETS_SCAN_FAILED_MESSAGE =
  'Could not scan the datasets folder. Try choosing the folder again.'

export async function hydrateDatasetsWorkspaceFromDisk(): Promise<boolean> {
  const handle = await loadDatasetsDirectory()
  if (!handle) {
    clearDatasetsWorkspace()
    clearDatasetsRegistry()
    pickerErrorStore.set(null)
    return false
  }

  const canRead = await ensureReadPermission(handle)
  if (!canRead) {
    clearDatasetsWorkspace()
    clearDatasetsRegistry()
    pickerErrorStore.set(DATASETS_PERMISSION_MESSAGE)
    return false
  }

  const name = (handle as { name?: string }).name?.trim()
  if (name) setDatasetsWorkspaceFolderName(name)

  try {
    await finishDatasetsWorkspaceSetup({ autoMigrate: false })
    pickerErrorStore.set(null)
    return true
  } catch (error) {
    console.warn('🚨 hydrateDatasetsWorkspaceFromDisk: workspace setup failed', error)
    pickerErrorStore.set(DATASETS_SCAN_FAILED_MESSAGE)
    return false
  }
}

export async function finishDatasetsWorkspaceSetup(
  options?: ScanDatasetsFolderOptions,
): Promise<DatasetsWorkspaceSetupResult> {
  const [scanResult, speciesFileCount] = await Promise.all([
    scanDatasetsFolder(options).then(
      () => ({ ok: true as const }),
      (error) => {
        console.warn('🚨 datasetsWorkspaceSetup: scan failed', error)
        return { ok: false as const, error }
      },
    ),
    loadWorkspaceSpeciesLists().catch((error) => {
      console.warn('🌀 datasetsWorkspaceSetup: species lists failed', error)
      return 0
    }),
  ])

  if (!scanResult.ok) {
    throw scanResult.error instanceof Error ? scanResult.error : new Error(DATASETS_SCAN_FAILED_MESSAGE)
  }

  const rememberedDefaultDataset = rememberDefaultDatasetSelection()
  return { rememberedDefaultDataset, speciesFileCount }
}

export async function scanDatasetsRegistry(options?: ScanDatasetsFolderOptions) {
  const entries = await scanDatasetsFolder(options)
  rememberDefaultDatasetSelection()
  return entries
}
