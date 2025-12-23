import { useRouter } from '@tanstack/react-router'
import { useStore } from '@nanostores/react'
import { Button } from '~/components/ui/button'
import { getTaxonomyFieldLabel } from '~/models/taxonomy/rank'
import { buildNightUrl, parseNightIdParts } from './catalog-utils'
import { detectionsStore } from '~/stores/entities/detections'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'

export function TaxonomyDisplay(props: { taxonomy: Record<string, string | null | undefined> }) {
  const { taxonomy } = props
  return (
    <section className='mt-12'>
      <h3 className='mb-6 text-14 font-semibold'>Taxonomy</h3>
      <div className='space-y-2 text-13'>
        {Object.entries(taxonomy)
          .filter(([, value]) => value != null)
          .map(([key, value]) => (
            <div key={key}>
              <span className='font-medium'>{getTaxonomyFieldLabel(key)}:</span> {value}
            </div>
          ))}
      </div>
    </section>
  )
}

export function UsageStatsDisplay(props: { projectCount: number; nightCount: number; instanceCount: number }) {
  const { projectCount, nightCount, instanceCount } = props
  return (
    <div className='mt-12 text-13 text-neutral-700'>
      <span className='mr-12'>Projects: {projectCount}</span>
      <span className='mr-12'>Nights: {nightCount}</span>
      <span>Instances: {instanceCount}</span>
    </div>
  )
}

export function ProjectsListDisplay(props: { projectIds: string[] }) {
  const { projectIds } = props
  if (!projectIds.length) return null
  return (
    <section className='mt-12'>
      <h3 className='mb-6 text-14 font-semibold'>Projects</h3>
      <ul className='list-disc pl-16 text-13'>
        {projectIds.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </section>
  )
}

export function NightsListDisplay(props: { nightIds: string[]; onNavigate?: () => void; morphoKey?: string }) {
  const { nightIds, onNavigate, morphoKey } = props
  const router = useRouter()
  const detections = useStore(detectionsStore)

  if (!nightIds.length) return null

  function handleViewClick(params: { projectId: string; siteId: string; deploymentId: string; nightId: string }) {
    const { projectId, siteId, deploymentId, nightId } = params

    onNavigate?.()

    if (morphoKey) {
      const label = getLabelForMorphoKey({ detections, morphoKey })
      navigateToNightWithSearch({ router, projectId, siteId, deploymentId, nightId, label })
    } else {
      navigateToNight({ router, projectId, siteId, deploymentId, nightId })
    }
  }

  return (
    <section className='mt-12'>
      <h3 className='mb-6 text-14 font-semibold'>Nights</h3>
      <ul className='space-y-6 text-13'>
        {nightIds.map((n) => {
          const { projectId, siteId, deploymentId, nightId } = parseNightIdParts(n)
          const href = buildNightUrl({ projectId, siteId, deploymentId, nightId })

          return (
            <li key={n} className='flex items-center gap-8'>
              <span className='break-words min-w-0'>{n}</span>
              {href ? (
                <Button
                  size='xsm'
                  className='flex-shrink-0'
                  onClick={() => {
                    handleViewClick({ projectId: projectId!, siteId: siteId!, deploymentId: deploymentId!, nightId: nightId! })
                  }}
                >
                  View
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function navigateToNightWithSearch(params: {
  router: ReturnType<typeof useRouter>
  projectId: string
  siteId: string
  deploymentId: string
  nightId: string
  label: string
}) {
  const { router, projectId, siteId, deploymentId, nightId, label } = params
  const search = { bucket: 'user' as const, rank: 'species' as const, name: label }

  router.navigate({
    to: '/projects/$projectId/sites/$siteId/deployments/$deploymentId/nights/$nightId',
    params: { projectId, siteId, deploymentId, nightId },
    search,
  })
}

function navigateToNight(params: {
  router: ReturnType<typeof useRouter>
  projectId: string
  siteId: string
  deploymentId: string
  nightId: string
}) {
  const { router, projectId, siteId, deploymentId, nightId } = params
  const href = buildNightUrl({ projectId, siteId, deploymentId, nightId })
  if (href) {
    router.navigate({ to: href as any })
  }
}

export function getLabelForMorphoKey(params: { detections?: Record<string, any>; morphoKey: string }) {
  const { detections, morphoKey } = params
  const key = normalizeMorphoKey(morphoKey)
  for (const d of Object.values(detections ?? {})) {
    const det = d as any
    if (det?.detectedBy !== 'user') continue
    const raw = typeof det?.morphospecies === 'string' ? (det?.morphospecies as string) : ''
    if (!raw) continue
    if (normalizeMorphoKey(raw) !== key) continue
    const label = (det?.taxon?.species as string) || raw
    if (label) return label
  }
  return morphoKey
}
