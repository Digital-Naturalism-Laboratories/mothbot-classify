import type { TaxonomyNode } from '~/features/left-panel/left-panel.types'
import { buildCatalogScopeCounts } from '~/features/catalogues/shared/catalog-utils'
import {
  buildSpeciesTaxonomySummary,
  mergeSpeciesTaxonomySummary,
  type LeafGroupSummaryEntity,
  type SpeciesTaxonomySummary,
} from '~/stores/entities/night-summaries'
import type { DetectionEntity } from '~/stores/entities/detections'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'

export type SpeciesCatalogItem = {
  speciesName: string
  count: number
  previewPairs: SpeciesPreviewPair[]
}

export type SpeciesPreviewPair = {
  leafGroupId: string
  patchId: string
}

export type SpeciesTaxonSelection = {
  rank: 'class' | 'order' | 'family' | 'genus' | 'species'
  name: string
}

export type SpeciesUsageSummary = {
  instanceCount: number
  leafGroupIds: string[]
  projectIds: string[]
  previewPairs: SpeciesPreviewPair[]
}

export function buildSpeciesScopeCounts(params: {
  summaries?: Record<string, LeafGroupSummaryEntity>
  detections?: Record<string, DetectionEntity>
  nights?: Record<string, LeafGroupEntity>
  projectId?: string
  siteId?: string
  deploymentId?: string
  leafGroupId?: string
}) {
  const { summaries, detections, nights, projectId, siteId, deploymentId, leafGroupId } = params

  return buildCatalogScopeCounts({
    summaries,
    nights,
    scopeIds: { projectId, siteId, deploymentId, leafGroupId },
    countForScope: (allowedLeafGroupIds) =>
      Object.keys(mergeSpeciesCountSources({ summaries, detections, allowedLeafGroupIds })).length,
  })
}

export function buildSpeciesCatalogItems(params: {
  summaries?: Record<string, LeafGroupSummaryEntity>
  allowedLeafGroupIds?: Set<string>
  detections?: Record<string, DetectionEntity>
}) {
  const { summaries, allowedLeafGroupIds, detections } = params
  const counts = mergeSpeciesCountSources({ summaries, allowedLeafGroupIds, detections })
  const previewPairsByName = buildSpeciesPreviewPairsByName({ summaries, allowedLeafGroupIds, detections })

  return Object.entries(counts)
    .map(([speciesName, count]) => ({
      speciesName,
      count,
      previewPairs: previewPairsByName.get(speciesName) || [],
    }))
    .sort((a, b) => b.count - a.count || a.speciesName.localeCompare(b.speciesName))
}

export function buildSpeciesTaxonomyIndex(params: {
  summaries?: Record<string, LeafGroupSummaryEntity>
  allowedLeafGroupIds?: Set<string>
  detections?: Record<string, DetectionEntity>
}) {
  const { summaries, allowedLeafGroupIds, detections } = params
  const taxonomyByName = new Map<string, SpeciesTaxonomySummary>()

  for (const [leafGroupId, summary] of Object.entries(summaries ?? {})) {
    if (allowedLeafGroupIds && !allowedLeafGroupIds.has(leafGroupId)) continue

    for (const [speciesName, taxonomy] of Object.entries(summary?.speciesTaxonomyByName ?? {})) {
      taxonomyByName.set(
        speciesName,
        mergeSpeciesTaxonomySummary({
          existing: taxonomyByName.get(speciesName),
          candidate: taxonomy,
        }),
      )
    }
  }

  for (const detection of Object.values(detections ?? {})) {
    if (!isCatalogSpeciesDetection(detection)) continue
    if (allowedLeafGroupIds && detection?.leafGroupId && !allowedLeafGroupIds.has(detection.leafGroupId)) continue

    const speciesName = normalizeSpeciesName(detection?.taxon?.species)
    if (!speciesName) continue

    taxonomyByName.set(
      speciesName,
      mergeSpeciesTaxonomySummary({
        existing: taxonomyByName.get(speciesName),
        candidate: buildSpeciesTaxonomySummary({ taxon: detection?.taxon }),
      }),
    )
  }

  return taxonomyByName
}

export function buildSpeciesTaxonomyTree(params: {
  speciesList: SpeciesCatalogItem[]
  taxonomyByName: Map<string, SpeciesTaxonomySummary>
}): TaxonomyNode[] {
  const { speciesList, taxonomyByName } = params
  const roots: TaxonomyNode[] = []
  const unassignedLabel = 'Unassigned'

  for (const speciesItem of speciesList) {
    const taxonomy = taxonomyByName.get(speciesItem.speciesName)
    const path = buildSpeciesTaxonomyPath({ taxonomy, unassignedLabel })
    if (!path.length) continue

    let currentLevel = roots
    for (const segment of path) {
      const node = ensureTaxonomyChild({ nodes: currentLevel, rank: segment.rank, name: segment.name })
      if (!node.children) node.children = []
      currentLevel = node.children
    }
  }

  sortTaxonomyTree(roots)
  return roots
}

export function filterSpeciesByTaxon(params: {
  speciesList: SpeciesCatalogItem[]
  selectedTaxon?: SpeciesTaxonSelection
  taxonomyByName: Map<string, SpeciesTaxonomySummary>
}) {
  const { speciesList, selectedTaxon, taxonomyByName } = params
  if (!selectedTaxon) return speciesList

  return speciesList.filter((speciesItem) => {
    const taxonomy = taxonomyByName.get(speciesItem.speciesName)
    if (!taxonomy) return false

    if (selectedTaxon.rank === 'class') return taxonomy.class === selectedTaxon.name
    if (selectedTaxon.rank === 'order') return taxonomy.order === selectedTaxon.name
    if (selectedTaxon.rank === 'family') return taxonomy.family === selectedTaxon.name
    if (selectedTaxon.rank === 'genus') return taxonomy.genus === selectedTaxon.name
    return taxonomy.species === selectedTaxon.name
  })
}

export function buildSpeciesUsageSummary(params: {
  speciesName: string
  summaries?: Record<string, LeafGroupSummaryEntity>
  nights?: Record<string, LeafGroupEntity>
  allowedLeafGroupIds?: Set<string>
  detections?: Record<string, DetectionEntity>
}) {
  const { speciesName, summaries, nights, allowedLeafGroupIds, detections } = params
  const leafGroupIds: string[] = []
  const projectIds = new Set<string>()
  const previewPairsByName = buildSpeciesPreviewPairsByName({ summaries, allowedLeafGroupIds, detections })
  let instanceCount = 0

  for (const [leafGroupId, summary] of Object.entries(summaries ?? {})) {
    if (allowedLeafGroupIds && !allowedLeafGroupIds.has(leafGroupId)) continue

    const count = summary?.speciesCounts?.[speciesName]
    if (!count) continue

    leafGroupIds.push(leafGroupId)
    instanceCount += count

    const projectId = nights?.[leafGroupId]?.projectId
    if (projectId) projectIds.add(projectId)
  }

  return {
    instanceCount,
    leafGroupIds,
    projectIds: Array.from(projectIds),
    previewPairs: previewPairsByName.get(speciesName) || [],
  }
}

export function mergeSpeciesCountSources(params: {
  summaries?: Record<string, LeafGroupSummaryEntity>
  detections?: Record<string, DetectionEntity>
  allowedLeafGroupIds?: Set<string>
}) {
  const fromSummaries = buildSpeciesCountIndex(params)
  const fromDetections = buildSpeciesCountIndexFromDetections(params)
  const counts: Record<string, number> = {}
  const keys = new Set([...Object.keys(fromSummaries), ...Object.keys(fromDetections)])

  for (const key of keys) {
    const usageCount = fromDetections[key] || fromSummaries[key] || 0
    if (usageCount <= 0) continue
    counts[key] = usageCount
  }

  return counts
}

function buildSpeciesCountIndexFromDetections(params: {
  detections?: Record<string, DetectionEntity>
  allowedLeafGroupIds?: Set<string>
}) {
  const { detections, allowedLeafGroupIds } = params
  const counts: Record<string, number> = {}

  for (const detection of Object.values(detections ?? {})) {
    if (!isCatalogSpeciesDetection(detection)) continue
    if (allowedLeafGroupIds && detection?.leafGroupId && !allowedLeafGroupIds.has(detection.leafGroupId)) continue

    const speciesName = normalizeSpeciesName(detection?.taxon?.species)
    if (!speciesName) continue

    counts[speciesName] = (counts[speciesName] || 0) + 1
  }

  return counts
}

function buildSpeciesCountIndex(params: {
  summaries?: Record<string, LeafGroupSummaryEntity>
  allowedLeafGroupIds?: Set<string>
}) {
  const { summaries, allowedLeafGroupIds } = params
  const counts: Record<string, number> = {}

  for (const [leafGroupId, summary] of Object.entries(summaries ?? {})) {
    if (allowedLeafGroupIds && !allowedLeafGroupIds.has(leafGroupId)) continue

    for (const [speciesName, value] of Object.entries(summary?.speciesCounts ?? {})) {
      counts[speciesName] = (counts[speciesName] || 0) + (typeof value === 'number' ? value : 0)
    }
  }

  return counts
}

function buildSpeciesPreviewPairsByName(params: {
  summaries?: Record<string, LeafGroupSummaryEntity>
  allowedLeafGroupIds?: Set<string>
  detections?: Record<string, DetectionEntity>
}) {
  const { summaries, allowedLeafGroupIds, detections } = params
  const previewPairsByName = new Map<string, SpeciesPreviewPair[]>()

  for (const [leafGroupId, summary] of Object.entries(summaries ?? {})) {
    if (allowedLeafGroupIds && !allowedLeafGroupIds.has(leafGroupId)) continue

    for (const [speciesName, patchId] of Object.entries(summary?.speciesPreviewPatchIds ?? {})) {
      if (!patchId) continue
      appendPreviewPair({
        previewPairsByName,
        speciesName,
        previewPair: { leafGroupId, patchId },
      })
    }
  }

  for (const detection of Object.values(detections ?? {})) {
    if (!isCatalogSpeciesDetection(detection)) continue
    if (allowedLeafGroupIds && detection?.leafGroupId && !allowedLeafGroupIds.has(detection.leafGroupId)) continue

    const speciesName = normalizeSpeciesName(detection?.taxon?.species)
    const leafGroupId = detection?.leafGroupId
    const patchId = detection?.patchId ? String(detection.patchId) : ''
    if (!speciesName || !leafGroupId || !patchId) continue

    appendPreviewPair({
      previewPairsByName,
      speciesName,
      previewPair: { leafGroupId, patchId },
    })
  }

  return previewPairsByName
}

function buildSpeciesTaxonomyPath(params: {
  taxonomy?: SpeciesTaxonomySummary
  unassignedLabel: string
}) {
  const { taxonomy, unassignedLabel } = params
  if (!taxonomy) return []

  const path: Array<{ rank: TaxonomyNode['rank']; name: string }> = []
  const hasSpecies = !!taxonomy.species
  const hasGenus = !!taxonomy.genus
  const hasFamily = !!taxonomy.family
  const hasOrder = !!taxonomy.order
  const hasAnyLowerThanClass = hasOrder || hasFamily || hasGenus || hasSpecies

  if (taxonomy.class) path.push({ rank: 'class', name: taxonomy.class })

  const orderName = hasAnyLowerThanClass ? taxonomy.order || unassignedLabel : undefined
  const familyName = hasFamily || hasGenus || hasSpecies ? taxonomy.family || unassignedLabel : undefined
  const genusName = hasGenus || hasSpecies ? taxonomy.genus || unassignedLabel : undefined

  if (orderName) path.push({ rank: 'order', name: orderName })
  if (familyName) path.push({ rank: 'family', name: familyName })
  if (genusName) path.push({ rank: 'genus', name: genusName })
  if (taxonomy.species) path.push({ rank: 'species', name: taxonomy.species })

  return path
}

function ensureTaxonomyChild(params: {
  nodes: TaxonomyNode[]
  rank: TaxonomyNode['rank']
  name: string
}) {
  const { nodes, rank, name } = params
  let node = nodes.find((entry) => entry.rank === rank && entry.name === name)
  if (!node) {
    node = { rank, name, count: 0, children: [] }
    nodes.push(node)
  }

  node.count++
  return node
}

function appendPreviewPair(params: {
  previewPairsByName: Map<string, SpeciesPreviewPair[]>
  speciesName: string
  previewPair: SpeciesPreviewPair
}) {
  const { previewPairsByName, speciesName, previewPair } = params
  const existing = previewPairsByName.get(speciesName) || []
  const alreadyIncluded = existing.some((entry) => entry.leafGroupId === previewPair.leafGroupId && entry.patchId === previewPair.patchId)
  if (alreadyIncluded) return

  previewPairsByName.set(speciesName, [...existing, previewPair])
}

function sortTaxonomyTree(nodes: TaxonomyNode[]) {
  nodes.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  for (const node of nodes) {
    sortTaxonomyTree(node.children || [])
  }
}

function isCatalogSpeciesDetection(detection?: DetectionEntity) {
  return detection?.detectedBy === 'user' && !detection?.morphospecies && !!normalizeSpeciesName(detection?.taxon?.species)
}

function normalizeSpeciesName(value?: string) {
  const trimmed = String(value ?? '').trim()
  return trimmed || ''
}
