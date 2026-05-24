import { useStore } from '@nanostores/react'
import { useIsMutating } from '@tanstack/react-query'
import { useState } from 'react'
import { Loader } from '~/components/atomic/Loader'
import { Button } from '~/components/ui/button'
import { useOpenDatasetMutation } from '~/features/data-flow/1.ingest/files-queries'
import { AddDatasetSourceDialog } from './add-dataset-source-dialog'
import {
  activeDatasetFolderNameStore,
  datasetsRegistryStore,
  type DatasetRegistryEntry,
} from '~/stores/datasets-registry'
import { cn } from '~/utils/cn'

export function HomeDatasetsPanel() {
  const registry = useStore(datasetsRegistryStore)
  const activeFolderName = useStore(activeDatasetFolderNameStore)
  const openMutation = useOpenDatasetMutation()
  const isOpeningDataset = useIsMutating({ mutationKey: ['fs', 'open-dataset'] }) > 0
  const openingFolderName = openMutation.isPending ? openMutation.variables?.folderName : undefined
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false)

  function onSelectDataset(folderName: string) {
    if (openMutation.isPending) return
    if (folderName === activeFolderName) return
    openMutation.mutate({ folderName })
  }

  return (
    <div className='shadow-border flex min-h-0 flex-1 flex-col rounded-2xl bg-white p-12'>
      <h3 className='mb-8 shrink-0 text-16 font-semibold text-balance'>Datasets</h3>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        {registry.length === 0 ? (
          <p className='text-13 text-neutral-500 text-pretty'>
            No packages found. Choose a datasets folder in the menu, then add one below.
          </p>
        ) : (
          <ul className='flex flex-col gap-4'>
            {registry.map((entry) => (
              <DatasetListItem
                key={entry.folderName}
                entry={entry}
                isActive={entry.folderName === activeFolderName}
                isOpening={entry.folderName === openingFolderName}
                disabled={isOpeningDataset}
                onSelect={onSelectDataset}
              />
            ))}
          </ul>
        )}
      </div>

      <Button
        variant='outline'
        size='xxsm'
        type='button'
        className='mt-12 w-full shrink-0'
        onClick={() => setIsAddSourceOpen(true)}
      >
        + Add new Dataset Source
      </Button>
      <AddDatasetSourceDialog open={isAddSourceOpen} onOpenChange={setIsAddSourceOpen} />
    </div>
  )
}

type DatasetListItemProps = {
  entry: DatasetRegistryEntry
  isActive: boolean
  isOpening: boolean
  disabled: boolean
  onSelect: (folderName: string) => void
}

function DatasetListItem(props: DatasetListItemProps) {
  const { entry, isActive, isOpening, disabled, onSelect } = props

  return (
    <li>
      <button
        type='button'
        disabled={disabled && !isOpening}
        onClick={() => onSelect(entry.folderName)}
        className={cn(
          'w-full rounded-md px-8 py-8 text-left text-13',
          'transition-[background-color,color,scale] duration-150 ease-out',
          'active:not-disabled:scale-[0.96]',
          isActive ? 'bg-neutral-100 font-medium text-neutral-900' : 'text-neutral-700 hover:bg-neutral-50',
          disabled && !isOpening ? 'cursor-wait opacity-70' : 'cursor-pointer',
        )}
      >
        <div className='flex items-start justify-between gap-8'>
          <div className='min-w-0 flex-1'>
            <div className='truncate'>{entry.folderName}</div>
            {entry.datasetId && entry.datasetId !== entry.folderName ? (
              <div className='truncate text-12 text-neutral-500'>{entry.datasetId}</div>
            ) : null}
          </div>
          {isOpening ? (
            <span className='inline-flex shrink-0 items-center gap-4 text-12 text-neutral-500'>
              <Loader size={12} />
            </span>
          ) : null}
        </div>
      </button>
    </li>
  )
}
