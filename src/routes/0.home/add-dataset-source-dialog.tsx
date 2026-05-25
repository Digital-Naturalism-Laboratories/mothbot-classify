import { useStore } from '@nanostores/react'
import { Loader } from '~/components/atomic/Loader'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { isDirectoryPickerAvailable } from '~/features/data-flow/1.ingest/directory-picker'
import {
  useChooseDatasetsFolderMutation,
  useImportDatasetSourceMutation,
} from '~/features/data-flow/1.ingest/files-queries'
import { datasetsWorkspaceStore } from '~/stores/datasets-workspace'

type AddDatasetSourceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddDatasetSourceDialog(props: AddDatasetSourceDialogProps) {
  const { open, onOpenChange } = props
  const workspace = useStore(datasetsWorkspaceStore)
  const chooseDatasetsFolderMutation = useChooseDatasetsFolderMutation()
  const importMutation = useImportDatasetSourceMutation()

  const canPick = isDirectoryPickerAvailable()
  const hasDatasetsFolder = !!workspace?.folderName
  const busy = chooseDatasetsFolderMutation.isPending || importMutation.isPending

  function onClose() {
    if (busy) return
    onOpenChange(false)
  }

  async function onChooseDatasetsFolder() {
    if (busy) return
    await chooseDatasetsFolderMutation.mutateAsync()
  }

  async function onImport() {
    if (busy) return
    const result = await importMutation.mutateAsync()
    if (result.ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Add new Dataset Source</DialogTitle>
          <DialogDescription className='text-pretty'>
            Pick a folder that contains a Mothbox dataset. We will detect whether it’s already a clean Mothbox-next
            package (a folder with <code className='text-12'>dataset.json</code>) or a legacy capture folder that needs
            to be converted.
          </DialogDescription>
        </DialogHeader>

        <DatasetsFolderRow
          folderName={workspace?.folderName}
          onChoose={onChooseDatasetsFolder}
          choosing={chooseDatasetsFolderMutation.isPending}
          disabled={busy || !canPick}
        />

        <div className='flex flex-col gap-8 pt-4'>
          <Button onClick={onImport} disabled={busy || !canPick || !hasDatasetsFolder}>
            {importMutation.isPending ? (
              <span className='inline-flex items-center gap-6'>
                <Loader size={14} /> Importing…
              </span>
            ) : (
              'Choose source folder…'
            )}
          </Button>
          {!hasDatasetsFolder ? (
            <p className='text-12 text-neutral-500'>Set a datasets folder first to receive imported packages.</p>
          ) : null}
          {!canPick ? (
            <p className='text-12 text-red-600'>Your browser doesn’t support the folder picker.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

type DatasetsFolderRowProps = {
  folderName?: string
  onChoose: () => void | Promise<void>
  choosing: boolean
  disabled: boolean
}

function DatasetsFolderRow(props: DatasetsFolderRowProps) {
  const { folderName, onChoose, choosing, disabled } = props
  const hasFolder = !!folderName

  return (
    <div className='rounded-md border border-neutral-200 bg-neutral-50 px-12 py-8'>
      <div className='flex items-center justify-between gap-12'>
        <div className='min-w-0'>
          <div className='text-12 font-medium text-neutral-700'>Datasets folder</div>
          <div className='truncate text-13 text-neutral-900'>
            {hasFolder ? folderName : <span className='text-neutral-500'>Not set</span>}
          </div>
        </div>
        <Button variant='outline' size='xsm' onClick={onChoose} disabled={disabled}>
          {choosing ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={12} /> Choosing…
            </span>
          ) : hasFolder ? (
            'Change…'
          ) : (
            'Choose…'
          )}
        </Button>
      </div>
    </div>
  )
}
