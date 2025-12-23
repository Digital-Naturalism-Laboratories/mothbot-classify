import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import { detectionsStore } from '~/stores/entities/detections'
import { useObjectUrl } from '~/utils/use-object-url'
import { SpeciesDetailsDialog } from './species-details-dialog'
import { useRouterState } from '@tanstack/react-router'
import { Column, Row } from '~/styles'
import { ImageWithDownloadName } from '~/components/atomic/image-with-download-name'
import { TaxonomySection } from '~/features/left-panel/taxonomy-section'
import type { TaxonomyNode } from '~/features/left-panel/left-panel.types'
import { CountsRow } from '~/features/left-panel/counts-row'
import { ScopeFilters, type ScopeType } from '~/features/catalogues/shared/scope-filters'
import { extractRouteIds, ensureFileFromIndexed, computeAllowedNightIds } from '~/features/catalogues/shared/catalog-utils'
import { usePreviewFile } from '~/features/catalogues/shared/use-preview-file'

export type SpeciesCatalogDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SpeciesCatalogDialog(props: SpeciesCatalogDialogProps) {
  const { open, onOpenChange } = props

  const route = useRouterState({ select: (s) => s.location })
  const { projectId, siteId, deploymentId, nightId } = useMemo(() => extractRouteIds(route?.pathname || ''), [route?.pathname])
  const [usageScope, setUsageScope] = useState<ScopeType>('all')

  const summaries = useStore(nightSummariesStore)
  const detections = useStore(detectionsStore)

  const scopeCounts = useMemo(() => {
    const counts: Record<ScopeType, number> = {
      all: 0,
      project: 0,
      site: 0,
      deployment: 0,
      night: 0,
    }
    counts.all = countSpeciesForNightIds({ detections })
    if (projectId) counts.project = countSpeciesForNightIds({ detections, startsWith: `${projectId}/` })
    if (projectId && siteId) counts.site = countSpeciesForNightIds({ detections, startsWith: `${projectId}/${siteId}/` })
    if (projectId && siteId && deploymentId)
      counts.deployment = countSpeciesForNightIds({ detections, startsWith: `${projectId}/${siteId}/${deploymentId}/` })
    if (projectId && siteId && deploymentId && nightId)
      counts.night = countSpeciesForNightIds({ detections, equals: `${projectId}/${siteId}/${deploymentId}/${nightId}` })
    return counts
  }, [detections, projectId, siteId, deploymentId, nightId])

  const allowedNightIds = useMemo(() => {
    return computeAllowedNightIds({ usageScope, summaries, projectId, siteId, deploymentId, nightId })
  }, [usageScope, summaries, projectId, siteId, deploymentId, nightId])

  const list = useSpeciesIndexWithContext({ allowedNightIds })

  const [selectedTaxon, setSelectedTaxon] = useState<
    { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string } | undefined
  >(undefined)

  const taxonomyTree = useMemo(() => {
    return buildSpeciesTaxonomyTree({ speciesList: list, allowedNightIds, detections })
  }, [list, allowedNightIds, detections])

  const filtered = useMemo(() => {
    return filterSpeciesByTaxon({ speciesList: list, selectedTaxon, allowedNightIds, detections })
  }, [list, selectedTaxon, allowedNightIds, detections])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent align='vhSide' className='max-w-[1400px] col justify-start !p-0 gap-0 h-[90vh]'>
        <Column className='border-b p-16 gap-12 flex-shrink-0'>
          <Row className='items-center gap-20'>
            <h3 className='!text-16 font-medium'>Species</h3>
            <ScopeFilters
              scope={usageScope}
              onScopeChange={setUsageScope}
              hasProject={!!projectId}
              hasSite={!!(projectId && siteId)}
              hasDeployment={!!(projectId && siteId && deploymentId)}
              hasNight={!!(projectId && siteId && deploymentId && nightId)}
              counts={scopeCounts}
            />
          </Row>
        </Column>

        <Row className='flex-1 min-h-0 overflow-hidden gap-16'>
          <Column className='w-[300px] border-r overflow-y-auto px-16 py-20'>
            <CountsRow
              label='All species'
              count={list.length}
              selected={!selectedTaxon}
              onSelect={() => {
                setSelectedTaxon(undefined)
              }}
            />
            <TaxonomySection
              title='Taxonomy'
              nodes={taxonomyTree}
              bucket='user'
              selectedTaxon={selectedTaxon}
              selectedBucket={selectedTaxon ? 'user' : undefined}
              onSelectTaxon={(params) => {
                setSelectedTaxon(params.taxon)
              }}
              emptyText='No taxonomy data'
              className='mt-16'
            />
          </Column>

          <Column className='flex-1 min-h-0 overflow-y-auto p-16'>
            {!filtered.length ? (
              <p className='text-sm text-neutral-500'>No species found.</p>
            ) : (
              <ul className='grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-12'>
                {filtered.map((it) => (
                  <SpeciesCard key={it.speciesName} speciesName={it.speciesName} count={it.count} onClose={() => onOpenChange(false)} />
                ))}
              </ul>
            )}
          </Column>
        </Row>
      </DialogContent>
    </Dialog>
  )
}

type SpeciesCardProps = { speciesName: string; count: number; onClose?: () => void }

function SpeciesCard(props: SpeciesCardProps) {
  const { speciesName, count, onClose } = props
  const previewUrl = useSpeciesPreviewUrl({ speciesName })

  return (
    <li className='rounded-md border bg-white p-12'>
      <div className='-mt-12 -mx-12 mb-8'>
        <ImageWithDownloadName
          src={previewUrl}
          alt={speciesName}
          downloadName={speciesName}
          className='w-full h-[200px] object-contain rounded'
        />
      </div>
      <div className='flex items-center gap-8'>
        <span className='font-medium text-ink-primary truncate'>{speciesName}</span>
        <span className='ml-auto text-12 text-neutral-600'>{count}</span>
      </div>

      <Row className='mt-8 gap-4 justify-end'>
        <SpeciesDetailsDialog speciesName={speciesName}>
          <Button size='xsm'>View usage</Button>
        </SpeciesDetailsDialog>
      </Row>
    </li>
  )
}

function useSpeciesIndexWithContext(params?: { allowedNightIds?: Set<string> | undefined }) {
  const { allowedNightIds } = params || {}
  const detections = useStore(detectionsStore)

  const list = useMemo(() => {
    const counts: Record<string, number> = {}
    const previewPatchIds: Record<string, string> = {}

    for (const d of Object.values(detections ?? {})) {
      const det = d as any
      if (det?.detectedBy !== 'user') continue
      if (det?.morphospecies) continue
      if (!det?.taxon?.species) continue
      if (allowedNightIds && det?.nightId && !allowedNightIds.has(det.nightId)) continue

      const speciesName = String(det.taxon.species).trim()
      if (!speciesName) continue

      counts[speciesName] = (counts[speciesName] || 0) + 1
      if (!previewPatchIds[speciesName] && det?.patchId) {
        previewPatchIds[speciesName] = String(det.patchId)
      }
    }

    const arr = Object.entries(counts)
      .map(([speciesName, count]) => {
        const previewPatchId = previewPatchIds[speciesName]
        return { speciesName, count, previewPatchId }
      })
      .sort((a, b) => b.count - a.count)

    return arr
  }, [detections, allowedNightIds])

  return list
}

function buildSpeciesTaxonomyTree(params: {
  speciesList: Array<{ speciesName: string; count: number; previewPatchId?: string }>
  allowedNightIds?: Set<string> | undefined
  detections?: Record<string, any>
}): TaxonomyNode[] {
  const { speciesList, allowedNightIds, detections } = params
  const roots: TaxonomyNode[] = []
  const UNASSIGNED_LABEL = 'Unassigned'

  function ensureChild(nodes: TaxonomyNode[], rank: TaxonomyNode['rank'], name: string): TaxonomyNode {
    let node = nodes.find((n) => n.rank === rank && n.name === name)
    if (!node) {
      node = { rank, name, count: 0, children: [] }
      nodes.push(node)
    }
    node.count++
    return node
  }

  const speciesToTaxonomy = new Map<string, Array<{ rank: TaxonomyNode['rank']; name: string }>>()

  for (const speciesItem of speciesList) {
    const speciesName = speciesItem.speciesName
    let path: Array<{ rank: TaxonomyNode['rank']; name: string }> | undefined = speciesToTaxonomy.get(speciesName)

    if (!path) {
      let foundTaxonomy = false
      let klass: string | undefined
      let order: string | undefined
      let family: string | undefined
      let genus: string | undefined
      let species: string | undefined

      for (const d of Object.values(detections ?? {})) {
        const det = d as any
        if (det?.detectedBy !== 'user') continue
        if (det?.morphospecies) continue
        if (allowedNightIds && det?.nightId && !allowedNightIds.has(det.nightId)) continue
        const detSpecies = det?.taxon?.species as string | undefined
        if (!detSpecies || String(detSpecies).trim() !== speciesName) continue

        klass = klass || (det?.taxon?.class as string | undefined)
        order = order || (det?.taxon?.order as string | undefined)
        family = family || (det?.taxon?.family as string | undefined)
        genus = genus || (det?.taxon?.genus as string | undefined)
        species = species || detSpecies

        foundTaxonomy = true
      }

      if (!foundTaxonomy) continue

      path = []
      const hasSpecies = !!species
      const hasGenus = !!genus
      const hasFamily = !!family
      const hasOrder = !!order
      const hasAnyLowerThanClass = hasOrder || hasFamily || hasGenus || hasSpecies

      if (klass) path.push({ rank: 'class', name: klass })
      const orderName = hasAnyLowerThanClass ? order || UNASSIGNED_LABEL : undefined
      const familyName = hasFamily || hasGenus || hasSpecies ? family || UNASSIGNED_LABEL : undefined
      const genusName = hasGenus || hasSpecies ? genus || UNASSIGNED_LABEL : undefined
      if (orderName) path.push({ rank: 'order', name: orderName })
      if (familyName) path.push({ rank: 'family', name: familyName })
      if (genusName) path.push({ rank: 'genus', name: genusName })
      if (hasSpecies && species) path.push({ rank: 'species', name: species })

      if (path.length === 0) continue
      speciesToTaxonomy.set(speciesName, path)
    }

    let currentLevel = roots
    for (const seg of path) {
      const node = ensureChild(currentLevel, seg.rank, seg.name)
      if (!node.children) node.children = []
      currentLevel = node.children
    }
  }

  function sortTree(nodes: TaxonomyNode[]) {
    nodes.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    for (const n of nodes) sortTree(n.children || [])
  }
  sortTree(roots)
  return roots
}

function filterSpeciesByTaxon(params: {
  speciesList: Array<{ speciesName: string; count: number; previewPatchId?: string }>
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  allowedNightIds?: Set<string> | undefined
  detections?: Record<string, any>
}) {
  const { speciesList, selectedTaxon, allowedNightIds, detections } = params
  if (!selectedTaxon) return speciesList

  const result = speciesList.filter((speciesItem) => {
    const speciesName = speciesItem.speciesName
    for (const d of Object.values(detections ?? {})) {
      const det = d as any
      if (det?.detectedBy !== 'user') continue
      if (det?.morphospecies) continue
      if (allowedNightIds && det?.nightId && !allowedNightIds.has(det.nightId)) continue
      const detSpecies = det?.taxon?.species as string | undefined
      if (!detSpecies || String(detSpecies).trim() !== speciesName) continue

      const tax = det?.taxon
      let matches = false
      if (selectedTaxon.rank === 'class') matches = tax?.class === selectedTaxon.name
      else if (selectedTaxon.rank === 'order') matches = tax?.order === selectedTaxon.name
      else if (selectedTaxon.rank === 'family') matches = tax?.family === selectedTaxon.name
      else if (selectedTaxon.rank === 'genus') matches = tax?.genus === selectedTaxon.name
      else if (selectedTaxon.rank === 'species') matches = String(detSpecies).trim() === selectedTaxon.name

      if (matches) return true
    }
    return false
  })

  return result
}

function useSpeciesPreviewUrl(params: { speciesName: string }) {
  const { speciesName } = params
  const detections = useStore(detectionsStore)

  const previewPairs = useMemo(() => {
    const pairs: Array<{ nightId: string; patchId: string }> = []

    for (const d of Object.values(detections ?? {})) {
      const det = d as any
      if (det?.detectedBy !== 'user') continue
      if (det?.morphospecies) continue
      const detSpecies = det?.taxon?.species as string | undefined
      if (!detSpecies || String(detSpecies).trim() !== speciesName) continue
      if (det?.nightId && det?.patchId) {
        pairs.push({ nightId: det.nightId, patchId: String(det.patchId) })
        break
      }
    }
    return pairs
  }, [detections, speciesName])

  const previewFile = usePreviewFile({ previewPairs })
  const previewUrl = useObjectUrl(previewFile)
  return previewUrl
}

function countSpeciesForNightIds(params: { detections?: Record<string, any>; startsWith?: string; equals?: string }) {
  const { detections, startsWith, equals } = params
  const speciesSet = new Set<string>()
  for (const d of Object.values(detections || {})) {
    const det = d as any
    if (det?.detectedBy !== 'user') continue
    if (det?.morphospecies) continue
    const nightId = det?.nightId as string | undefined
    if (!nightId) continue
    if (equals && nightId !== equals) continue
    if (startsWith && !nightId.startsWith(startsWith)) continue
    const species = det?.taxon?.species as string | undefined
    if (species) speciesSet.add(String(species).trim())
  }
  return speciesSet.size
}

