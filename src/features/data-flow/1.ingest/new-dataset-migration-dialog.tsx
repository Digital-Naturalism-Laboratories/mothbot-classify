import { useState } from 'react'
import { DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Loader } from '~/components/atomic/Loader'
import { closeGlobalDialog, openGlobalDialog } from '~/components/dialogs/global-dialog'
import type { PendingDatasetMigration } from './pending-dataset-migration-types'
import { isPatchImagesOnlyKind } from './resolve-setup-kind'
import { dismissPendingMigrationFolders } from '~/stores/pending-dataset-migration'
import { buildPendingDatasetSetupCopy } from './pending-dataset-setup-copy'
import {
  formatPendingDatasetSetupError,
  runPendingDatasetSetup,
} from './run-pending-dataset-setup'

export type NewDatasetMigrationDialogProps = {
  pending: PendingDatasetMigration[]
}

export function openNewDatasetMigrationDialog(params: { pending: PendingDatasetMigration[] }) {
  openGlobalDialog({
    component: NewDatasetMigrationDialogContent,
    props: params,
    align: 'center',
    className: 'max-w-[420px]',
  })
}

export function NewDatasetMigrationDialogContent(props: NewDatasetMigrationDialogProps) {
  const { pending } = props
  const [isMigrating, setIsMigrating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const folderNames = pending.map((item) => item.folderName)
  const count = folderNames.length
  const imageOnlyCount = pending.filter((item) => isPatchImagesOnlyKind(item.kind)).length
  const legacyCount = count - imageOnlyCount
  const copy = buildPendingDatasetSetupCopy({ count, folderNames, imageOnlyCount, legacyCount })

  async function onConfirm() {
    if (isMigrating) return
    setErrorMessage(null)
    setIsMigrating(true)

    try {
      const result = await runPendingDatasetSetup(pending)

      if (result.registryUpdated) {
        closeGlobalDialog()
        return
      }

      const formatted = formatPendingDatasetSetupError(result.errors)
      if (formatted) {
        setErrorMessage(formatted)
        return
      }

      setErrorMessage('Setup did not complete. Try Refresh datasets.')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setErrorMessage(message)
    } finally {
      setIsMigrating(false)
    }
  }

  function onDismiss() {
    dismissPendingMigrationFolders(folderNames)
    closeGlobalDialog()
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
      </DialogHeader>

      <p className='mt-12 text-13 text-neutral-700 text-pretty'>{copy.lead}</p>
      <p className='mt-8 text-13 text-neutral-600 text-pretty'>{copy.detail}</p>

      {errorMessage ? (
        <div
          role='alert'
          className='mt-12 rounded-md border border-red-200 bg-red-50 px-12 py-10 text-13 text-red-800 whitespace-pre-wrap'
        >
          {errorMessage}
        </div>
      ) : null}

      <DialogFooter className='mt-20'>
        <Button variant='outline' type='button' disabled={isMigrating} onClick={onDismiss}>
          Not now
        </Button>
        <Button type='button' variant='primary' disabled={isMigrating} onClick={() => void onConfirm()}>
          {isMigrating ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} />
              Setting up…
            </span>
          ) : (
            copy.confirmLabel
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
