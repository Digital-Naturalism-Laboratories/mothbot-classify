import { useStore } from '@nanostores/react'
import { useIsMutating } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Logo } from '~/components/logo'
import { Breadcrumbs } from '~/components/ui/breadcrumb'
import { deploymentsStore, nightsStore, projectsStore, sitesStore } from '~/stores/entities'
import { useOpenDirectoryMutation, useRestoreDirectoryQuery } from '~/features/data-flow/1.ingest/files-queries'
import { Loader } from '~/components/atomic/Loader'
import { Button } from '~/components/ui/button'
import { clearSelections } from '~/features/data-flow/1.ingest/files.service'
import { useMemo, useState } from 'react'
import { MorphoCatalogDialog } from '~/features/catalogues/morphospecies/morpho-catalog-dialog'
import { SpeciesCatalogDialog } from '~/features/catalogues/species/species-catalog-dialog'
import { speciesListsStore, speciesListsLoadingStore } from '~/features/data-flow/2.identify/species-list.store'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'
import { SpeciesPicker } from '~/features/data-flow/2.identify/species-picker'
import { $isSpeciesPickerOpen, $speciesPickerProjectId } from '~/features/data-flow/2.identify/species-picker.state'
import { userSessionStore, clearUserSession } from '~/stores/ui'
import { useAppReady } from '~/features/data-flow/1.ingest/files-queries'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
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
  const appReady = useAppReady()
  const [isMorphoOpen, setIsMorphoOpen] = useState(false)
  const [isSpeciesOpen, setIsSpeciesOpen] = useState(false)
  const activeProjectId = useMemo(() => (pathname.startsWith('/projects/') ? pathname.split('/')[2] : ''), [pathname])
  const activeSpeciesName = useMemo(() => {
    const listId = selection?.[activeProjectId]
    return listId ? speciesLists?.[listId]?.name : undefined
  }, [selection, activeProjectId, speciesLists])

  const restoreQuery = useRestoreDirectoryQuery()

  const isOpening = useIsMutating({ mutationKey: ['fs', 'open'] }) > 0

  return (
    <header className='border-b bg-white'>
      <div className='flex flex-row items-center gap-4 px-20 py-3'>
        <Link to='/' className='text-xl font-semibold hover:opacity-80 mr-40'>
          <Logo size={30} />
        </Link>

        {breadcrumbs.length === 0 ? <FolderPicking /> : null}

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

        {restoreQuery.isLoading || isOpening ? (
          <div className='flex items-center gap-8 px-12 py-8 text-12 text-neutral-600 '>
            <Loader size={14} className='inline-block' />
            <span>{restoreQuery.isLoading ? '🌀 Restoring previously picked folder…' : '🌀 Processing selected folder…'}</span>
          </div>
        ) : null}
        <SpeciesPicker />

        <div className='ml-12 flex gap-8'>
          <Button
            variant='outline'
            onClick={() => {
              setIsSpeciesOpen(true)
            }}
          >
            Species
          </Button>
          <Button
            variant='outline'
            onClick={() => {
              setIsMorphoOpen(true)
            }}
          >
            Morphospecies
          </Button>
          <SpeciesCatalogDialog open={isSpeciesOpen} onOpenChange={setIsSpeciesOpen} />
          <MorphoCatalogDialog open={isMorphoOpen} onOpenChange={setIsMorphoOpen} />
        </div>

        <div className='ml-auto'>
          {appReady ? (
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
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function FolderPicking() {
  const openMutation = useOpenDirectoryMutation()

  function onClear() {
    clearSelections()
  }
  function onPick() {
    if (openMutation.isPending) return
    void openMutation.mutateAsync()
  }

  return (
    <section className='flex flex-wrap items-center gap-3'>
      <Button onClick={onPick} disabled={openMutation.isPending}>
        {openMutation.isPending ? (
          <span className='inline-flex items-center gap-6'>
            <Loader size={14} /> Processing…
          </span>
        ) : (
          'Pick projects folder'
        )}
      </Button>
      <Button onClick={onClear}>Clear</Button>
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
  const siteId = parts[3]

  if (!siteId) return items
  const siteKey = `${projectId}/${siteId}`
  const siteName = sites?.[siteKey]?.name ?? siteId
  items.push({ label: siteName, entityName: 'Site' })

  if (parts.length <= 5) return items
  const deploymentId = parts[5]

  if (!deploymentId) return items
  const depKey = `${projectId}/${siteId}/${deploymentId}`
  const deploymentName = deployments?.[depKey]?.name ?? deploymentId
  items.push({ label: deploymentName, entityName: 'Deployment' })

  if (parts.length <= 7) return items
  const nightId = parts[7]

  if (!nightId) return items
  const nightKey = `${projectId}/${siteId}/${deploymentId}/${nightId}`
  const nightName = nights?.[nightKey]?.name ?? nightId
  items.push({
    label: nightName,
    entityName: 'Night',
    href: `/projects/${projectId}/sites/${siteId}/deployments/${deploymentId}/nights/${nightId}`,
  })

  return items
}
