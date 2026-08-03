import { useEffect, useRef } from 'react'
import { useStore } from '@nanostores/react'
import { datasetsWorkspaceStore } from '~/stores/datasets-workspace'
import { useAppLoading } from './files-queries'
import { runContentIntegrationChecks } from './content-integration-checks'
import { $globalDialogData } from '~/components/dialogs/global-dialog'
import { contentIntegrationInProgressStore } from '~/stores/pending-dataset-migration'

export function useDatasetsFolderFocusCheck() {
  const workspace = useStore(datasetsWorkspaceStore)
  const dialogData = useStore($globalDialogData)
  const integrationInProgress = useStore(contentIntegrationInProgressStore)
  const { sessionLoaded, restoring } = useAppLoading()
  const hasRunInitialCheck = useRef(false)
  const workspaceKey = workspace?.folderName ?? ''

  const canCheck = sessionLoaded && !restoring && !!workspaceKey
  const dialogOpen = !!dialogData

  useEffect(() => {
    hasRunInitialCheck.current = false
  }, [workspaceKey])

  useEffect(() => {
    if (!canCheck || dialogOpen || integrationInProgress) return

    function runCheck() {
      void runContentIntegrationChecks()
    }

    if (!hasRunInitialCheck.current) {
      hasRunInitialCheck.current = true
      runCheck()
    }

    function onWindowFocus() {
      runCheck()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') runCheck()
    }

    window.addEventListener('focus', onWindowFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('focus', onWindowFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [canCheck, dialogOpen, integrationInProgress, workspaceKey])
}
