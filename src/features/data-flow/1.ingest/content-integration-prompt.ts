import { $globalDialogData } from '~/components/dialogs/global-dialog'
import { NewDatasetMigrationDialogContent } from './new-dataset-migration-dialog'
import { NewForeignContentDialogContent } from './new-foreign-content-dialog'
import type { ContentIntegrationPolicy } from './content-integration-policy'

export function isContentIntegrationDialogOpen(): boolean {
  const current = $globalDialogData.get()
  return (
    current?.component === NewDatasetMigrationDialogContent ||
    current?.component === NewForeignContentDialogContent
  )
}

export function shouldPromptContentIntegration(params: {
  policy: ContentIntegrationPolicy | null
  integrationInProgress: boolean
}): params is { policy: ContentIntegrationPolicy; integrationInProgress: false } {
  const { policy, integrationInProgress } = params
  if (!policy || integrationInProgress || isContentIntegrationDialogOpen()) return false
  return true
}
