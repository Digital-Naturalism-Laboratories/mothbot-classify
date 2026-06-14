import { useStore } from '@nanostores/react'
import { EllipsisIcon, FolderOpenIcon, RefreshCwIcon } from 'lucide-react'
import { Loader } from '~/components/atomic/Loader'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { isDirectoryPickerLikelySupported, pickDirectoryHandle } from '~/features/data-flow/1.ingest/directory-picker'
import {
  useSetupDatasetsFolderMutation,
  useOpenDatasetMutation,
  useScanDatasetsFolderMutation,
} from '~/features/data-flow/1.ingest/files-queries'
import {
  activeDatasetFolderNameStore,
  datasetsRegistryStore,
  type DatasetRegistryEntry,
} from '~/stores/datasets-registry'
import { isMothboxNextPackageOpen } from '~/features/mothbox-next/active-package'
import { datasetsWorkspaceStore } from '~/stores/datasets-workspace'
import { cn } from '~/utils/cn'

export function HomeDatasetsPanel() {
  const registry = useStore(datasetsRegistryStore)
  const workspace = useStore(datasetsWorkspaceStore)
  const activeFolderName = useStore(activeDatasetFolderNameStore)
  const openMutation = useOpenDatasetMutation()
  const setupMutation = useSetupDatasetsFolderMutation()
  const scanMutation = useScanDatasetsFolderMutation()
  const isScanning = scanMutation.isPending
  const isChoosing = setupMutation.isPending
  const openingFolderName = openMutation.isPending ? openMutation.variables?.folderName : undefined

  function onSelectDataset(folderName: string) {
    if (openMutation.isPending) return
    if (folderName === activeFolderName && isMothboxNextPackageOpen()) return
    openMutation.mutate({ folderName })
  }

  // Called directly from the click handler so showDirectoryPicker fires inside
  // the user gesture — required by Firefox (and good practice everywhere).
  async function onChooseFolder() {
    if (isChoosing) return
    const handle = await pickDirectoryHandle({ mode: 'readwrite', title: 'datasets folder' })
    if (!handle) return
    setupMutation.mutate(handle)
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
                disabled={isScanning}
                onSelect={onSelectDataset}
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
  disabled: boolean
  onSelect: (folderName: string) => void
}

function DatasetListItem(props: DatasetListItemProps) {
  const { entry, isActive, isOpening, disabled, onSelect } = props

  return (
    <li className='mx-8'>
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
