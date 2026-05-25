import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { buildNightsRecordFromIds, computeAllowedNightIds } from '~/features/catalogues/shared/catalog-utils'
import type { ScopeType } from '~/features/catalogues/shared/scope-filters'
import { filesByNightIdStore } from '~/features/data-flow/1.ingest/files.state'
import type { NightSummaryEntity, MorphoTaxonomySummary } from '~/stores/entities/night-summaries'
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
  summaries?: Record<string, NightSummaryEntity>
  nightIds?: string[]
  usageScope: ScopeType
  projectId?: string
  siteId?: string
  deploymentId?: string
  nightId?: string
}) {
  const { open, summaries, nightIds, usageScope, projectId, siteId, deploymentId, nightId } = params
  const filesByNightId = useStore(filesByNightIdStore)
  const [indexedFallback, setIndexedFallback] = useState<MorphoIndexedFallbackState>(createEmptyMorphoIndexedFallbackState)

  const stableNightIds = useMemo(() => nightIds ?? [], [nightIds])

  useEffect(() => {
    if (!open) return

    const allowedNightIds = computeAllowedNightIds({
      usageScope,
      summaries: summaries ?? {},
      nights: buildNightsRecordFromIds(stableNightIds),
      projectId,
      siteId,
      deploymentId,
      nightId,
    })
    const relevantNightIds = getRelevantNightIdsForMorphoFallback({ allowedNightIds, summaries, nightIds: stableNightIds })
    if (relevantNightIds.length === 0) {
      setIndexedFallback(createEmptyMorphoIndexedFallbackState())
      return
    }

    const shouldLoadFallback = shouldLoadMorphoIndexedFallback({ nightIds: relevantNightIds, summaries })
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
  }, [open, usageScope, summaries, stableNightIds, projectId, siteId, deploymentId, nightId, filesByNightId])

  return indexedFallback
}

function createEmptyMorphoIndexedFallbackState(): MorphoIndexedFallbackState {
  return {
    counts: {},
    taxonomyByKey: new Map(),
    previewPairsByKey: {},
  }
}
