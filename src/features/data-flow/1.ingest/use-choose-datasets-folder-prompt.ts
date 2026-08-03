import { useEffect, useRef } from 'react'
import { useStore } from '@nanostores/react'
import { useRouterState } from '@tanstack/react-router'
import { datasetsWorkspaceStore } from '~/stores/datasets-workspace'
import { $globalDialogData } from '~/components/dialogs/global-dialog'
import { isDirectoryPickerAvailable } from './directory-picker'
import { useAppLoading } from './files-queries'
import {
  ChooseDatasetsFolderDialogContent,
  openChooseDatasetsFolderDialog,
} from './choose-datasets-folder-dialog'

export function useChooseDatasetsFolderPrompt() {
  const workspace = useStore(datasetsWorkspaceStore)
  const dialogData = useStore($globalDialogData)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { sessionLoaded, restoring, isChoosingDatasets } = useAppLoading()
  const dismissedThisSession = useRef(false)

  const needsDatasetsFolder = !workspace?.folderName
  const isHome = pathname === '/'
  const chooseDialogOpen = dialogData?.component === ChooseDatasetsFolderDialogContent
  const otherDialogOpen = !!dialogData && !chooseDialogOpen

  useEffect(() => {
    if (!isHome || !sessionLoaded || restoring || isChoosingDatasets) return
    if (!needsDatasetsFolder) return
    if (otherDialogOpen || chooseDialogOpen) return
    if (dismissedThisSession.current) return
    if (!isDirectoryPickerAvailable()) return

    openChooseDatasetsFolderDialog({
      onDismiss: () => {
        dismissedThisSession.current = true
      },
    })
  }, [
    isHome,
    sessionLoaded,
    restoring,
    isChoosingDatasets,
    needsDatasetsFolder,
    otherDialogOpen,
    chooseDialogOpen,
  ])
}
