import { buildTaxonFromShape, extractTaxonomyFromShape } from '~/models/taxonomy/extract'
import { extractMorphospeciesFromShape, normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { parseUserDetectionJsonSafely } from '~/features/data-flow/1.ingest/ingest-json'
import type { IndexedFile } from '~/features/data-flow/1.ingest/files.state'
import type { MorphoPreviewPair } from './morpho-preview'
import {
  buildMorphoTaxonomySummary,
  mergeMorphoTaxonomySummary,
  type MorphoTaxonomySummary,
} from '~/stores/entities/night-summaries'

export type MorphoIndexedFallback = {
  counts: Record<string, number>
  taxonomyByKey: Record<string, MorphoTaxonomySummary>
  previewPairsByKey: Record<string, MorphoPreviewPair[]>
}

type SummaryLike = {
  morphoCounts?: Record<string, number>
  morphoPreviewPatchIds?: Record<string, string>
  morphoTaxonomyByKey?: Record<string, MorphoTaxonomySummary>
}

export function getRelevantNightIdsForMorphoFallback(params: {
  allowedNightIds?: Set<string>
  summaries?: Record<string, SummaryLike>
  nightIds?: string[]
}) {
  const { allowedNightIds, summaries, nightIds } = params
  if (allowedNightIds?.size) return Array.from(allowedNightIds)

  const fromSummaries = Object.keys(summaries ?? {})
  if (fromSummaries.length) return fromSummaries

  return nightIds ?? []
}

export function shouldLoadMorphoIndexedFallback(params: {
  nightIds: string[]
  summaries?: Record<string, SummaryLike>
}) {
  const { nightIds, summaries } = params
  if (!nightIds.length) return false

  let hasMorphoCounts = false

  for (const nightId of nightIds) {
    const summary = summaries?.[nightId]
    const morphoCounts = summary?.morphoCounts ?? {}
    const morphoKeys = Object.keys(morphoCounts)
    if (!morphoKeys.length) continue

    hasMorphoCounts = true

    const previewPatchIds = summary?.morphoPreviewPatchIds ?? {}
    const taxonomyByKey = summary?.morphoTaxonomyByKey ?? {}
    const isComplete = morphoKeys.every((key) => Boolean(previewPatchIds[key]) && Boolean(taxonomyByKey[key]))
    if (!isComplete) return true
  }

  return !hasMorphoCounts
}

export function buildMorphoIndexedFallback(params: { shapesByNight: Record<string, any[]> }) {
  const { shapesByNight } = params
  const counts: Record<string, number> = {}
  const taxonomyByKey: Record<string, MorphoTaxonomySummary> = {}
  const previewPairsByKey: Record<string, MorphoPreviewPair[]> = {}
  const previewPairKeysByMorpho: Record<string, Set<string>> = {}

  for (const [nightId, shapes] of Object.entries(shapesByNight ?? {})) {
    for (const shape of shapes ?? []) {
      const isError = shape?.is_error === true || String(shape?.label || '').toUpperCase() === 'ERROR'
      const taxonomy = extractTaxonomyFromShape({ shape })
      const taxon = buildTaxonFromShape({ shape, taxonomy, isError })
      const morphospecies = extractMorphospeciesFromShape({ shape, taxonomy, taxon, isError })
      const key = normalizeMorphoKey(morphospecies ?? '')
      if (!key) continue
      const patchId = extractPatchIdFromShape(shape)

      counts[key] = (counts[key] || 0) + 1
      taxonomyByKey[key] = mergeMorphoTaxonomySummary({
        existing: taxonomyByKey[key],
        candidate: buildMorphoTaxonomySummary({ taxon, morphospecies }),
      })

      if (patchId) {
        addPreviewPair({
          previewPairsByKey,
          previewPairKeysByMorpho,
          morphoKey: key,
          pair: { nightId, patchId },
        })
      }
    }
  }

  return { counts, taxonomyByKey, previewPairsByKey }
}

export async function loadMorphoShapesByNight(params: {
  relevantNightIds: string[]
  filesByNightId?: Record<string, IndexedFile[]>
}) {
  const { relevantNightIds, filesByNightId } = params
  const shapesByNight: Record<string, any[]> = {}

  for (const nightId of relevantNightIds) {
    const files = filesByNightId?.[nightId] || []
    const identifiedFiles = files.filter((file) => (file?.name ?? '').toLowerCase().endsWith('_identified.json'))
    if (!identifiedFiles.length) continue

    const parsedFiles = await Promise.all(identifiedFiles.map((file) => parseUserDetectionJsonSafely({ file })))
    const shapes = parsedFiles.flatMap((parsed) => parsed?.shapes || [])
    if (shapes.length > 0) shapesByNight[nightId] = shapes
  }

  return shapesByNight
}

function addPreviewPair(params: {
  previewPairsByKey: Record<string, MorphoPreviewPair[]>
  previewPairKeysByMorpho: Record<string, Set<string>>
  morphoKey: string
  pair: MorphoPreviewPair
}) {
  const { previewPairsByKey, previewPairKeysByMorpho, morphoKey, pair } = params
  const pairKey = `${pair.nightId}::${pair.patchId}`

  if (!previewPairKeysByMorpho[morphoKey]) previewPairKeysByMorpho[morphoKey] = new Set<string>()
  if (previewPairKeysByMorpho[morphoKey].has(pairKey)) return

  previewPairKeysByMorpho[morphoKey].add(pairKey)
  previewPairsByKey[morphoKey] = [...(previewPairsByKey[morphoKey] || []), pair]
}

function extractPatchIdFromShape(shape: any) {
  const patchPath = typeof shape?.patch_path === 'string' ? shape.patch_path : ''
  const normalized = patchPath.replaceAll('\\', '/').trim()
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}
