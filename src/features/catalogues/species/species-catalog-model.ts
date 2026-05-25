import { computeAllowedNightIds, type CatalogScopeIds } from '~/features/catalogues/shared/catalog-utils'
import type { ScopeType } from '~/features/catalogues/shared/scope-filters'
import type { DetectionEntity } from '~/stores/entities/detections'
import type { NightEntity } from '~/stores/entities/4.nights'
import type { NightSummaryEntity, SpeciesTaxonomySummary } from '~/stores/entities/night-summaries'
import {
  buildSpeciesCatalogItems,
  buildSpeciesScopeCounts,
  buildSpeciesTaxonomyIndex,
  type SpeciesCatalogItem,
} from './species-data'

export type SpeciesCatalogModelInput = {
  summaries?: Record<string, NightSummaryEntity>
  detections?: Record<string, DetectionEntity>
  nights?: Record<string, NightEntity>
  scope: CatalogScopeIds
  usageScope: ScopeType
}

export type SpeciesCatalogView = {
  allowedNightIds?: Set<string>
  scopeCounts: Record<ScopeType, number>
  list: SpeciesCatalogItem[]
  taxonomyByName: Map<string, SpeciesTaxonomySummary>
}

export function buildSpeciesCatalogView(input: SpeciesCatalogModelInput): SpeciesCatalogView {
  const { summaries, detections, nights, scope, usageScope } = input
  const { projectId, siteId, deploymentId, nightId } = scope

  const scopeCounts = buildSpeciesScopeCounts({
    summaries,
    detections,
    nights,
    projectId,
    siteId,
    deploymentId,
    nightId,
  })

  const allowedNightIds = computeAllowedNightIds({
    usageScope,
    summaries: summaries ?? {},
    nights,
    projectId,
    siteId,
    deploymentId,
    nightId,
  })

  const list = buildSpeciesCatalogItems({ summaries, allowedNightIds, detections })
  const taxonomyByName = buildSpeciesTaxonomyIndex({ summaries, allowedNightIds, detections })

  return { allowedNightIds, scopeCounts, list, taxonomyByName }
}
