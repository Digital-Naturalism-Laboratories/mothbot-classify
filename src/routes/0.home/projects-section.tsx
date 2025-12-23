import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { CenteredLoader } from '~/components/atomic/CenteredLoader'
import { InlineProgress } from './inline-progress'
import { ItemActions } from './item-actions'
import classed from '~/styles/classed'
import type { ProjectEntity } from '~/stores/entities/1.projects'
import type { SiteEntity } from '~/stores/entities/2.sites'
import type { DeploymentEntity } from '~/stores/entities/3.deployments'
import type { NightEntity } from '~/stores/entities/4.nights'
import type { DetectionEntity } from '~/stores/entities/detections'
import type { NightSummaryEntity } from '~/stores/entities/night-summaries'
import { cn } from '~/utils/cn'
import { Column } from '~/styles'

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

export function ProjectsSection(props: ProjectsSectionProps) {
  const { isLoading, projects, sites, deployments, nights, detections, nightSummaries } = props

  return (
    <Column className='gap-8'>
      <h2 className='mb-2 text-lg font-semibold'>Projects</h2>
      {isLoading ? (
        <CenteredLoader>🌀 Loading</CenteredLoader>
      ) : Object.keys(projects ?? {}).length ? (
        <ProjectsList
          projects={projects}
          sites={sites}
          deployments={deployments}
          nights={nights}
          detections={detections}
          nightSummaries={nightSummaries}
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
}

function ProjectsList(props: ProjectsListProps) {
  const { projects, sites, deployments, nights, detections, nightSummaries } = props
  const progressIndex = useMemo(() => buildProgressIndex({ nightSummaries, detections }), [nightSummaries, detections])
  const list = Object.values(projects ?? {})
  if (!list.length) return null

  return (
    <ul className='space-y-8'>
      {list.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          sites={sites}
          deployments={deployments}
          nights={nights}
          progressIndex={progressIndex}
        />
      ))}
    </ul>
  )
}

type ProgressIndex = {
  byProject: Record<string, { total: number; identified: number }>
  bySite: Record<string, { total: number; identified: number }>
  byDeployment: Record<string, { total: number; identified: number }>
  byNight: Record<string, { total: number; identified: number }>
}

type ProjectItemProps = HierarchyStores & {
  project: ProjectEntity
  progressIndex: ProgressIndex
}

function ProjectItem(props: ProjectItemProps) {
  const { project, sites, deployments, nights, progressIndex } = props
  const prog = progressIndex.byProject[project.id] ?? { total: 0, identified: 0 }

  return (
    <li className='border bg-white p-8 group/project rounded-lg'>
      <div className='flex items-center gap-12'>
        <span className='font-medium text-neutral-900'>{project.name}</span>

        <div className='ml-auto flex items-center gap-12'>
          <InlineProgress total={prog.total} identified={prog.identified} />
          <ItemActions scope={'project'} id={project.id} nights={nights} />
        </div>
      </div>
      <SitesList projectId={project.id} sites={sites} deployments={deployments} nights={nights} progressIndex={progressIndex} />
    </li>
  )
}

type SitesListProps = HierarchyStores & {
  projectId: string
  progressIndex: ProgressIndex
}

function SitesList(props: SitesListProps) {
  const { projectId, sites, deployments, nights, progressIndex } = props
  const list = getSitesForProject({ sites, projectId })
  if (!list.length) return null

  return (
    <Ul className=''>
      {list.map((site) => (
        <SiteItem key={site.id} site={site} projectId={projectId} deployments={deployments} nights={nights} progressIndex={progressIndex} />
      ))}
    </Ul>
  )
}

type SiteItemProps = ListStores & {
  site: SiteEntity
  projectId: string
  progressIndex: ProgressIndex
}

function SiteItem(props: SiteItemProps) {
  const { site, projectId, deployments, nights, progressIndex } = props
  const prog = progressIndex.bySite[site.id] ?? { total: 0, identified: 0 }

  return (
    <Li className='group/site'>
      <div className='flex items-center gap-12'>
        <span className='text-neutral-900'>{site.name}</span>
        <div className='ml-auto flex items-center gap-12'>
          <InlineProgress total={prog.total} identified={prog.identified} />
          <ItemActions scope={'site'} id={site.id} nights={nights} />
        </div>
      </div>
      <DeploymentsList projectId={projectId} siteId={site.id} deployments={deployments} nights={nights} progressIndex={progressIndex} />
    </Li>
  )
}

type DeploymentsListProps = ListStores & {
  projectId: string
  siteId: string
  progressIndex: ProgressIndex
}

function DeploymentsList(props: DeploymentsListProps) {
  const { projectId, siteId, deployments, nights, progressIndex } = props
  const list = getDeploymentsForSite({ deployments, siteId })
  if (!list.length) return null

  return (
    <Ul>
      {list.map((dep) => (
        <DeploymentItem key={dep.id} projectId={projectId} siteId={siteId} deployment={dep} nights={nights} progressIndex={progressIndex} />
      ))}
    </Ul>
  )
}

type DeploymentItemProps = Pick<HierarchyStores, 'nights'> & {
  projectId: string
  siteId: string
  deployment: DeploymentEntity
  progressIndex: ProgressIndex
}

function DeploymentItem(props: DeploymentItemProps) {
  const { projectId, siteId, deployment, nights, progressIndex } = props
  const prog = progressIndex.byDeployment[deployment.id] ?? { total: 0, identified: 0 }

  return (
    <Li className='group/deployment'>
      <div className='flex items-center gap-12'>
        <span className='text-neutral-900'>{deployment.name}</span>
        <div className='ml-auto flex items-center gap-12'>
          <InlineProgress total={prog.total} identified={prog.identified} />
          <ItemActions scope={'deployment'} id={deployment.id} nights={nights} />
        </div>
      </div>

      <NightsList projectId={projectId} siteId={siteId} deploymentId={deployment.id} nights={nights} progressIndex={progressIndex} />
    </Li>
  )
}

type NightsListProps = Pick<HierarchyStores, 'nights'> & {
  projectId: string
  siteId: string
  deploymentId: string
  progressIndex: ProgressIndex
}

function NightsList(props: NightsListProps) {
  const { projectId, siteId, deploymentId, nights, progressIndex } = props
  const list = getNightsForDeployment({ nights, deploymentId })
  if (!list.length) return null

  return (
    <Ul>
      {list.map((night) => {
        const prog = progressIndex.byNight[night.id] ?? { total: 0, identified: 0 }
        return (
          <Li key={night.id} className='group/night bg-stone-50 px-0 '>
            <div className='flex items-center gap-12 '>
              <Link
                to={'/projects/$projectId/sites/$siteId/deployments/$deploymentId/nights/$nightId'}
                params={{
                  projectId,
                  siteId: lastPathSegment({ id: siteId }),
                  deploymentId: lastPathSegment({ id: deploymentId }),
                  nightId: lastPathSegment({ id: night.id }),
                }}
                className='flex h-32 items-center gap-12 flex-1 px-6 hover:bg-blue-100 rounded-l-md cursor-pointer'
              >
                <span className='text-sm text-blue-700'>{night.name}</span>
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
  const last = parts[parts.length - 1] ?? ''
  const res = last
  return res
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
      if (parts.length >= 4) {
        const [projectId, siteId, deploymentId] = parts

        if (deploymentId) {
          const deploymentIdFull = `${projectId}/${siteId}/${deploymentId}`
          const existing = byDeployment[deploymentIdFull] ?? { total: 0, identified: 0 }
          byDeployment[deploymentIdFull] = {
            total: existing.total + total,
            identified: existing.identified + identified,
          }
        }

        if (siteId) {
          const siteIdFull = `${projectId}/${siteId}`
          const existing = bySite[siteIdFull] ?? { total: 0, identified: 0 }
          bySite[siteIdFull] = {
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
      if (parts.length >= 4) {
        const [projectId, siteId, deploymentId] = parts

        if (deploymentId) {
          const deploymentIdFull = `${projectId}/${siteId}/${deploymentId}`
          const existing = byDeployment[deploymentIdFull] ?? { total: 0, identified: 0 }
          byDeployment[deploymentIdFull] = {
            total: existing.total + 1,
            identified: existing.identified + ((detection as any)?.detectedBy === 'user' ? 1 : 0),
          }
        }

        if (siteId) {
          const siteIdFull = `${projectId}/${siteId}`
          const existing = bySite[siteIdFull] ?? { total: 0, identified: 0 }
          bySite[siteIdFull] = {
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
