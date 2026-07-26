import { useStore } from '@nanostores/react'
import { useIsMutating } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Logo } from '~/components/logo'
import { Breadcrumbs } from '~/components/ui/breadcrumb'
import { deploymentsStore, leafGroupsStore, projectsStore, sitesStore } from '~/stores/entities'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import {
  useSetupDatasetsFolderMutation,
  useOpenDirectoryMutation,
  useRestoreDirectoryQuery,
  useScanDatasetsFolderMutation,
  useAppLoading,
} from '~/features/data-flow/1.ingest/files-queries'
import { cancelDatasetAutoLoad } from '~/features/data-flow/1.ingest/dataset-auto-load'
import { isDirectoryPickerAvailable, pickDirectoryHandle } from '~/features/data-flow/1.ingest/directory-picker'
import { datasetsWorkspaceStore } from '~/stores/datasets-workspace'
import { Loader } from '~/components/atomic/Loader'
import { Button } from '~/components/ui/button'
import { clearSelections } from '~/features/data-flow/1.ingest/files.service'
import { useMemo, useState } from 'react'
import { speciesListsStore, speciesListsLoadingStore } from '~/features/data-flow/2.identify/species-list.store'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'
import { MorphoCatalogDialog } from '~/features/catalogues/morphospecies/morpho-catalog-dialog'
import { SpeciesCatalogDialog } from '~/features/catalogues/species/species-catalog-dialog'
import { SpeciesPicker } from '~/features/data-flow/2.identify/species-picker'
import { $isSpeciesPickerOpen, $speciesPickerProjectId } from '~/features/data-flow/2.identify/species-picker.state'
import { userSessionStore, clearUserSession } from '~/stores/ui'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { deriveSiteFromDeploymentFolder, resolveLeafGroupEntityIdFromRoute } from '~/features/data-flow/1.ingest/ingest-paths'
import { buildHierarchyBreadcrumbs } from '~/features/mothbox-next/build-hierarchy-breadcrumbs'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'
import { toast } from 'sonner'
import {
  formatDatasetHealthAuditSummary,
  formatNightSummaryHealSummary,
  healNightSummaryNightIds,
  runDatasetHealthAudit,
} from '~/features/data-flow/3.persist/dataset-health'
import { AppDocsPeek, AppDocsPeekTrigger } from '~/components/app-docs-peek'
// removed isLoadingFoldersStore usage here; loading is derived in root layout

export function Nav() {
  const projects = useStore(projectsStore)
  const sites = useStore(sitesStore)
  const deployments = useStore(deploymentsStore)
  const nights = useStore(leafGroupsStore)
  const { pathname } = useRouterState({ select: (s) => s.location })
  const resolvedHierarchy = useStore(activeHierarchyStore)
  const folderName = useStore(activeDatasetFolderNameStore)
  const breadcrumbs =
    resolvedHierarchy && (pathname.startsWith('/projects/') || pathname.startsWith('/datasets/'))
      ? buildHierarchyBreadcrumbs({
          pathname,
          resolved: resolvedHierarchy,
          folderName,
          nights,
        })
      : getBreadcrumbs({ pathname, projects, sites, deployments, nights })
  const selection = useStore(projectSpeciesSelectionStore)
  const speciesLists = useStore(speciesListsStore)
  const isSpeciesLoading = useStore(speciesListsLoadingStore)
  const session = useStore(userSessionStore)
  const [isAuditingDataset, setIsAuditingDataset] = useState(false)
  const [isHealingSummaries, setIsHealingSummaries] = useState(false)
  const [isSpeciesOpen, setIsSpeciesOpen] = useState(false)
  const [isMorphoOpen, setIsMorphoOpen] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)
  const activeProjectId = useMemo(() => {
    if (pathname.startsWith('/projects/')) return pathname.split('/')[2] ?? ''
    if (pathname.startsWith('/datasets/')) return Object.keys(projects ?? {})[0] ?? ''
    return ''
  }, [pathname, projects])
  const catalogInitialScope = activeProjectId ? 'project' : 'all'
  const activeSpeciesName = useMemo(() => {
    const listId = selection?.[activeProjectId]
    return listId ? speciesLists?.[listId]?.name : undefined
  }, [selection, activeProjectId, speciesLists])

  const restoreQuery = useRestoreDirectoryQuery()
  const workspace = useStore(datasetsWorkspaceStore)
  const activePackage = useStore(mothboxNextPackageStore)

  const isOpening = useIsMutating({ mutationKey: ['fs', 'open'] }) > 0
  const isScanningDatasets = useIsMutating({ mutationKey: ['fs', 'scan-datasets'] }) > 0
  const { isWarmingDataset } = useAppLoading()
  const folderStatus = getFolderStatusMessage({
    restoring: restoreQuery.isLoading,
    scanning: isScanningDatasets,
    opening: isOpening,
  })
  // Show a stop control whenever the previous dataset is auto-loading, including
  // the background warm phase (not covered by getFolderStatusMessage).
  const loadingDatasetMessage = folderStatus ?? (isWarmingDataset ? '🌀 Opening previous dataset…' : null)
  const canStopAutoLoad = restoreQuery.isLoading || isWarmingDataset

  return (
    <header className='border-b bg-white'>
      <div className='flex h-[54px] flex-row items-center gap-4 px-20'>
        <Link to='/' className='text-xl font-semibold hover:opacity-80 mr-40 flex items-center gap-6'>
          <Logo size={30} />
          <span
            className='font-mono font-normal text-neutral-400 select-none'
            style={{ fontSize: '7px' }}
          >
            v{__APP_VERSION__}
          </span>
        </Link>

        {breadcrumbs.length === 0 && workspace?.folderName ? (
          <span className='text-12 text-neutral-600'>
            Datasets folder: <span className='font-medium text-neutral-800'>{workspace.folderName}</span>
          </span>
        ) : null}

        <div className='justify-self-center relative top-4 flex items-center gap-12'>
          {breadcrumbs.length ? <Breadcrumbs breadcrumbs={breadcrumbs} /> : null}
          {activeProjectId ? (
            isSpeciesLoading ? (
              <div className='flex items-center gap-8 px-8 py-4 text-12 text-neutral-600'>
                <Loader size={14} className='inline-block' />
                <span>🌀 Loading species lists…</span>
              </div>
            ) : (
              <button
                className='text-12 px-8 py-4 rounded border hover:bg-neutral-50'
                onClick={() => {
                  $speciesPickerProjectId.set(activeProjectId)
                  $isSpeciesPickerOpen.set(true)
                }}
              >
                Species: {activeSpeciesName ?? 'Select…'}
              </button>
            )
          ) : null}
        </div>

        {loadingDatasetMessage ? (
          <div className='flex min-w-0 items-center gap-8 text-12 text-neutral-600' aria-live='polite' aria-busy>
            <Loader size={14} className='inline-block shrink-0' />
            <span className='truncate whitespace-nowrap'>{loadingDatasetMessage}</span>
            {canStopAutoLoad ? (
              <button
                className='shrink-0 rounded border border-red-300 px-6 py-2 text-11 font-medium text-red-600 hover:bg-red-50'
                onClick={() => cancelDatasetAutoLoad()}
                title="Stop loading and don't auto-open this dataset next time"
              >
                Stop
              </button>
            ) : null}
          </div>
        ) : null}
        <SpeciesPicker />

        <div className='ml-12 flex gap-8'>
          <Button variant='outline' onClick={() => setIsSpeciesOpen(true)}>
            Species
          </Button>
          <Button variant='outline' onClick={() => setIsMorphoOpen(true)}>
            Morphospecies
          </Button>
          <SpeciesCatalogDialog
            open={isSpeciesOpen}
            onOpenChange={setIsSpeciesOpen}
            projectIdOverride={activeProjectId || undefined}
            initialScope={catalogInitialScope}
          />
          <MorphoCatalogDialog
            open={isMorphoOpen}
            onOpenChange={setIsMorphoOpen}
            projectIdOverride={activeProjectId || undefined}
            initialScope={catalogInitialScope}
          />
        </div>

        <div className='ml-auto flex items-center gap-8'>
          <AppDocsPeekTrigger onOpen={() => setDocsOpen(true)} />
          <AppDocsPeek open={docsOpen} onOpenChange={setDocsOpen} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className='rounded-full border hover:bg-neutral-50 p-2'>
                <Avatar>
                  <AvatarFallback>{(session?.initials || '?').toUpperCase()}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => void clearUserSession()}>Change user name…</DropdownMenuItem>
              <DropdownMenuItem onClick={clearSelections}>Clear</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={isAuditingDataset} onClick={onAuditDataset}>
                {isAuditingDataset ? 'Auditing Dataset…' : 'Audit Dataset'}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isHealingSummaries || !!activePackage}
                onClick={onHealSummaries}
              >
                {isHealingSummaries ? 'Healing Summaries…' : 'Heal Summaries'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )

  function onAuditDataset() {
    if (isAuditingDataset) return
    setIsAuditingDataset(true)
    const promise = runDatasetHealthAudit()
    toast.promise(promise, {
      loading: '🧪 Auditing dataset health…',
      success: (report) => {
        console.log('✅ Dataset audit report', report)
        return `✅ Dataset audit complete: ${formatDatasetHealthAuditSummary(report)}`
      },
      error: '🚨 Failed to audit dataset health',
    })
    void promise.finally(() => setIsAuditingDataset(false))
  }

  function onHealSummaries() {
    if (isHealingSummaries) return
    if (activePackage) {
      toast.message('Not available for Mothbox Next packages', {
        description: 'night_summary.json heal applies to legacy folder layouts only.',
      })
      return
    }
    const shouldProceed = window.confirm(
      'Heal all night_summary.json files to canonical leafGroupId format? This only updates summary leafGroupId fields.',
    )
    if (!shouldProceed) return

    setIsHealingSummaries(true)
    const promise = healNightSummaryNightIds()
    toast.promise(promise, {
      loading: '🛠️ Healing night_summary IDs…',
      success: (report) => {
        console.log('✅ Night summary heal report', report)
        return `✅ Summary heal complete: ${formatNightSummaryHealSummary(report)}`
      },
      error: '🚨 Failed to heal night summaries',
    })
    void promise.finally(() => setIsHealingSummaries(false))
  }
}

export function FolderPicking() {
  const openMutation = useOpenDirectoryMutation()
  const datasetsMutation = useSetupDatasetsFolderMutation()
  const scanMutation = useScanDatasetsFolderMutation()
  const workspace = useStore(datasetsWorkspaceStore)
  const canPick = isDirectoryPickerAvailable()
  const busy = openMutation.isPending || datasetsMutation.isPending || scanMutation.isPending
  const hasDatasetsFolder = !!workspace?.folderName

  function onPickLegacy() {
    if (busy) return
    void openMutation.mutateAsync()
  }

  async function onChooseDatasets() {
    if (busy) return
    const handle = await pickDirectoryHandle({ mode: 'readwrite', title: 'datasets folder' })
    if (!handle) return
    void datasetsMutation.mutateAsync(handle)
  }

  function onRefreshDatasets() {
    if (busy) return
    void scanMutation.mutateAsync()
  }

  return (
    <section className='flex max-w-[720px] flex-col gap-12'>
      <div className='rounded-md border border-neutral-200 bg-neutral-50 px-16 py-12 text-13 text-neutral-700'>
        <p className='font-medium text-neutral-900'>Migrate to Mothbox Next (recommended)</p>
        <ol className='mt-8 list-decimal space-y-6 pl-20'>
          <li>
            <span className='font-medium'>Datasets folder</span> — parent folder that will contain{' '}
            <span className='font-medium'>all</span> datasets (e.g.{' '}
            <code className='text-12'>~/Mothbox/datasets/</code> on macOS/Linux,{' '}
            <code className='text-12'>C:\Users\You\Mothbox\datasets\</code> on Windows).
          </li>
          <li>
            <span className='font-medium'>Add a dataset</span> — copy or move a legacy folder (bot JSON +{' '}
            <code className='text-12'>patches/</code>) or an existing package into your datasets folder with your file
            manager.
          </li>
          <li>
            Reload the app or click <span className='font-medium'>Refresh datasets</span> after adding new dataset
            folders.
          </li>
        </ol>
      </div>

      <div className='flex flex-wrap items-center gap-12'>
        <Button onClick={onChooseDatasets} disabled={busy || !canPick}>
          {datasetsMutation.isPending ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} /> Choosing…
            </span>
          ) : (
            '1. Choose datasets folder…'
          )}
        </Button>
        <Button variant='outline' onClick={onRefreshDatasets} disabled={busy || !canPick || !hasDatasetsFolder}>
          {scanMutation.isPending ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} /> Scanning…
            </span>
          ) : (
            '2. Refresh datasets'
          )}
        </Button>
        <span className='text-12 text-neutral-600'>
          {hasDatasetsFolder ? (
            <>
              Datasets folder: <span className='font-medium text-neutral-800'>{workspace.folderName}</span>
            </>
          ) : (
            'Set the datasets folder, then drop dataset folders into it.'
          )}
        </span>
      </div>

      <div className='flex flex-wrap items-center gap-12 border-t border-neutral-100 pt-12'>
        <Button variant='ghost' size='sm' onClick={onPickLegacy} disabled={busy || !canPick}>
          {openMutation.isPending ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} /> Opening…
            </span>
          ) : (
            'Open legacy folder (old mode)'
          )}
        </Button>
        <span className='text-12 text-neutral-500'>For datasets outside your datasets folder. Prefer drag-and-drop + refresh.</span>
      </div>
    </section>
  )
}

function getFolderStatusMessage(params: {
  restoring: boolean
  scanning: boolean
  opening: boolean
}): string | null {
  const { restoring, scanning, opening } = params
  if (restoring) return '🌀 Restoring previously picked folder…'
  if (scanning) return '🌀 Scanning datasets folder…'
  if (opening) return '🌀 Processing selected folder…'
  return null
}

function getBreadcrumbs(params: {
  pathname: string
  projects: Record<string, { id: string; name: string }>
  sites: Record<string, { id: string; name: string }>
  deployments: Record<string, { id: string; name: string }>
  nights: Record<string, { id: string; name: string }>
}) {
  const { pathname, projects, sites, deployments, nights } = params
  const parts = (pathname ?? '').replace(/^\/+/, '').split('/').filter(Boolean)
  if (parts.length === 0) return []
  if (parts[0] !== 'projects') return []

  const items: Array<{ href?: string; label: string; entityName?: string }> = []
  if (parts.length === 1) return items

  const projectId = parts[1]
  if (!projectId) return items
  const projectName = projects?.[projectId]?.name ?? projectId
  items.push({ label: projectName, entityName: 'Project' })

  if (parts.length <= 3) return items
  const deploymentId = parts[3]

  if (!deploymentId) return items
  const depKey = `${projectId}/${deploymentId}`
  const deploymentName = deployments?.[depKey]?.name ?? deploymentId
  const derivedSite = deriveSiteFromDeploymentFolder(deploymentName)
  const siteKey = `${projectId}/${derivedSite}`
  const siteName = sites?.[siteKey]?.name ?? derivedSite
  if (siteName) items.push({ label: siteName, entityName: 'Site' })
  items.push({ label: deploymentName, entityName: 'Deployment' })

  if (parts.length <= 5) return items
  const leafGroupId = parts[5]

  if (!leafGroupId) return items
  const nightKey = resolveLeafGroupEntityIdFromRoute({
    nights,
    projectId,
    deploymentId,
    leafGroupId,
  })
  const nightName = nights?.[nightKey]?.name ?? leafGroupId
  items.push({
    label: nightName,
    entityName: 'Night',
    href: `/projects/${projectId}/deployments/${deploymentId}/nights/${leafGroupId}`,
  })

  return items
}
