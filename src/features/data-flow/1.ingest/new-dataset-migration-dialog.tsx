import { useMemo, useState } from 'react'
import { DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Loader } from '~/components/atomic/Loader'
import { closeGlobalDialog, openGlobalDialog } from '~/components/dialogs/global-dialog'
import type { PendingDatasetMigration } from './pending-dataset-migration-types'
import { dismissPendingMigrationFolders } from '~/stores/pending-dataset-migration'
import { buildPendingDatasetSetupCopy } from './pending-dataset-setup-copy'
import {
  formatPendingDatasetSetupError,
  runPendingDatasetSetup,
} from './run-pending-dataset-setup'
import { cn } from '~/utils/cn'

export type NewDatasetMigrationDialogProps = {
  pending: PendingDatasetMigration[]
}

export function openNewDatasetMigrationDialog(params: { pending: PendingDatasetMigration[] }) {
  openGlobalDialog({
    component: NewDatasetMigrationDialogContent,
    props: params,
    align: 'center',
    className: 'max-w-[460px]',
  })
}

export function NewDatasetMigrationDialogContent(props: NewDatasetMigrationDialogProps) {
  const { pending } = props
  const [isMigrating, setIsMigrating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Default to every folder selected — matches the previous "set up all" behavior,
  // but the user can deselect folders that aren't ready yet.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pending.map((item) => item.folderName)))

  const folderNames = pending.map((item) => item.folderName)
  const count = pending.length
  const selectedCount = selected.size
  const selectedItems = useMemo(() => pending.filter((item) => selected.has(item.folderName)), [pending, selected])
  const copy = buildPendingDatasetSetupCopy({
    count: selectedCount,
    folderNames: selectedItems.map((item) => item.folderName),
  })

  function toggleFolder(folderName: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(folderName)) next.delete(folderName)
      else next.add(folderName)
      return next
    })
  }

  function toggleAll() {
    setSelected((current) => (current.size === count ? new Set() : new Set(folderNames)))
  }

  async function onConfirm() {
    if (isMigrating || selectedItems.length === 0) return
    setErrorMessage(null)
    setIsMigrating(true)

    try {
      const result = await runPendingDatasetSetup(selectedItems)

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

  function onDismissAll() {
    dismissPendingMigrationFolders(folderNames)
    closeGlobalDialog()
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>{count === 1 ? copy.title : `Set up new datasets?`}</DialogTitle>
      </DialogHeader>

      {count > 1 ? (
        <p className='mt-12 text-13 text-neutral-700 text-pretty'>
          {count} folders in your datasets directory are not ready to open yet. Choose which ones to set up now —
          you can set up the rest later.
        </p>
      ) : (
        <p className='mt-12 text-13 text-neutral-700 text-pretty'>{copy.lead}</p>
      )}

      {count > 1 ? (
        <div className='mt-12 max-h-[280px] overflow-y-auto rounded-md border border-neutral-200'>
          <button
            type='button'
            onClick={toggleAll}
            className='flex w-full items-center gap-8 border-b border-neutral-200 bg-neutral-50 px-12 py-8 text-left text-12 font-medium text-neutral-600 hover:bg-neutral-100'
          >
            <input
              type='checkbox'
              checked={selectedCount === count}
              onChange={toggleAll}
              className='h-14 w-14 shrink-0 accent-current'
              onClick={(e) => e.stopPropagation()}
            />
            {selectedCount === count ? 'Deselect all' : 'Select all'}
            <span className='ml-auto text-neutral-400'>
              {selectedCount}/{count} selected
            </span>
          </button>

          <ul>
            {pending.map((item) => (
              <FolderRow
                key={item.folderName}
                item={item}
                isSelected={selected.has(item.folderName)}
                onToggle={() => toggleFolder(item.folderName)}
              />
            ))}
          </ul>
        </div>
      ) : (
        <p className='mt-8 text-13 text-neutral-600 text-pretty'>{copy.detail}</p>
      )}

      {errorMessage ? (
        <div
          role='alert'
          className='mt-12 rounded-md border border-red-200 bg-red-50 px-12 py-10 text-13 text-red-800 whitespace-pre-wrap'
        >
          {errorMessage}
        </div>
      ) : null}

      <DialogFooter className='mt-20'>
        <Button variant='outline' type='button' disabled={isMigrating} onClick={onDismissAll}>
          Not now
        </Button>
        <Button
          type='button'
          variant='primary'
          disabled={isMigrating || selectedItems.length === 0}
          onClick={() => void onConfirm()}
        >
          {isMigrating ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} />
              Setting up…
            </span>
          ) : count > 1 ? (
            `Set up ${selectedCount} selected`
          ) : (
            copy.confirmLabel
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}

function FolderRow(props: { item: PendingDatasetMigration; isSelected: boolean; onToggle: () => void }) {
  const { item, isSelected, onToggle } = props
  const kindLabel = describeSetupKind(item.kind)

  return (
    <li>
      <label
        className={cn(
          'flex w-full cursor-pointer items-center gap-8 border-b border-neutral-100 px-12 py-8 text-left last:border-b-0',
          'hover:bg-neutral-50',
        )}
      >
        <input
          type='checkbox'
          checked={isSelected}
          onChange={onToggle}
          className='h-14 w-14 shrink-0 accent-current'
        />
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-13 text-neutral-800'>{item.folderName}</span>
          <span className='block text-11 text-neutral-500'>{kindLabel}</span>
        </span>
      </label>
    </li>
  )
}

function describeSetupKind(kind: PendingDatasetMigration['kind']): string {
  switch (kind) {
    case 'mothbox-processed':
    case 'mothbox-processed-sibling':
      return 'Mothbox processed detections'
    case 'legacy-root':
    case 'source-only':
      return 'Legacy bot detection JSON'
    case 'ami':
      return 'AMI metadata + crops'
    default:
      return 'Ready to set up'
  }
}
