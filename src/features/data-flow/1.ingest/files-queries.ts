import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import { useStore } from '@nanostores/react'
import { appReadyStore, userSessionLoadedStore } from '~/stores/ui'
import { loadDatasetsDirectory } from '~/features/data-flow/3.persist/files.persistence'
import { openDirectory, tryRestoreLegacyPickedDirectory } from './files.service'
import { chooseDatasetsFolder } from './choose-datasets-folder'
import { hydrateDatasetsWorkspaceFromDisk, scanDatasetsRegistry } from './datasets-workspace-setup'
import { warmDefaultDatasetInBackground } from './ensure-default-dataset-open'
import { isMothboxNextPackageOpen } from '~/features/mothbox-next/active-package'
import { openDatasetByFolderName } from './open-dataset-by-folder'

export function useRestoreDirectoryQuery() {
  const query = useQuery({
    queryKey: ['fs', 'restore'],
    queryFn: async () => {
      const datasetsRoot = await loadDatasetsDirectory()
      if (datasetsRoot) return hydrateDatasetsWorkspaceFromDisk()
      return tryRestoreLegacyPickedDirectory()
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const res = query
  return res
}

/** Opens the last-used dataset after startup without blocking the shell loader. */
export function useWarmDefaultDatasetQuery() {
  const restoreQuery = useRestoreDirectoryQuery()

  return useQuery({
    queryKey: ['fs', 'warm-default-dataset'],
    queryFn: async () => warmDefaultDatasetInBackground(),
    enabled: restoreQuery.isSuccess && !isMothboxNextPackageOpen(),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useOpenDirectoryMutation() {
  const mutation = useMutation({
    mutationKey: ['fs', 'open'],
    mutationFn: async () => {
      await openDirectory()
    },
    retry: false,
  })

  const res = mutation
  return res
}

export function useChooseDatasetsFolderMutation() {
  return useMutation({
    mutationKey: ['fs', 'choose-datasets'],
    mutationFn: async () => chooseDatasetsFolder(),
    retry: false,
  })
}

export function useOpenDatasetMutation() {
  return useMutation({
    mutationKey: ['fs', 'open-dataset'],
    mutationFn: async (params: { folderName: string }) => openDatasetByFolderName(params),
    retry: false,
  })
}

export function useScanDatasetsFolderMutation() {
  return useMutation({
    mutationKey: ['fs', 'scan-datasets'],
    mutationFn: async () => scanDatasetsRegistry({ autoMigrate: true }),
    retry: false,
  })
}

function useFilesystemActivity() {
  const restoreQuery = useRestoreDirectoryQuery()
  useWarmDefaultDatasetQuery()
  const isOpening = useIsMutating({ mutationKey: ['fs', 'open'] }) > 0
  const isChoosingDatasets = useIsMutating({ mutationKey: ['fs', 'choose-datasets'] }) > 0
  const isOpeningDataset = useIsMutating({ mutationKey: ['fs', 'open-dataset'] }) > 0
  const isScanningDatasets = useIsMutating({ mutationKey: ['fs', 'scan-datasets'] }) > 0
  const sessionLoaded = useStore(userSessionLoadedStore)

  const isBlockingLoading = !sessionLoaded || restoreQuery.isLoading || isOpening || isChoosingDatasets

  const isLoading = isBlockingLoading || isOpeningDataset || isScanningDatasets

  return {
    isLoading,
    isBlockingLoading,
    sessionLoaded,
    isOpening,
    isChoosingDatasets,
    isOpeningDataset,
    isScanningDatasets,
    restoring: restoreQuery.isLoading,
  }
}

export function useAppLoading() {
  return useFilesystemActivity()
}

export function useAppReady() {
  const ready = useStore(appReadyStore)
  return !!ready
}
