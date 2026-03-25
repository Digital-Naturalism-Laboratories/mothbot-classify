import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import type { DetectionEntity } from '~/stores/entities/detections'
import {
  buildMorphoTaxonomySummary,
  mergeMorphoTaxonomySummary,
  type MorphoTaxonomySummary,
  type NightSummaryEntity,
} from '~/stores/entities/night-summaries'
import type { TaxonomyNode } from '~/features/left-panel/left-panel.types'

export type MorphoCatalogItem = {
  key: string
  count: number
  hasOrder: boolean
  hasFamily: boolean
  hasGenus: boolean
}

export type MorphoTaxonSelection = {
  rank: 'class' | 'order' | 'family' | 'genus' | 'species'
  name: string
}

export function buildMorphoTaxonomyIndex(params: {
  summaries?: Record<string, NightSummaryEntity>
  allowedNightIds?: Set<string>
  detections?: Record<string, DetectionEntity>
}) {
  const { summaries, allowedNightIds, detections } = params
  const taxonomyByKey = new Map<string, MorphoTaxonomySummary>()

  for (const [nightId, summary] of Object.entries(summaries ?? {})) {
    if (allowedNightIds && !allowedNightIds.has(nightId)) continue

    for (const [key, taxonomy] of Object.entries(summary?.morphoTaxonomyByKey ?? {})) {
      taxonomyByKey.set(
        key,
        mergeMorphoTaxonomySummary({
          existing: taxonomyByKey.get(key),
          candidate: taxonomy,
        }),
      )
    }
  }

  for (const detection of Object.values(detections ?? {})) {
    if (detection?.detectedBy !== 'user') continue
    if (allowedNightIds && detection?.nightId && !allowedNightIds.has(detection.nightId)) continue

    const morphospecies = (detection?.morphospecies ?? '').trim()
    const key = normalizeMorphoKey(morphospecies)
    if (!key) continue
    if (taxonomyByKey.has(key)) continue

    taxonomyByKey.set(
      key,
      buildMorphoTaxonomySummary({
        taxon: detection?.taxon,
        morphospecies,
      }),
    )
  }

  return taxonomyByKey
}

export function buildMorphoCountIndex(params: {
  summaries?: Record<string, NightSummaryEntity>
  allowedNightIds?: Set<string>
}) {
  const { summaries, allowedNightIds } = params
  const counts: Record<string, number> = {}

  for (const [nightId, summary] of Object.entries(summaries ?? {})) {
    if (allowedNightIds && !allowedNightIds.has(nightId)) continue

    for (const [key, value] of Object.entries(summary?.morphoCounts ?? {})) {
      counts[key] = (counts[key] || 0) + (typeof value === 'number' ? value : 0)
    }
  }

  return counts
}

export function buildMorphoTaxonomyTree(params: {
  morphoList: MorphoCatalogItem[]
  taxonomyByKey: Map<string, MorphoTaxonomySummary>
}): TaxonomyNode[] {
  const { morphoList, taxonomyByKey } = params
  const roots: TaxonomyNode[] = []
  const unassignedLabel = 'Unassigned'

  function ensureChild(nodes: TaxonomyNode[], rank: TaxonomyNode['rank'], name: string, isMorphoSpecies?: boolean): TaxonomyNode {
    let node = nodes.find((entry) => entry.rank === rank && entry.name === name)
    if (!node) {
      node = { rank, name, count: 0, children: [] }
      nodes.push(node)
    }

    node.count++
    if (rank === 'species' && isMorphoSpecies) node.isMorpho = true
    return node
  }

  for (const morphoItem of morphoList) {
    const taxonomy = taxonomyByKey.get(morphoItem.key)
    const path = buildTaxonomyPath({ taxonomy, unassignedLabel })
    if (!path.length) continue

    let currentLevel = roots
    for (const segment of path) {
      const node = ensureChild(currentLevel, segment.rank, segment.name, segment.rank === 'species')
      if (!node.children) node.children = []
      currentLevel = node.children
    }
  }

  sortTaxonomyTree(roots)
  return roots
}

export function filterMorphospeciesByTaxon(params: {
  morphoList: MorphoCatalogItem[]
  selectedTaxon?: MorphoTaxonSelection
  taxonomyByKey: Map<string, MorphoTaxonomySummary>
}) {
  const { morphoList, selectedTaxon, taxonomyByKey } = params
  if (!selectedTaxon) return morphoList

  return morphoList.filter((morphoItem) => {
    const taxonomy = taxonomyByKey.get(morphoItem.key)
    if (!taxonomy) return false

    const speciesName = taxonomy.morphospecies || taxonomy.species
    if (selectedTaxon.rank === 'class') return taxonomy.class === selectedTaxon.name
    if (selectedTaxon.rank === 'order') return taxonomy.order === selectedTaxon.name
    if (selectedTaxon.rank === 'family') return taxonomy.family === selectedTaxon.name
    if (selectedTaxon.rank === 'genus') return taxonomy.genus === selectedTaxon.name
    return speciesName === selectedTaxon.name
  })
}

export function buildMorphoContextByKey(params: {
  taxonomyByKey: Map<string, MorphoTaxonomySummary>
}) {
  const { taxonomyByKey } = params
  const contextByKey = new Map<string, { hasOrder: boolean; hasFamily: boolean; hasGenus: boolean }>()

  for (const [key, taxonomy] of taxonomyByKey.entries()) {
    contextByKey.set(key, {
      hasOrder: !!taxonomy.order,
      hasFamily: !!taxonomy.family,
      hasGenus: !!taxonomy.genus,
    })
  }

  return contextByKey
}

function buildTaxonomyPath(params: {
  taxonomy?: MorphoTaxonomySummary
  unassignedLabel: string
}) {
  const { taxonomy, unassignedLabel } = params
  if (!taxonomy) return []

  const path: Array<{ rank: TaxonomyNode['rank']; name: string }> = []
  const speciesName = taxonomy.morphospecies || taxonomy.species
  const hasSpecies = !!speciesName
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
  if (hasSpecies && speciesName) path.push({ rank: 'species', name: speciesName })

  return path
}

function sortTaxonomyTree(nodes: TaxonomyNode[]) {
  nodes.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  for (const node of nodes) {
    sortTaxonomyTree(node.children || [])
  }
}
