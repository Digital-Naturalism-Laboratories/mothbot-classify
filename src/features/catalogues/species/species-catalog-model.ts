import { computeAllowedLeafGroupIds, type CatalogScopeIds } from '~/features/catalogues/shared/catalog-utils'
import type { ScopeType } from '~/features/catalogues/shared/scope-filters'
import type { DetectionEntity } from '~/stores/entities/detections'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import type { LeafGroupSummaryEntity, SpeciesTaxonomySummary } from '~/stores/entities/night-summaries'
import {
  buildSpeciesCatalogItems,
  buildSpeciesScopeCounts,
  buildSpeciesTaxonomyIndex,
  type SpeciesCatalogItem,
} from './species-data'

export type SpeciesCatalogModelInput = {
  summaries?: Record<string, LeafGroupSummaryEntity>
  detections?: Record<string, DetectionEntity>
  nights?: Record<string, LeafGroupEntity>
  scope: CatalogScopeIds
  usageScope: ScopeType
}

export type SpeciesCatalogView = {
  allowedLeafGroupIds?: Set<string>
  scopeCounts: Record<ScopeType, number>
  list: SpeciesCatalogItem[]
  taxonomyByName: Map<string, SpeciesTaxonomySummary>
}

export function buildSpeciesCatalogView(input: SpeciesCatalogModelInput): SpeciesCatalogView {
  const { summaries, detections, nights, scope, usageScope } = input
  const { projectId, siteId, deploymentId, leafGroupId } = scope

  const scopeCounts = buildSpeciesScopeCounts({
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

  const list = buildSpeciesCatalogItems({ summaries, allowedLeafGroupIds, detections })
  const taxonomyByName = buildSpeciesTaxonomyIndex({ summaries, allowedLeafGroupIds, detections })

  return { allowedLeafGroupIds, scopeCounts, list, taxonomyByName }
}
