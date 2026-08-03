import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { buildNightsRecordFromIds, computeAllowedLeafGroupIds } from '~/features/catalogues/shared/catalog-utils'
import type { ScopeType } from '~/features/catalogues/shared/scope-filters'
import { filesByLeafGroupIdStore } from '~/features/data-flow/1.ingest/files.state'
import type { LeafGroupSummaryEntity, MorphoTaxonomySummary } from '~/stores/entities/night-summaries'
import {
  buildMorphoIndexedFallback,
  getRelevantNightIdsForMorphoFallback,
  loadMorphoShapesByNight,
  shouldLoadMorphoIndexedFallback,
} from './morpho-indexed-fallback'
import type { MorphoPreviewPair } from './morpho-preview'

export type MorphoIndexedFallbackState = {
  counts: Record<string, number>
  taxonomyByKey: Map<string, MorphoTaxonomySummary>
  previewPairsByKey: Record<string, MorphoPreviewPair[]>
}

export function useMorphoIndexedFallback(params: {
  open: boolean
  summaries?: Record<string, LeafGroupSummaryEntity>
  leafGroupIds?: string[]
  usageScope: ScopeType
  projectId?: string
  siteId?: string
  deploymentId?: string
  leafGroupId?: string
}) {
  const { open, summaries, leafGroupIds, usageScope, projectId, siteId, deploymentId, leafGroupId } = params
  const filesByNightId = useStore(filesByLeafGroupIdStore)
  const [indexedFallback, setIndexedFallback] = useState<MorphoIndexedFallbackState>(createEmptyMorphoIndexedFallbackState)

  const stableLeafGroupIds = useMemo(() => leafGroupIds ?? [], [leafGroupIds])

  useEffect(() => {
    if (!open) return

    const allowedLeafGroupIds = computeAllowedLeafGroupIds({
      usageScope,
      summaries: summaries ?? {},
      nights: buildNightsRecordFromIds(stableLeafGroupIds),
      projectId,
      siteId,
      deploymentId,
      leafGroupId,
    })
    const relevantNightIds = getRelevantNightIdsForMorphoFallback({ allowedLeafGroupIds, summaries, leafGroupIds: stableLeafGroupIds })
    if (relevantNightIds.length === 0) {
      setIndexedFallback(createEmptyMorphoIndexedFallbackState())
      return
    }

    const shouldLoadFallback = shouldLoadMorphoIndexedFallback({ leafGroupIds: relevantNightIds, summaries })
    if (!shouldLoadFallback) {
      setIndexedFallback(createEmptyMorphoIndexedFallbackState())
      return
    }

    let cancelled = false

    async function loadIndexedFallback() {
      const shapesByNight = await loadMorphoShapesByNight({
        relevantNightIds,
        filesByNightId,
      })
      const fallback = buildMorphoIndexedFallback({ shapesByNight })
      if (cancelled) return

      setIndexedFallback({
        counts: fallback.counts,
        taxonomyByKey: new Map(Object.entries(fallback.taxonomyByKey)),
        previewPairsByKey: fallback.previewPairsByKey,
      })
    }

    void loadIndexedFallback()

    return () => {
      cancelled = true
    }
  }, [open, usageScope, summaries, stableLeafGroupIds, projectId, siteId, deploymentId, leafGroupId, filesByNightId])

  return indexedFallback
}

function createEmptyMorphoIndexedFallbackState(): MorphoIndexedFallbackState {
  return {
    counts: {},
    taxonomyByKey: new Map(),
    previewPairsByKey: {},
  }
}
