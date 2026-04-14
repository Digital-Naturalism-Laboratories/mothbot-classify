import { useStore } from '@nanostores/react'
import { Link } from '@tanstack/react-router'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
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
import type { NightEntity } from '~/stores/entities/4.nights'
import type { DetectionEntity } from '~/stores/entities/detections'
import type { NightSummaryEntity } from '~/stores/entities/night-summaries'
import { Column } from '~/styles'
import classed from '~/styles/classed'
import { InlineProgress } from './inline-progress'
import { ItemActions } from './item-actions'
import { deriveSiteFromDeploymentFolder } from '~/features/data-flow/1.ingest/ingest-paths'

const PROJECTS_TREE_DISCLOSURE_NS = 'projects-tree'
const projectsTreeRootRowTitleClass = 'font-medium text-neutral-900'
const projectsTreeDeepRowTitleClass = 'text-neutral-900'

type HierarchyStores = {
  sites: Record<string, SiteEntity>
  deployments: Record<string, DeploymentEntity>
  nights: Record<string, NightEntity>
}
type ListStores = Pick<HierarchyStores, 'deployments' | 'nights'>

export type ProjectsSectionProps = HierarchyStores & {
  isLoading: boolean
  projects: Record<string, ProjectEntity>
  detections: Record<string, DetectionEntity>
  nightSummaries: Record<string, NightSummaryEntity>
}

type ProgressIndex = {
  byProject: Record<string, { total: number; identified: number }>
  bySite: Record<string, { total: number; identified: number }>
  byDeployment: Record<string, { total: number; identified: number }>
  byNight: Record<string, { total: number; identified: number }>
}

type CollapsedState = {
  projects: Record<string, boolean>
  sites: Record<string, boolean>
  deployments: Record<string, boolean>
}

export function ProjectsSection(props: ProjectsSectionProps) {
  const { isLoading, projects, sites, deployments, nights, detections, nightSummaries } = props
  const hasProjects = Object.keys(projects ?? {}).length > 0
  const [collapsed, setCollapsed] = useState<CollapsedState>({ projects: {}, sites: {}, deployments: {} })

  const expandAll = useCallback(() => {
    setCollapsed({ projects: {}, sites: {}, deployments: {} })
  }, [])

  const collapseAll = useCallback(() => {
    const ids = collectProjectsHierarchyIds({ projects, sites, deployments })
    setCollapsed(buildAllCollapsedState(ids))
  }, [projects, sites, deployments])

  const onToggleProject = useCallback((projectId: string) => {
    setCollapsed((prev) => withToggledCollapsedNode({ prev, bucket: 'projects', id: projectId }))
  }, [])

  const onToggleSite = useCallback((siteId: string) => {
    setCollapsed((prev) => withToggledCollapsedNode({ prev, bucket: 'sites', id: siteId }))
  }, [])

  const onToggleDeployment = useCallback((deploymentId: string) => {
    setCollapsed((prev) => withToggledCollapsedNode({ prev, bucket: 'deployments', id: deploymentId }))
  }, [])

  return (
    <Column className='gap-8'>
      <div className='flex items-center justify-between gap-12'>
        <h2 id='home-projects-heading' className='text-lg font-semibold'>
          Projects
        </h2>
        {!isLoading && hasProjects ? (
          <div className='flex shrink-0 flex-wrap justify-end gap-8'>
            <Button variant='outline' size='xxsm' type='button' onClick={expandAll}>
              Expand all
            </Button>
            <Button variant='outline' size='xxsm' type='button' onClick={collapseAll}>
              Collapse all
            </Button>
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
          onToggleProject={onToggleProject}
          onToggleSite={onToggleSite}
          onToggleDeployment={onToggleDeployment}
        />
      ) : (
        <p className='text-sm text-neutral-500'>Load a projects folder to see projects</p>
      )}
    </Column>
  )
}

type ProjectsListProps = HierarchyStores & {
  projects: Record<string, ProjectEntity>
  detections: Record<string, DetectionEntity>
  nightSummaries: Record<string, NightSummaryEntity>
  collapsed: CollapsedState
  onToggleProject: (projectId: string) => void
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
    onToggleProject,
    onToggleSite,
    onToggleDeployment,
  } = props
  const progressIndex = useMemo(() => buildProgressIndex({ nightSummaries, detections }), [nightSummaries, detections])
  const list = Object.values(projects ?? {})
  if (!list.length) return null

  return (
    <section aria-labelledby='home-projects-heading'>
      <ul className='space-y-8'>
        {list.map((project) => (
          <ProjectItem
            key={project.id}
            project={project}
            sites={sites}
            deployments={deployments}
            nights={nights}
            progressIndex={progressIndex}
            collapsed={collapsed}
            onToggleProject={onToggleProject}
            onToggleSite={onToggleSite}
            onToggleDeployment={onToggleDeployment}
          />
        ))}
      </ul>
    </section>
  )
}

type ProjectItemProps = HierarchyStores & {
  project: ProjectEntity
  progressIndex: ProgressIndex
  collapsed: CollapsedState
  onToggleProject: (projectId: string) => void
  onToggleSite: (siteId: string) => void
  onToggleDeployment: (deploymentId: string) => void
}

function ProjectItem(props: ProjectItemProps) {
  const {
    project,
    sites,
    deployments,
    nights,
    progressIndex,
    collapsed,
    onToggleProject,
    onToggleSite,
    onToggleDeployment,
  } = props
  const prog = progressIndex.byProject[project.id] ?? { total: 0, identified: 0 }
  const [isSpeciesOpen, setIsSpeciesOpen] = useState(false)
  const [isMorphoOpen, setIsMorphoOpen] = useState(false)
  const sitesForProject = useMemo(() => getSitesForProject({ sites, projectId: project.id }), [sites, project.id])
  const hasSites = sitesForProject.length > 0
  const isProjectExpanded = !collapsed.projects[project.id]
  const projectPanelId = useMemo(() => projectsTreePanelId({ segment: 'project', entityId: project.id }), [project.id])

  return (
    <li className='border bg-white p-8 group/project rounded-lg'>
      <div className='flex items-center gap-12'>
        <ProjectsTreeExpandTitle
          hasBranch={hasSites}
          expanded={isProjectExpanded}
          panelId={projectPanelId}
          onToggle={() => onToggleProject(project.id)}
          expandAriaLabel={`Expand sites for ${project.name}`}
          collapseAriaLabel={`Collapse sites for ${project.name}`}
          titleClassName={projectsTreeRootRowTitleClass}
        >
          {project.name}
        </ProjectsTreeExpandTitle>
        <Button
          variant='outline'
          size='xxsm'
          onClick={() => setIsSpeciesOpen(true)}
        >
          Species
        </Button>
        <Button
          variant='outline'
          size='xxsm'
          onClick={() => setIsMorphoOpen(true)}
        >
          Morphospecies
        </Button>

        <div className='ml-auto flex items-center gap-12'>
          <InlineProgress total={prog.total} identified={prog.identified} />
          <ItemActions scope={'project'} id={project.id} nights={nights} />
        </div>
      </div>
      <SpeciesCatalogDialog
        open={isSpeciesOpen}
        onOpenChange={setIsSpeciesOpen}
        projectIdOverride={project.id}
        initialScope='project'
      />
      <MorphoCatalogDialog
        open={isMorphoOpen}
        onOpenChange={setIsMorphoOpen}
        projectIdOverride={project.id}
        initialScope='project'
      />
      {hasSites ? (
        <ExpandDisclosurePanel id={projectPanelId} hidden={!isProjectExpanded}>
          <SitesList
            projectId={project.id}
            sites={sites}
            deployments={deployments}
            nights={nights}
            progressIndex={progressIndex}
            collapsed={collapsed}
            onToggleSite={onToggleSite}
            onToggleDeployment={onToggleDeployment}
          />
        </ExpandDisclosurePanel>
      ) : null}
    </li>
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
    <Ul className=''>
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
    </Ul>
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
    <Li className='group/site'>
      <div className='flex items-center gap-12'>
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
        <div className='ml-auto flex items-center gap-12'>
          <InlineProgress total={prog.total} identified={prog.identified} />
          <ItemActions scope={'site'} id={site.id} nights={nights} />
        </div>
      </div>
      {hasDeployments ? (
        <ExpandDisclosurePanel id={sitePanelId} hidden={!isSiteExpanded}>
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
    </Li>
  )
}

type DeploymentsListProps = ListStores & {
  projectId: string
  siteId: string
  progressIndex: ProgressIndex
  collapsed: CollapsedState
  onToggleDeployment: (deploymentId: string) => void
}

function DeploymentsList(props: DeploymentsListProps) {
  const { projectId, siteId, deployments, nights, progressIndex, collapsed, onToggleDeployment } = props
  const list = getDeploymentsForSite({ deployments, siteId })
  if (!list.length) return null

  return (
    <Ul>
      {list.map((dep) => (
        <DeploymentItem
          key={dep.id}
          projectId={projectId}
          deployment={dep}
          nights={nights}
          progressIndex={progressIndex}
          collapsed={collapsed}
          onToggleDeployment={onToggleDeployment}
        />
      ))}
    </Ul>
  )
}

type DeploymentItemProps = Pick<HierarchyStores, 'nights'> & {
  projectId: string
  deployment: DeploymentEntity
  progressIndex: ProgressIndex
  collapsed: CollapsedState
  onToggleDeployment: (deploymentId: string) => void
}

function DeploymentItem(props: DeploymentItemProps) {
  const { projectId, deployment, nights, progressIndex, collapsed, onToggleDeployment } = props
  const prog = progressIndex.byDeployment[deployment.id] ?? { total: 0, identified: 0 }
  const nightsForDep = useMemo(() => getNightsForDeployment({ nights, deploymentId: deployment.id }), [nights, deployment.id])
  const hasNights = nightsForDep.length > 0
  const isDeploymentExpanded = !collapsed.deployments[deployment.id]
  const deploymentPanelId = useMemo(
    () => projectsTreePanelId({ segment: 'deployment', entityId: deployment.id }),
    [deployment.id],
  )

  return (
    <Li className='group/deployment'>
      <div className='flex items-center gap-12'>
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
        <div className='ml-auto flex items-center gap-12'>
          <InlineProgress total={prog.total} identified={prog.identified} />
          <ItemActions scope={'deployment'} id={deployment.id} nights={nights} />
        </div>
      </div>

      {hasNights ? (
        <ExpandDisclosurePanel id={deploymentPanelId} hidden={!isDeploymentExpanded}>
          <NightsList projectId={projectId} deploymentId={deployment.id} nights={nights} progressIndex={progressIndex} />
        </ExpandDisclosurePanel>
      ) : null}
    </Li>
  )
}

type NightsListProps = Pick<HierarchyStores, 'nights'> & {
  projectId: string
  deploymentId: string
  progressIndex: ProgressIndex
}

function NightsList(props: NightsListProps) {
  const { projectId, deploymentId, nights, progressIndex } = props
  const list = getNightsForDeployment({ nights, deploymentId })
  const exportingNightIds = useStore(exportingNightIdsStore)
  if (!list.length) return null

  return (
    <Ul>
      {list.map((night) => {
        const prog = progressIndex.byNight[night.id] ?? { total: 0, identified: 0 }
        const isExporting = exportingNightIds.has(night.id)
        return (
          <Li key={night.id} className='group/night bg-stone-50 px-0 '>
            <div className='flex items-center gap-12 '>
              <Link
                to={'/projects/$projectId/deployments/$deploymentId/nights/$nightId'}
                params={{
                  projectId,
                  deploymentId: lastPathSegment({ id: deploymentId }),
                  nightId: lastPathSegment({ id: night.id }),
                }}
                className='flex h-32 items-center gap-12 flex-1 px-6 hover:bg-blue-100 rounded-l-md cursor-pointer'
              >
                <span className='text-sm text-blue-700'>{night.name}</span>
                {isExporting && (
                  <div className='flex items-center gap-4 text-sm text-neutral-500'>
                    <Loader size={14} />
                    <span>exporting</span>
                  </div>
                )}
                <div className='ml-auto'>
                  <InlineProgress total={prog.total} identified={prog.identified} />
                </div>
              </Link>

              <div onClick={(e) => e.stopPropagation()} className='flex items-center'>
                <ItemActions scope={'night'} id={night.id} nights={nights} />
              </div>
            </div>
          </Li>
        )
      })}
    </Ul>
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

function getNightsForDeployment(params: { nights: Record<string, NightEntity>; deploymentId: string }) {
  const { nights, deploymentId } = params
  const list = Object.values(nights ?? {}).filter((n) => n.deploymentId === deploymentId)
  return list
}

function lastPathSegment(params: { id: string }) {
  const { id } = params
  const parts = (id ?? '').split('/')
  return parts[parts.length - 1] ?? ''
}

function collectProjectsHierarchyIds(params: {
  projects: Record<string, ProjectEntity>
  sites: Record<string, SiteEntity>
  deployments: Record<string, DeploymentEntity>
}) {
  const { projects, sites, deployments } = params
  const projectIds = Object.keys(projects ?? {})
  const siteIds: string[] = []
  const deploymentIds: string[] = []
  for (const pid of projectIds) {
    for (const site of Object.values(sites ?? {}).filter((s) => s.projectId === pid)) {
      siteIds.push(site.id)
      for (const dep of Object.values(deployments ?? {}).filter((d) => d.siteId === site.id)) {
        deploymentIds.push(dep.id)
      }
    }
  }
  return { projectIds, siteIds, deploymentIds }
}

function buildAllCollapsedState(ids: ReturnType<typeof collectProjectsHierarchyIds>): CollapsedState {
  const collapsed: CollapsedState = { projects: {}, sites: {}, deployments: {} }
  for (const id of ids.projectIds) collapsed.projects[id] = true
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

function projectsTreePanelId(params: { segment: 'project' | 'site' | 'deployment'; entityId: string }) {
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

function buildProgressIndex(params: {
  nightSummaries: Record<string, NightSummaryEntity>
  detections: Record<string, DetectionEntity>
}): ProgressIndex {
  const { nightSummaries, detections } = params

  const byNight: Record<string, { total: number; identified: number }> = {}
  const byDeployment: Record<string, { total: number; identified: number }> = {}
  const bySite: Record<string, { total: number; identified: number }> = {}
  const byProject: Record<string, { total: number; identified: number }> = {}

  const hasSummaries = nightSummaries && Object.keys(nightSummaries).length > 0

  if (hasSummaries) {
    for (const [nightId, summary] of Object.entries(nightSummaries)) {
      if (!nightId || !summary) continue

      const total = summary.totalDetections || 0
      const identified = summary.totalIdentified || 0

      byNight[nightId] = { total, identified }

      const parts = nightId.split('/').filter(Boolean)
      if (parts.length >= 3) {
        const [projectId, deploymentId] = parts

        if (deploymentId) {
          const deploymentIdFull = `${projectId}/${deploymentId}`
          const existing = byDeployment[deploymentIdFull] ?? { total: 0, identified: 0 }
          byDeployment[deploymentIdFull] = {
            total: existing.total + total,
            identified: existing.identified + identified,
          }
        }

        const site = deriveSiteFromDeploymentFolder(deploymentId)
        if (site) {
          const siteId = `${projectId}/${site}`
          const existing = bySite[siteId] ?? { total: 0, identified: 0 }
          bySite[siteId] = {
            total: existing.total + total,
            identified: existing.identified + identified,
          }
        }

        if (projectId) {
          const existing = byProject[projectId] ?? { total: 0, identified: 0 }
          byProject[projectId] = {
            total: existing.total + total,
            identified: existing.identified + identified,
          }
        }
      }
    }
  } else {
    for (const detection of Object.values(detections ?? {})) {
      const nightId = (detection as any)?.nightId
      if (!nightId) continue

      const existing = byNight[nightId] ?? { total: 0, identified: 0 }
      byNight[nightId] = {
        total: existing.total + 1,
        identified: existing.identified + ((detection as any)?.detectedBy === 'user' ? 1 : 0),
      }

      const parts = nightId.split('/').filter(Boolean)
      if (parts.length >= 3) {
        const [projectId, deploymentId] = parts

        if (deploymentId) {
          const deploymentIdFull = `${projectId}/${deploymentId}`
          const existing = byDeployment[deploymentIdFull] ?? { total: 0, identified: 0 }
          byDeployment[deploymentIdFull] = {
            total: existing.total + 1,
            identified: existing.identified + ((detection as any)?.detectedBy === 'user' ? 1 : 0),
          }
        }

        const site = deriveSiteFromDeploymentFolder(deploymentId)
        if (site) {
          const siteId = `${projectId}/${site}`
          const existing = bySite[siteId] ?? { total: 0, identified: 0 }
          bySite[siteId] = {
            total: existing.total + 1,
            identified: existing.identified + ((detection as any)?.detectedBy === 'user' ? 1 : 0),
          }
        }

        if (projectId) {
          const existing = byProject[projectId] ?? { total: 0, identified: 0 }
          byProject[projectId] = {
            total: existing.total + 1,
            identified: existing.identified + ((detection as any)?.detectedBy === 'user' ? 1 : 0),
          }
        }
      }
    }
  }

  return { byNight, byDeployment, bySite, byProject }
}

const Ul = classed('ul', 'ml-8 space-y-1')
const Li = classed('li', 'relative px-6 rounded-md ')
