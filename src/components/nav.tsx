import { useStore } from '@nanostores/react'
import { useIsMutating } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Logo } from '~/components/logo'
import { Breadcrumbs } from '~/components/ui/breadcrumb'
import { deploymentsStore, nightsStore, projectsStore, sitesStore } from '~/stores/entities'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import {
  useChooseDatasetsFolderMutation,
  useConvertLegacyPackageMutation,
  useOpenDirectoryMutation,
  useRestoreDirectoryQuery,
} from '~/features/data-flow/1.ingest/files-queries'
import { isDirectoryPickerAvailable } from '~/features/data-flow/1.ingest/directory-picker'
import { datasetsWorkspaceStore } from '~/stores/datasets-workspace'
import { Loader } from '~/components/atomic/Loader'
import { Button } from '~/components/ui/button'
import { clearSelections } from '~/features/data-flow/1.ingest/files.service'
import { useMemo, useState } from 'react'
import { speciesListsStore, speciesListsLoadingStore } from '~/features/data-flow/2.identify/species-list.store'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'
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
import { deriveSiteFromDeploymentFolder, resolveNightEntityIdFromRoute } from '~/features/data-flow/1.ingest/ingest-paths'
import { toast } from 'sonner'
import {
  formatDatasetHealthAuditSummary,
  formatNightSummaryHealSummary,
  healNightSummaryNightIds,
  runDatasetHealthAudit,
} from '~/features/data-flow/3.persist/dataset-health'
// removed isLoadingFoldersStore usage here; loading is derived in root layout

export function Nav() {
  const projects = useStore(projectsStore)
  const sites = useStore(sitesStore)
  const deployments = useStore(deploymentsStore)
  const nights = useStore(nightsStore)
  const { pathname } = useRouterState({ select: (s) => s.location })
  const breadcrumbs = getBreadcrumbs({ pathname, projects, sites, deployments, nights })
  const selection = useStore(projectSpeciesSelectionStore)
  const speciesLists = useStore(speciesListsStore)
  const isSpeciesLoading = useStore(speciesListsLoadingStore)
  const session = useStore(userSessionStore)
  const [isAuditingDataset, setIsAuditingDataset] = useState(false)
  const [isHealingSummaries, setIsHealingSummaries] = useState(false)
  const activeProjectId = useMemo(() => (pathname.startsWith('/projects/') ? pathname.split('/')[2] : ''), [pathname])
  const activeSpeciesName = useMemo(() => {
    const listId = selection?.[activeProjectId]
    return listId ? speciesLists?.[listId]?.name : undefined
  }, [selection, activeProjectId, speciesLists])

  const restoreQuery = useRestoreDirectoryQuery()
  const workspace = useStore(datasetsWorkspaceStore)
  const activePackage = useStore(mothboxNextPackageStore)

  const isOpening = useIsMutating({ mutationKey: ['fs', 'open'] }) > 0
  const isImporting = useIsMutating({ mutationKey: ['fs', 'import-dataset-source'] }) > 0
  const isConverting = useIsMutating({ mutationKey: ['fs', 'convert-legacy-package'] }) > 0

  return (
    <header className='border-b bg-white'>
      <div className='flex flex-row items-center gap-4 px-20 py-3'>
        <Link to='/' className='text-xl font-semibold hover:opacity-80 mr-40'>
          <Logo size={30} />
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

        {restoreQuery.isLoading || isOpening || isImporting || isConverting ? (
          <div className='flex items-center gap-8 px-12 py-8 text-12 text-neutral-600 '>
            <Loader size={14} className='inline-block' />
            <span>
              {restoreQuery.isLoading
                ? '🌀 Restoring previously picked folder…'
                : isImporting || isConverting
                  ? '🌀 Importing dataset source…'
                  : '🌀 Processing selected folder…'}
            </span>
          </div>
        ) : null}
        <SpeciesPicker />

        <div className='ml-auto'>
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
      'Heal all night_summary.json files to canonical nightId format? This only updates summary nightId fields.',
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
  const datasetsMutation = useChooseDatasetsFolderMutation()
  const convertMutation = useConvertLegacyPackageMutation()
  const workspace = useStore(datasetsWorkspaceStore)
  const canPick = isDirectoryPickerAvailable()
  const busy = openMutation.isPending || datasetsMutation.isPending || convertMutation.isPending
  const hasDatasetsFolder = !!workspace?.folderName

  function onPickLegacy() {
    if (busy) return
    void openMutation.mutateAsync()
  }

  function onChooseDatasets() {
    if (busy) return
    void datasetsMutation.mutateAsync()
  }

  function onMigrateLegacy() {
    if (busy) return
    void convertMutation.mutateAsync()
  }

  return (
    <section className='flex max-w-[720px] flex-col gap-12'>
      <div className='rounded-md border border-neutral-200 bg-neutral-50 px-16 py-12 text-13 text-neutral-700'>
        <p className='font-medium text-neutral-900'>Migrate to Mothbox Next (recommended)</p>
        <ol className='mt-8 list-decimal space-y-6 pl-20'>
          <li>
            <span className='font-medium'>Datasets folder</span> — parent folder that will contain{' '}
            <span className='font-medium'>all</span> datasets (e.g. <code className='text-12'>~/Mothbox/datasets/</code>
            ).
          </li>
          <li>
            <span className='font-medium'>Legacy dataset folder</span> — one folder such as{' '}
            <code className='text-12'>Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20</code> (bot JSON +{' '}
            <code className='text-12'>patches/</code> inside), or a parent folder that contains several of those.
          </li>
          <li>
            The app <span className='font-medium'>copies</span> that dataset into{' '}
            <code className='text-12'>datasets/&lt;legacy-name&gt;/</code>:{' '}
            <code className='text-12'>00_source/</code> (full legacy tree),{' '}
            <code className='text-12'>01_patches/</code> (canonical images), records and classifications — then opens it.
            Your original folder is not deleted.
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
        <Button variant='outline' onClick={onMigrateLegacy} disabled={busy || !canPick}>
          {convertMutation.isPending ? (
            <span className='inline-flex items-center gap-6'>
              <Loader size={14} /> Migrating…
            </span>
          ) : (
            '2. Migrate legacy dataset…'
          )}
        </Button>
        <span className='text-12 text-neutral-600'>
          {hasDatasetsFolder ? (
            <>
              Datasets folder: <span className='font-medium text-neutral-800'>{workspace.folderName}</span>
            </>
          ) : (
            'Set the datasets folder before migrating.'
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
        <span className='text-12 text-neutral-500'>For datasets not migrated yet. Prefer steps 1–2 above.</span>
      </div>
    </section>
  )
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
  const nightId = parts[5]

  if (!nightId) return items
  const nightKey = resolveNightEntityIdFromRoute({
    nights,
    projectId,
    deploymentId,
    nightId,
  })
  const nightName = nights?.[nightKey]?.name ?? nightId
  items.push({
    label: nightName,
    entityName: 'Night',
    href: `/projects/${projectId}/deployments/${deploymentId}/nights/${nightId}`,
  })

  return items
}
