import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { EllipsisIcon, FolderOpenIcon, RefreshCwIcon, RotateCcwIcon } from 'lucide-react'
import { Loader } from '~/components/atomic/Loader'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '~/components/ui/context-menu'
import { isDirectoryPickerLikelySupported, pickDirectoryHandle } from '~/features/data-flow/1.ingest/directory-picker'
import {
  useSetupDatasetsFolderMutation,
  useOpenDatasetMutation,
  useScanDatasetsFolderMutation,
  useResetDatasetMutation,
} from '~/features/data-flow/1.ingest/files-queries'
import {
  activeDatasetFolderNameStore,
  datasetsRegistryStore,
  type DatasetRegistryEntry,
} from '~/stores/datasets-registry'
import { isMothboxNextPackageOpen } from '~/features/mothbox-next/active-package'
import { datasetsWorkspaceStore } from '~/stores/datasets-workspace'
import { cn } from '~/utils/cn'
import { openGlobalDialog, closeGlobalDialog } from '~/components/dialogs/global-dialog'
import { DialogHeader, DialogTitle, DialogFooter } from '~/components/ui/dialog'

export function HomeDatasetsPanel() {
  const registry = useStore(datasetsRegistryStore)
  const workspace = useStore(datasetsWorkspaceStore)
  const activeFolderName = useStore(activeDatasetFolderNameStore)
  const openMutation = useOpenDatasetMutation()
  const setupMutation = useSetupDatasetsFolderMutation()
  const scanMutation = useScanDatasetsFolderMutation()
  const resetMutation = useResetDatasetMutation()
  const isScanning = scanMutation.isPending
  const isChoosing = setupMutation.isPending
  const openingFolderName = openMutation.isPending ? openMutation.variables?.folderName : undefined

  function onSelectDataset(folderName: string) {
    if (openMutation.isPending) return
    if (folderName === activeFolderName && isMothboxNextPackageOpen()) return
    openMutation.mutate({ folderName })
  }

  async function onChooseFolder() {
    if (isChoosing) return
    const handle = await pickDirectoryHandle({ mode: 'readwrite', title: 'datasets folder' })
    if (!handle) return
    setupMutation.mutate(handle)
  }

  function onResetDataset(folderName: string) {
    openGlobalDialog({
      component: ResetDatasetConfirmDialog,
      props: {
        folderName,
        onConfirm: () => {
          closeGlobalDialog()
          resetMutation.mutate({ folderName })
        },
      },
      align: 'center',
      className: 'max-w-[400px]',
    })
  }

  return (
    <div className='shadow-border flex min-h-0 flex-1 flex-col rounded-2xl bg-white p-0 pb-16'>
      <div className='mb-8 flex shrink-0 items-center justify-between gap-8 px-16 pt-16'>
        <h3 className='text-16 font-semibold text-balance'>Datasets</h3>
        <DatasetsPanelMenu
          hasDatasetsFolder={!!workspace?.folderName}
          isScanning={isScanning}
          isChoosing={isChoosing}
          onRefresh={() => void scanMutation.mutateAsync()}
          onChooseFolder={() => void onChooseFolder()}
        />
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        {registry.length === 0 ? (
          <p className='mx-8 px-8 text-13 text-neutral-500 text-pretty'>
            {workspace?.folderName ? (
              <>
                Drag a dataset folder into{' '}
                <span className='font-medium text-neutral-700'>{workspace.folderName}</span>, then refresh or return
                to the app to set it up.
              </>
            ) : (
              <>Use ⋯ → Choose datasets folder, then drop dataset folders into it.</>
            )}
          </p>
        ) : (
          <ul className='flex w-full flex-col gap-4'>
            {registry.map((entry) => (
              <DatasetListItem
                key={entry.folderName}
                entry={entry}
                isActive={entry.folderName === activeFolderName}
                isOpening={entry.folderName === openingFolderName}
                isResetting={resetMutation.isPending && resetMutation.variables?.folderName === entry.folderName}
                disabled={isScanning || resetMutation.isPending}
                onSelect={onSelectDataset}
                onReset={onResetDataset}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

type DatasetsPanelMenuProps = {
  hasDatasetsFolder: boolean
  isScanning: boolean
  isChoosing: boolean
  onRefresh: () => void
  onChooseFolder: () => void
}

function DatasetsPanelMenu(props: DatasetsPanelMenuProps) {
  const { hasDatasetsFolder, isScanning, isChoosing, onRefresh, onChooseFolder } = props
  const canPick = isDirectoryPickerLikelySupported()
  const busy = isScanning || isChoosing

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size='icon-sm' variant='ghostMuted' aria-label='Dataset actions' icon={EllipsisIcon} />
      </DropdownMenuTrigger>

      <DropdownMenuContent side='right' align='start' sideOffset={4}>
        <DropdownMenuItem disabled={busy || !canPick} onSelect={onChooseFolder}>
          <DropdownMenuItemLabel
            icon={isChoosing ? <Loader size={14} /> : <FolderOpenIcon className='h-14 w-14' />}
            label={isChoosing ? 'Choosing…' : 'Choose datasets folder'}
          />
        </DropdownMenuItem>

        <DropdownMenuItem disabled={busy || !canPick || !hasDatasetsFolder} onSelect={onRefresh}>
          <DropdownMenuItemLabel
            icon={isScanning ? <Loader size={14} /> : <RefreshCwIcon className='h-14 w-14' />}
            label={isScanning ? 'Scanning…' : 'Refresh datasets'}
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type DropdownMenuItemLabelProps = {
  icon: React.ReactNode
  label: string
}

function DropdownMenuItemLabel(props: DropdownMenuItemLabelProps) {
  const { icon, label } = props

  return (
    <span className='inline-flex items-center gap-8'>
      <span className='flex h-14 w-14 shrink-0 items-center justify-center text-neutral-500'>{icon}</span>
      {label}
    </span>
  )
}

type DatasetListItemProps = {
  entry: DatasetRegistryEntry
  isActive: boolean
  isOpening: boolean
  isResetting: boolean
  disabled: boolean
  onSelect: (folderName: string) => void
  onReset: (folderName: string) => void
}

function DatasetListItem(props: DatasetListItemProps) {
  const { entry, isActive, isOpening, isResetting, disabled, onSelect, onReset } = props

  return (
    <li className='mx-8'>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type='button'
            disabled={disabled}
            onClick={() => onSelect(entry.folderName)}
            className={cn(
              'w-full rounded-md px-8 py-8 text-left text-13',
              'transition-[background-color,color,scale] duration-150 ease-out',
              'active:not-disabled:scale-[0.96]',
              isActive ? 'bg-neutral-100 font-medium text-neutral-900' : 'text-neutral-700 hover:bg-neutral-50',
              disabled ? 'cursor-wait opacity-70' : 'cursor-pointer',
            )}
          >
            <div className='flex items-start justify-between gap-8'>
              <div className='min-w-0 flex-1'>
                <div className='truncate'>{entry.folderName}</div>
                {entry.datasetId && entry.datasetId !== entry.folderName ? (
                  <div className='truncate text-12 text-neutral-500'>{entry.datasetId}</div>
                ) : null}
              </div>
              {isOpening || isResetting ? (
                <span className='inline-flex shrink-0 items-center gap-4 text-12 text-neutral-500'>
                  <Loader size={12} />
                </span>
              ) : null}
            </div>
          </button>
        </ContextMenuTrigger>

        <ContextMenuContent className='w-[200px]'>
          <ContextMenuItem onSelect={() => onSelect(entry.folderName)} disabled={disabled}>
            <span className='inline-flex items-center gap-8'>
              <FolderOpenIcon className='h-14 w-14 text-neutral-500' />
              Open
            </span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => onReset(entry.folderName)}
            disabled={disabled}
            className='text-red-600 focus:text-red-700'
          >
            <span className='inline-flex items-center gap-8'>
              <RotateCcwIcon className='h-14 w-14' />
              Reset dataset
            </span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  )
}

function ResetDatasetConfirmDialog(props: { folderName: string; onConfirm: () => void }) {
  const { folderName, onConfirm } = props
  const [confirming, setConfirming] = useState(false)

  async function handleConfirm() {
    setConfirming(true)
    onConfirm()
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Reset "{folderName}"?</DialogTitle>
      </DialogHeader>

      <p className='mt-12 text-13 text-neutral-700 text-pretty'>
        This removes all files Classify added to this dataset — the manifest, records, and classifications. Your
        original source images, patches, and detection JSON files are not affected.
      </p>
      <p className='mt-8 text-13 text-neutral-500 text-pretty'>
        After resetting, you can run Set up again to re-index the dataset from scratch. This is useful if the
        underlying processed data has changed.
      </p>

      <DialogFooter className='mt-20'>
        <Button variant='outline' type='button' disabled={confirming} onClick={closeGlobalDialog}>
          Cancel
        </Button>
        <Button
          type='button'
          variant='primary'
          disabled={confirming}
          className='bg-red-600 hover:bg-red-700 focus:ring-red-500'
          onClick={() => void handleConfirm()}
        >
          {confirming ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} />
              Resetting…
            </span>
          ) : (
            'Reset dataset'
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
