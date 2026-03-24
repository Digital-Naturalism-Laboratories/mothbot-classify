import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'

export type MorphoPreviewPair = {
  nightId: string
  patchId: string
}

type SummaryLike = {
  morphoCounts?: Record<string, number>
  morphoPreviewPatchIds?: Record<string, string>
}

type DetectionLike = {
  nightId?: string
  patchId?: string
  detectedBy?: 'auto' | 'user'
  morphospecies?: string
}

type CoverLike = {
  nightId: string
  patchId: string
}

export function buildSummaryPreviewPairs(params: {
  morphoKey: string
  summaries?: Record<string, SummaryLike>
  nights?: Record<string, unknown>
  covers?: Record<string, CoverLike>
}) {
  const { morphoKey, summaries, nights, covers } = params
  const normalizedKey = normalizeMorphoKey(morphoKey)
  const pairs: MorphoPreviewPair[] = []

  const override = covers?.[normalizedKey]
  if (override?.nightId && override?.patchId) pairs.push({ nightId: override.nightId, patchId: override.patchId })

  for (const [nightId, summary] of Object.entries(summaries ?? {})) {
    const countForKey = summary?.morphoCounts?.[normalizedKey]
    if (!countForKey) continue
    if (nights && !nights[nightId]) continue

    const patchId = summary?.morphoPreviewPatchIds?.[normalizedKey]
    if (patchId) pairs.push({ nightId, patchId: String(patchId) })
  }

  return pairs
}

export function buildFallbackPreviewPairs(params: {
  morphoKey: string
  detections?: Record<string, DetectionLike>
}) {
  const { morphoKey, detections } = params
  const normalizedKey = normalizeMorphoKey(morphoKey)
  const seen = new Set<string>()
  const pairs: MorphoPreviewPair[] = []

  for (const detection of Object.values(detections ?? {})) {
    const morpho = typeof detection?.morphospecies === 'string' ? detection.morphospecies : ''
    if (normalizeMorphoKey(morpho) !== normalizedKey) continue
    if (detection?.detectedBy !== 'user') continue
    if (!detection?.nightId || !detection?.patchId) continue

    const pairKey = `${detection.nightId}::${detection.patchId}`
    if (seen.has(pairKey)) continue
    seen.add(pairKey)
    pairs.push({ nightId: detection.nightId, patchId: detection.patchId })
  }

  return pairs
}

export function selectMorphoPreviewPairs(params: {
  summaryPreviewPairs: MorphoPreviewPair[]
  fallbackPreviewPairs: MorphoPreviewPair[]
}) {
  const { summaryPreviewPairs, fallbackPreviewPairs } = params
  if (summaryPreviewPairs.length > 0) return summaryPreviewPairs
  return fallbackPreviewPairs
}
