import { useStore } from '@nanostores/react'
import { Link } from '@tanstack/react-router'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { DownloadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { exportScopeDarwinCSV } from '~/features/data-flow/4.export/export-orchestrator'
import { CenteredLoader } from '~/components/atomic/CenteredLoader'
import { Loader } from '~/components/atomic/Loader'
import {
  expandDisclosurePanelId,
  ExpandDisclosurePanel,
  ExpandDisclosureTitleRow,
} from '~/components/atomic/expand-disclosure'
import { Button } from '~/components/ui/button'
import { MorphoCatalogDialog } from '~/features/catalogues/morphospecies/morpho-catalog-dialog'
import { SpeciesCatalogDialog } from '~/features/catalogues/species/species-catalog-dialog'
import { exportingNightIdsStore } from '~/features/data-flow/4.export/export.state'
import type { ProjectEntity } from '~/stores/entities/1.projects'
import type { SiteEntity } from '~/stores/entities/2.sites'
import type { DeploymentEntity } from '~/stores/entities/3.deployments'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import type { DetectionEntity } from '~/stores/entities/detections'
import type { LeafGroupSummaryEntity } from '~/stores/entities/night-summaries'
import { Column } from '~/styles'
import { cn } from '~/utils/cn'
import { DATASET_PROGRESS_BAR_WIDTH_PX, InlineProgress } from './inline-progress'
import { DatasetHeaderMenu, ProjectsTreeRowContextMenu } from './item-actions'
import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'
import { buildProgressIndex, type ProgressIndex } from './projects-progress'
import {
  buildLeafGroupLinkParams,
  isSingleLeafHierarchy,
  resolveHomeTreeMode,
} from '~/features/mothbox-next/hierarchy-routes'
import { shouldSkipSiteLevelInProjectsTree } from '~/features/mothbox-next/hierarchy-display-labels'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { ManifestHierarchyTree } from './hierarchy-tree'
import { speciesListsStore, speciesListsLoadingStore } from '~/features/data-flow/2.identify/species-list.store'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'
import { $isSpeciesPickerOpen, $speciesPickerProjectId } from '~/features/data-flow/2.identify/species-picker.state'

const PROJECTS_TREE_DISCLOSURE_NS = 'projects-tree'
const projectsTreeDeepRowTitleClass = 'text-neutral-900'
const projectsTreeRowClass =
  'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-12'
const projectsTreeRowTitleClass = 'flex min-w-0 items-center'
const projectsTreeIndentDeploymentClass = 'pl-8'
/** Deployment pl-8 + expand chevron (w-28) + gap-2 — nights have no chevron; margin keeps row bg full width. */
const projectsTreeIndentNightClass = 'ml-[38px]'

type HierarchyStores = {
  sites: Record<string, SiteEntity>
  deployments: Record<string, DeploymentEntity>
  nights: Record<string, LeafGroupEntity>
}
type ListStores = Pick<HierarchyStores, 'deployments' | 'nights'>

export type ProjectsSectionProps = HierarchyStores & {
  isLoading: boolean
  projects: Record<string, ProjectEntity>
  detections: Record<string, DetectionEntity>
  nightSummaries: Record<string, LeafGroupSummaryEntity>
}

type CollapsedState = {
  sites: Record<string, boolean>
  deployments: Record<string, boolean>
}

export function ProjectsSection(props: ProjectsSectionProps) {
  const { isLoading, projects, sites, deployments, nights, detections, nightSummaries } = props
  const hasProjects = Object.keys(projects ?? {}).length > 0
  const activeFolderName = useStore(activeDatasetFolderNameStore)
  const datasetProjectId = useMemo(() => Object.keys(projects ?? {})[0], [projects])
  const speciesSelection = useStore(projectSpeciesSelectionStore)
  const speciesLists = useStore(speciesListsStore)
  const isSpeciesListsLoading = useStore(speciesListsLoadingStore)
  const datasetSpeciesListName = useMemo(() => {
    if (!datasetProjectId) return undefined
    const listId = speciesSelection?.[datasetProjectId]
    if (!listId) return undefined
    return speciesLists?.[listId]?.name
  }, [datasetProjectId, speciesSelection, speciesLists])
  const [collapsed, setCollapsed] = useState<CollapsedState>({ sites: {}, deployments: {} })
  const datasetProgress = useMemo(
    () =>
      buildProgressIndex({ nights, nightSummaries, detections }).byProject[datasetProjectId ?? ''] ?? {
        total: 0,
        identified: 0,
      },
    [nights, nightSummaries, detections, datasetProjectId],
  )
  const [isSpeciesOpen, setIsSpeciesOpen] = useState(false)
  const [isMorphoOpen, setIsMorphoOpen] = useState(false)

  const expandAll = useCallback(() => {
    setCollapsed({ sites: {}, deployments: {} })
  }, [])

  const collapseAll = useCallback(() => {
    const ids = collectProjectsHierarchyIds({ projects, sites, deployments })
    setCollapsed(buildAllCollapsedState(ids))
  }, [projects, sites, deployments])

  const onToggleSite = useCallback((siteId: string) => {
    setCollapsed((prev) => withToggledCollapsedNode({ prev, bucket: 'sites', id: siteId }))
  }, [])

  const onToggleDeployment = useCallback((deploymentId: string) => {
    setCollapsed((prev) => withToggledCollapsedNode({ prev, bucket: 'deployments', id: deploymentId }))
  }, [])

  const onChooseSpeciesList = useCallback(() => {
    if (!datasetProjectId) return
    $speciesPickerProjectId.set(datasetProjectId)
    $isSpeciesPickerOpen.set(true)
  }, [datasetProjectId])

  return (
    <Column className='gap-8'>
      <div className='flex items-start justify-between gap-12'>
        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-12'>
          <h2 id='home-projects-heading' className='text-lg font-semibold text-balance'>
            {activeFolderName ?? 'Projects'}
          </h2>
          {datasetProjectId ? (
            <DatasetHeaderMenu
              projectId={datasetProjectId}
              nights={nights}
              onExpandAll={expandAll}
              onCollapseAll={collapseAll}
              menuAlign='start'
            />
          ) : null}
          {hasProjects && datasetProjectId ? (
            <>
              <Button variant='outline' size='xxsm' type='button' onClick={() => setIsSpeciesOpen(true)}>
                Species
              </Button>
              <Button variant='outline' size='xxsm' type='button' onClick={() => setIsMorphoOpen(true)}>
                Morphospecies
              </Button>
              <button
                type='button'
                onClick={onChooseSpeciesList}
                disabled={isSpeciesListsLoading}
                className='text-left text-13 text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline disabled:cursor-wait disabled:opacity-70'
              >
                {isSpeciesListsLoading
                  ? 'Loading species lists…'
                  : datasetSpeciesListName
                    ? `Species list: ${datasetSpeciesListName}`
                    : 'species list not selected — click to choose'}
              </button>
              <SpeciesCatalogDialog
                open={isSpeciesOpen}
                onOpenChange={setIsSpeciesOpen}
                projectIdOverride={datasetProjectId}
                initialScope='all'
              />
              <MorphoCatalogDialog
                open={isMorphoOpen}
                onOpenChange={setIsMorphoOpen}
                projectIdOverride={datasetProjectId}
                initialScope='all'
              />
            </>
          ) : null}
        </div>
        {!isLoading && hasProjects ? (
          <div className='flex shrink-0 flex-col items-end'>
            <InlineProgress
              total={datasetProgress.total}
              identified={datasetProgress.identified}
              barWidthPx={DATASET_PROGRESS_BAR_WIDTH_PX}
            />
          </div>
        ) : null}
      </div>
      {isLoading ? (
        <CenteredLoader>🌀 Loading</CenteredLoader>
      ) : hasProjects ? (
        <ProjectsList
          projects={projects}
          sites={sites}
          deployments={deployments}
          nights={nights}
          detections={detections}
          nightSummaries={nightSummaries}
          collapsed={collapsed}
          onToggleSite={onToggleSite}
          onToggleDeployment={onToggleDeployment}
        />
      ) : (
        <p className='text-sm text-neutral-500 text-pretty'>Select a dataset on the left, or add a new one below the list.</p>
      )}
    </Column>
  )
}

type ProjectsListProps = HierarchyStores & {
  projects: Record<string, ProjectEntity>
  detections: Record<string, DetectionEntity>
  nightSummaries: Record<string, LeafGroupSummaryEntity>
  collapsed: CollapsedState
  onToggleSite: (siteId: string) => void
  onToggleDeployment: (deploymentId: string) => void
}

function ProjectsList(props: ProjectsListProps) {
  const {
    projects,
    sites,
    deployments,
    nights,
    detections,
    nightSummaries,
    collapsed,
    onToggleSite,
    onToggleDeployment,
  } = props
  const progressIndex = useMemo(
    () => buildProgressIndex({ nights, nightSummaries, detections }),
    [nights, nightSummaries, detections],
  )
  const resolvedHierarchy = useStore(activeHierarchyStore)
  const list = Object.values(projects ?? {})
  if (!list.length) return null

  return (
    <section aria-labelledby='home-projects-heading'>
      <div className='flex flex-col gap-8'>
        {list.map((project) => {
          const homeTreeMode = resolveHomeTreeMode({
            resolved: resolvedHierarchy,
            sites,
            deployments,
            projectId: project.id,
          })

          if (homeTreeMode === 'manifest') {
            return (
              <ManifestHierarchyTree
                key={project.id}
                projectId={project.id}
                nights={nights}
                progressIndex={progressIndex}
              />
            )
          }

          if (homeTreeMode === 'legacy') {
            const hasLegacyRows =
              getSitesForProject({ sites, projectId: project.id }).length > 0 ||
              getDeploymentsForProject({ deployments, projectId: project.id }).length > 0

            if (hasLegacyRows) {
              return (
                <LegacySitesDeploymentsTree
                  key={project.id}
                  projectId={project.id}
                  sites={sites}
                  deployments={deployments}
                  nights={nights}
                  progressIndex={progressIndex}
                  collapsed={collapsed}
                  onToggleSite={onToggleSite}
                  onToggleDeployment={onToggleDeployment}
                />
              )
            }

            if (resolvedHierarchy?.leafGroupIds.length) {
              return (
                <ManifestHierarchyTree
                  key={project.id}
                  projectId={project.id}
                  nights={nights}
                  progressIndex={progressIndex}
                />
              )
            }
          }

          if (resolvedHierarchy?.leafGroupIds.length) {
            return (
              <ManifestHierarchyTree
                key={project.id}
                projectId={project.id}
                nights={nights}
                progressIndex={progressIndex}
              />
            )
          }

          return (
            <ProjectsTreeEmptyState key={project.id} projectName={project.name ?? project.id} />
          )
        })}
      </div>
    </section>
  )
}

function ProjectsTreeEmptyState(props: { projectName: string }) {
  const { projectName } = props

  return (
    <div className='shadow-border rounded-xl bg-white p-8 text-sm text-neutral-600'>
      No nights or hierarchy data for {projectName} yet. Open a dataset folder or wait for ingest to finish.
    </div>
  )
}

/** Site → deployment → night tree for legacy ingest and Dinalab packages with hydrated entity stores. */
type LegacySitesDeploymentsTreeProps = HierarchyStores & {
  projectId: string
  progressIndex: ProgressIndex
  collapsed: CollapsedState
  onToggleSite: (siteId: string) => void
  onToggleDeployment: (deploymentId: string) => void
}

function LegacySitesDeploymentsTree(props: LegacySitesDeploymentsTreeProps) {
  const { projectId, sites, deployments, nights, progressIndex, collapsed, onToggleSite, onToggleDeployment } = props
  const sitesForProject = useMemo(() => getSitesForProject({ sites, projectId }), [sites, projectId])
  const deploymentsForProject = useMemo(
    () => getDeploymentsForProject({ deployments, projectId }),
    [deployments, projectId],
  )

  if (!sitesForProject.length && !deploymentsForProject.length) return null

  const skipSiteLevel = shouldSkipSiteLevelInProjectsTree(sitesForProject)

  if (!sitesForProject.length) {
    return (
      <div className='shadow-border rounded-xl bg-white p-8'>
        <DeploymentsList
          projectId={projectId}
          siteId=''
          deployments={deployments}
          nights={nights}
          progressIndex={progressIndex}
          collapsed={collapsed}
          onToggleDeployment={onToggleDeployment}
          isTopLevel
          deploymentFilter='project'
        />
      </div>
    )
  }

  return (
    <div className='shadow-border rounded-xl bg-white p-8'>
      {skipSiteLevel ? (
        <DeploymentsList
          projectId={projectId}
          siteId={sitesForProject[0]?.id ?? ''}
          deployments={deployments}
          nights={nights}
          progressIndex={progressIndex}
          collapsed={collapsed}
          onToggleDeployment={onToggleDeployment}
          isTopLevel
          deploymentFilter='project'
        />
      ) : (
        <SitesList
          projectId={projectId}
          sites={sites}
          deployments={deployments}
          nights={nights}
          progressIndex={progressIndex}
          collapsed={collapsed}
          onToggleSite={onToggleSite}
          onToggleDeployment={onToggleDeployment}
        />
      )}
    </div>
  )
}

type SitesListProps = HierarchyStores & {
  projectId: string
  progressIndex: ProgressIndex
  collapsed: CollapsedState
  onToggleSite: (siteId: string) => void
  onToggleDeployment: (deploymentId: string) => void
}

function SitesList(props: SitesListProps) {
  const { projectId, sites, deployments, nights, progressIndex, collapsed, onToggleSite, onToggleDeployment } = props
  const list = getSitesForProject({ sites, projectId })
  if (!list.length) return null

  return (
    <div className='flex w-full flex-col gap-1'>
      {list.map((site) => (
        <SiteItem
          key={site.id}
          site={site}
          projectId={projectId}
          deployments={deployments}
          nights={nights}
          progressIndex={progressIndex}
          collapsed={collapsed}
          onToggleSite={onToggleSite}
          onToggleDeployment={onToggleDeployment}
        />
      ))}
    </div>
  )
}

type SiteItemProps = ListStores & {
  site: SiteEntity
  projectId: string
  progressIndex: ProgressIndex
  collapsed: CollapsedState
  onToggleSite: (siteId: string) => void
  onToggleDeployment: (deploymentId: string) => void
}

function SiteItem(props: SiteItemProps) {
  const { site, projectId, deployments, nights, progressIndex, collapsed, onToggleSite, onToggleDeployment } = props
  const prog = progressIndex.bySite[site.id] ?? { total: 0, identified: 0 }
  const depsForSite = useMemo(() => getDeploymentsForSite({ deployments, siteId: site.id }), [deployments, site.id])
  const hasDeployments = depsForSite.length > 0
  const isSiteExpanded = !collapsed.sites[site.id]
  const sitePanelId = useMemo(() => projectsTreePanelId({ segment: 'site', entityId: site.id }), [site.id])

  return (
    <div className='group/site w-full'>
      <ProjectsTreeRowContextMenu scope='site' id={site.id} nights={nights}>
        <div className={projectsTreeRowClass}>
          <div className={projectsTreeRowTitleClass}>
            <div className='min-w-0'>
              <ProjectsTreeExpandTitle
                hasBranch={hasDeployments}
                expanded={isSiteExpanded}
                panelId={sitePanelId}
                onToggle={() => onToggleSite(site.id)}
                expandAriaLabel={`Expand deployments for ${site.name}`}
                collapseAriaLabel={`Collapse deployments for ${site.name}`}
                titleClassName={projectsTreeDeepRowTitleClass}
              >
                {site.name}
              </ProjectsTreeExpandTitle>
            </div>
          </div>
          <InlineProgress total={prog.total} identified={prog.identified} />
        </div>
      </ProjectsTreeRowContextMenu>
      {hasDeployments ? (
        <ExpandDisclosurePanel id={sitePanelId} hidden={!isSiteExpanded} className='w-full'>
          <DeploymentsList
            projectId={projectId}
            siteId={site.id}
            deployments={deployments}
            nights={nights}
            progressIndex={progressIndex}
            collapsed={collapsed}
            onToggleDeployment={onToggleDeployment}
          />
        </ExpandDisclosurePanel>
      ) : null}
    </div>
  )
}

type DeploymentsListProps = ListStores & {
  projectId: string
  siteId: string
  progressIndex: ProgressIndex
  collapsed: CollapsedState
  onToggleDeployment: (deploymentId: string) => void
  isTopLevel?: boolean
  deploymentFilter?: 'site' | 'project'
}

function DeploymentsList(props: DeploymentsListProps) {
  const {
    projectId,
    siteId,
    deployments,
    nights,
    progressIndex,
    collapsed,
    onToggleDeployment,
    isTopLevel = false,
    deploymentFilter = 'site',
  } = props
  const list = useMemo(() => {
    if (deploymentFilter === 'project') return getDeploymentsForProject({ deployments, projectId })
    return getDeploymentsForSite({ deployments, siteId })
  }, [deploymentFilter, deployments, projectId, siteId])
  if (!list.length) return null

  return (
    <div className='flex w-full flex-col gap-1'>
      {list.map((dep) => (
        <DeploymentItem
          key={dep.id}
          projectId={projectId}
          deployment={dep}
          nights={nights}
          progressIndex={progressIndex}
          collapsed={collapsed}
          onToggleDeployment={onToggleDeployment}
          isTopLevel={isTopLevel}
        />
      ))}
    </div>
  )
}

type DeploymentItemProps = Pick<HierarchyStores, 'nights'> & {
  projectId: string
  deployment: DeploymentEntity
  progressIndex: ProgressIndex
  collapsed: CollapsedState
  onToggleDeployment: (deploymentId: string) => void
  isTopLevel?: boolean
}

function DeploymentItem(props: DeploymentItemProps) {
  const { projectId, deployment, nights, progressIndex, collapsed, onToggleDeployment, isTopLevel = false } = props
  const prog = progressIndex.byDeployment[deployment.id] ?? { total: 0, identified: 0 }
  const nightsForDep = useMemo(() => getNightsForDeployment({ nights, deploymentId: deployment.id }), [nights, deployment.id])
  const hasNights = nightsForDep.length > 0
  const isDeploymentExpanded = !collapsed.deployments[deployment.id]
  const deploymentPanelId = useMemo(
    () => projectsTreePanelId({ segment: 'deployment', entityId: deployment.id }),
    [deployment.id],
  )

  return (
    <div className='group/deployment w-full'>
      <ProjectsTreeRowContextMenu scope='deployment' id={deployment.id} nights={nights}>
        <div className={projectsTreeRowClass}>
          <div
            className={cn(projectsTreeRowTitleClass, !isTopLevel && projectsTreeIndentDeploymentClass)}
          >
            <div className='min-w-0'>
              <ProjectsTreeExpandTitle
                hasBranch={hasNights}
                expanded={isDeploymentExpanded}
                panelId={deploymentPanelId}
                onToggle={() => onToggleDeployment(deployment.id)}
                expandAriaLabel={`Expand nights for ${deployment.name}`}
                collapseAriaLabel={`Collapse nights for ${deployment.name}`}
                titleClassName={projectsTreeDeepRowTitleClass}
              >
                {deployment.name}
              </ProjectsTreeExpandTitle>
            </div>
          </div>
          <InlineProgress total={prog.total} identified={prog.identified} />
        </div>
      </ProjectsTreeRowContextMenu>

      {hasNights ? (
        <ExpandDisclosurePanel id={deploymentPanelId} hidden={!isDeploymentExpanded} className='w-full'>
          <NightsList projectId={projectId} deploymentId={deployment.id} nights={nights} progressIndex={progressIndex} />
        </ExpandDisclosurePanel>
      ) : null}
    </div>
  )
}

type NightsListProps = Pick<HierarchyStores, 'nights'> & {
  projectId: string
  deploymentId: string
  progressIndex: ProgressIndex
}

function NightsList(props: NightsListProps) {
  const { projectId, deploymentId, nights, progressIndex } = props
  const folderName = useStore(activeDatasetFolderNameStore)
  const resolvedHierarchy = useStore(activeHierarchyStore)
  const singleLeafDataset = isSingleLeafHierarchy(resolvedHierarchy)
  const list = getNightsForDeployment({ nights, deploymentId })
  const exportingNightIds = useStore(exportingNightIdsStore)
  if (!list.length) return null

  return (
    <div className='flex w-full flex-col gap-1'>
      {list.map((night) => {
        const prog = progressIndex.byLeafGroup[night.id] ?? { total: 0, identified: 0 }
        const isExporting = exportingNightIds.has(night.id)
        const link = buildLeafGroupLinkParams({
          folderName,
          projectId,
          deploymentId,
          night,
          singleLeafDataset,
        })
        return (
          <ProjectsTreeRowContextMenu key={night.id} scope='night' id={night.id} nights={nights}>
            <Link
              to={link.to}
              params={link.params}
              aria-label={`Open night ${night.name}`}
              className={cn(
                'group/night block h-32 w-full cursor-pointer rounded-md bg-stone-50 hover:bg-blue-100',
                'transition-[background-color] duration-150 ease-out',
              )}
            >
              <div className={cn(projectsTreeRowClass, 'h-full')}>
                <div className={cn(projectsTreeRowTitleClass, 'h-full gap-8', projectsTreeIndentNightClass)}>
                  <span className='min-w-0 truncate text-13 leading-none text-blue-700'>{night.name}</span>
                  {isExporting ? (
                    <div className='flex shrink-0 items-center gap-4 text-13 text-neutral-500'>
                      <Loader size={14} />
                      <span>exporting</span>
                    </div>
                  ) : (
                    <button
                      type='button'
                      aria-label='Export Darwin Core CSV'
                      className='shrink-0 opacity-0 group-hover/night:opacity-100 transition-opacity flex items-center gap-4 rounded px-6 py-2 text-12 text-neutral-500 hover:text-neutral-800 hover:bg-black/5'
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const p = exportScopeDarwinCSV({ scope: 'night', id: night.id, nights })
                        toast.promise(p, { loading: '💾 Exporting DwC…', success: '✅ DwC exported', error: '🚨 Failed to export DwC' })
                      }}
                    >
                      <DownloadIcon className='h-12 w-12' />
                      Export DwC
                    </button>
                  )}
                </div>
                <InlineProgress total={prog.total} identified={prog.identified} />
              </div>
            </Link>
          </ProjectsTreeRowContextMenu>
        )
      })}
    </div>
  )
}

function getSitesForProject(params: { sites: Record<string, SiteEntity>; projectId: string }) {
  const { sites, projectId } = params
  const list = Object.values(sites ?? {}).filter((s) => s.projectId === projectId)
  return list
}

function getDeploymentsForSite(params: { deployments: Record<string, DeploymentEntity>; siteId: string }) {
  const { deployments, siteId } = params
  const list = Object.values(deployments ?? {}).filter((d) => d.siteId === siteId)
  return list
}

function getDeploymentsForProject(params: { deployments: Record<string, DeploymentEntity>; projectId: string }) {
  const { deployments, projectId } = params
  const list = Object.values(deployments ?? {}).filter((d) => d.projectId === projectId)
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

function getNightsForDeployment(params: { nights: Record<string, LeafGroupEntity>; deploymentId: string }) {
  const { nights, deploymentId } = params
  const list = Object.values(nights ?? {}).filter((n) => n.deploymentId === deploymentId)
  return list
}

function collectProjectsHierarchyIds(params: {
  projects: Record<string, ProjectEntity>
  sites: Record<string, SiteEntity>
  deployments: Record<string, DeploymentEntity>
}) {
  const { projects, sites, deployments } = params
  const siteIds: string[] = []
  const deploymentIds: string[] = []
  for (const pid of Object.keys(projects ?? {})) {
    for (const site of Object.values(sites ?? {}).filter((s) => s.projectId === pid)) {
      siteIds.push(site.id)
      for (const dep of Object.values(deployments ?? {}).filter((d) => d.siteId === site.id)) {
        deploymentIds.push(dep.id)
      }
    }
  }
  return { siteIds, deploymentIds }
}

function buildAllCollapsedState(ids: ReturnType<typeof collectProjectsHierarchyIds>): CollapsedState {
  const collapsed: CollapsedState = { sites: {}, deployments: {} }
  for (const id of ids.siteIds) collapsed.sites[id] = true
  for (const id of ids.deploymentIds) collapsed.deployments[id] = true
  return collapsed
}

function withToggledCollapsedNode(params: {
  prev: CollapsedState
  bucket: keyof CollapsedState
  id: string
}): CollapsedState {
  const { prev, bucket, id } = params
  const map = prev[bucket]
  return { ...prev, [bucket]: { ...map, [id]: !map[id] } }
}

function projectsTreePanelId(params: { segment: 'site' | 'deployment'; entityId: string }) {
  const { segment, entityId } = params
  return expandDisclosurePanelId({
    namespace: PROJECTS_TREE_DISCLOSURE_NS,
    segment,
    entityId,
  })
}

type ProjectsTreeExpandTitleProps = {
  hasBranch: boolean
  expanded: boolean
  panelId: string
  onToggle: () => void
  expandAriaLabel: string
  collapseAriaLabel: string
  titleClassName?: string
  children: ReactNode
}

function ProjectsTreeExpandTitle(props: ProjectsTreeExpandTitleProps) {
  const {
    hasBranch,
    expanded,
    panelId,
    onToggle,
    expandAriaLabel,
    collapseAriaLabel,
    titleClassName,
    children,
  } = props

  if (hasBranch) {
    return (
      <ExpandDisclosureTitleRow
        collapsible
        expanded={expanded}
        panelId={panelId}
        onToggle={onToggle}
        expandAriaLabel={expandAriaLabel}
        collapseAriaLabel={collapseAriaLabel}
        titleClassName={titleClassName}
      >
        {children}
      </ExpandDisclosureTitleRow>
    )
  }

  return (
    <ExpandDisclosureTitleRow collapsible={false} titleClassName={titleClassName}>
      {children}
    </ExpandDisclosureTitleRow>
  )
}
