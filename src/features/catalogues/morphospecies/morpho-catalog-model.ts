import {
  buildCatalogScopeCounts,
  computeAllowedLeafGroupIds,
  type CatalogScopeIds,
} from '~/features/catalogues/shared/catalog-utils'
import type { ScopeType } from '~/features/catalogues/shared/scope-filters'
import type { DetectionEntity } from '~/stores/entities/detections'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import {
  buildMorphoContextByKey,
  buildMorphoTaxonomyIndex,
  mergeMorphoCountSources,
  type MorphoCatalogItem,
} from './morpho-taxonomy'
import { mergeMorphoTaxonomySummary, type MorphoTaxonomySummary, type LeafGroupSummaryEntity } from '~/stores/entities/night-summaries'

export type MorphoCatalogIndexedFallback = {
  counts: Record<string, number>
  taxonomyByKey: Map<string, MorphoTaxonomySummary>
}

export type MorphoCatalogModelInput = {
  summaries?: Record<string, LeafGroupSummaryEntity>
  detections?: Record<string, DetectionEntity>
  nights?: Record<string, LeafGroupEntity>
  scope: CatalogScopeIds
  usageScope: ScopeType
  indexedFallback?: MorphoCatalogIndexedFallback
}

export type MorphoCatalogView = {
  allowedLeafGroupIds?: Set<string>
  scopeCounts: Record<ScopeType, number>
  counts: Record<string, number>
  list: MorphoCatalogItem[]
  taxonomyByKey: Map<string, MorphoTaxonomySummary>
}

export function buildMorphoCatalogView(input: MorphoCatalogModelInput): MorphoCatalogView {
  const { summaries, detections, nights, scope, usageScope, indexedFallback } = input
  const { projectId, siteId, deploymentId, leafGroupId } = scope

  const scopeCounts = buildMorphoCatalogScopeCounts({
    summaries,
    detections,
    nights,
    projectId,
    siteId,
    deploymentId,
    leafGroupId,
  })

  const allowedLeafGroupIds = computeAllowedLeafGroupIds({
    usageScope,
    summaries: summaries ?? {},
    nights,
    projectId,
    siteId,
    deploymentId,
    leafGroupId,
  })

  const counts = mergeMorphoCountSources({
    summaries,
    detections,
    allowedLeafGroupIds,
    indexedFallbackCounts: indexedFallback?.counts,
  })

  const taxonomyByKey = buildMorphoTaxonomyIndex({ summaries, allowedLeafGroupIds, detections })
  if (indexedFallback?.taxonomyByKey) {
    for (const [key, taxonomy] of indexedFallback.taxonomyByKey.entries()) {
      taxonomyByKey.set(
        key,
        mergeMorphoTaxonomySummary({
          existing: taxonomyByKey.get(key),
          candidate: taxonomy,
        }),
      )
    }
  }

  const contextByKey = buildMorphoContextByKey({ taxonomyByKey })
  const list = Object.entries(counts)
    .map(([key, count]) => {
      const ctx = contextByKey.get(key) || { hasOrder: false, hasFamily: false, hasGenus: false }
      return { key, count, ...ctx }
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

  return { allowedLeafGroupIds, scopeCounts, counts, list, taxonomyByKey }
}

export function buildMorphoCatalogScopeCounts(params: {
  summaries?: Record<string, LeafGroupSummaryEntity>
  detections?: Record<string, DetectionEntity>
  nights?: Record<string, LeafGroupEntity>
  projectId?: string
  siteId?: string
  deploymentId?: string
  leafGroupId?: string
}): Record<ScopeType, number> {
  const { summaries, detections, nights, projectId, siteId, deploymentId, leafGroupId } = params

  return buildCatalogScopeCounts({
    summaries,
    nights,
    scopeIds: { projectId, siteId, deploymentId, leafGroupId },
    countForScope: (allowedLeafGroupIds) =>
      Object.keys(mergeMorphoCountSources({ summaries, detections, allowedLeafGroupIds })).length,
  })
}
