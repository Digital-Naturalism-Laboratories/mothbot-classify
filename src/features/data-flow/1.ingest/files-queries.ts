import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import { useStore } from '@nanostores/react'
import { appReadyStore, userSessionLoadedStore } from '~/stores/ui'
import { openDirectory, tryRestoreFromSavedDirectory } from './files.service'
import { convertLegacyToMothboxNextPackage } from './convert-legacy-to-package'
import { chooseDatasetsFolder } from './choose-datasets-folder'
import { hydrateDatasetsWorkspaceFromDisk } from './load-datasets-workspace'
import { importDatasetSourceFromUserPick } from './import-dataset-source'
import { openDatasetByFolderName } from './scan-datasets-folder'

export function useRestoreDirectoryQuery() {
  const query = useQuery({
    queryKey: ['fs', 'restore'],
    queryFn: async () => {
      await hydrateDatasetsWorkspaceFromDisk()
      const restored = await tryRestoreFromSavedDirectory()
      return restored
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

export function useConvertLegacyPackageMutation() {
  return useMutation({
    mutationKey: ['fs', 'convert-legacy-package'],
    mutationFn: async () => {
      return convertLegacyToMothboxNextPackage()
    },
    retry: false,
  })
}

export function useChooseDatasetsFolderMutation() {
  return useMutation({
    mutationKey: ['fs', 'choose-datasets'],
    mutationFn: async () => chooseDatasetsFolder(),
    retry: false,
  })
}

export function useImportDatasetSourceMutation() {
  return useMutation({
    mutationKey: ['fs', 'import-dataset-source'],
    mutationFn: async () => importDatasetSourceFromUserPick(),
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

export function useIsLoadingFolders() {
  const restoreQuery = useRestoreDirectoryQuery()
  const isOpening = useIsMutating({ mutationKey: ['fs', 'open'] }) > 0
  const isConverting = useIsMutating({ mutationKey: ['fs', 'convert-legacy-package'] }) > 0
  const isChoosingDatasets = useIsMutating({ mutationKey: ['fs', 'choose-datasets'] }) > 0
  const isImporting = useIsMutating({ mutationKey: ['fs', 'import-dataset-source'] }) > 0
  const isOpeningDataset = useIsMutating({ mutationKey: ['fs', 'open-dataset'] }) > 0
  const sessionLoaded = useStore(userSessionLoadedStore)
  return (
    !sessionLoaded ||
    restoreQuery.isLoading ||
    isOpening ||
    isConverting ||
    isChoosingDatasets ||
    isImporting ||
    isOpeningDataset
  )
}

export function useAppLoading() {
  const restoreQuery = useRestoreDirectoryQuery()
  const isOpening = useIsMutating({ mutationKey: ['fs', 'open'] }) > 0
  const isConverting = useIsMutating({ mutationKey: ['fs', 'convert-legacy-package'] }) > 0
  const isChoosingDatasets = useIsMutating({ mutationKey: ['fs', 'choose-datasets'] }) > 0
  const isImporting = useIsMutating({ mutationKey: ['fs', 'import-dataset-source'] }) > 0
  const isOpeningDataset = useIsMutating({ mutationKey: ['fs', 'open-dataset'] }) > 0
  const sessionLoaded = useStore(userSessionLoadedStore)
  const isLoading =
    !sessionLoaded ||
    restoreQuery.isLoading ||
    isOpening ||
    isConverting ||
    isChoosingDatasets ||
    isImporting ||
    isOpeningDataset
  return {
    isLoading,
    sessionLoaded,
    isOpening,
    isConverting,
    isChoosingDatasets,
    isImporting,
    isOpeningDataset,
    restoring: restoreQuery.isLoading,
  }
}

export function useAppReady() {
  const ready = useStore(appReadyStore)
  return !!ready
}
