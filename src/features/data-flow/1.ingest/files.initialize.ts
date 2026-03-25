import { directoryFilesStore, indexedFilesStore } from './files.state'
import { buildNightIndexes } from './files.index'
import { ingestSpeciesListsFromFiles } from './species.ingest'
import { loadProjectSpeciesSelection } from '~/stores/species/project-species-list'
import {
  buildMorphoTaxonomySummary,
  mergeMorphoTaxonomySummary,
  nightSummariesStore,
  type MorphoTaxonomySummary,
} from '~/stores/entities/night-summaries'
import { loadMorphoCovers } from '~/features/data-flow/3.persist/covers'
import { loadMorphoLinks } from '~/features/data-flow/3.persist/links'
import { morphoLinksStore } from '~/features/data-flow/3.persist/links'
import { normalizeLegacyNightId } from './ingest-paths'
import { parseUserDetectionJsonSafely } from './ingest-json'
import { buildTaxonFromShape, extractTaxonomyFromShape } from '~/models/taxonomy/extract'
import { extractMorphospeciesFromShape, normalizeMorphoKey } from '~/models/taxonomy/morphospecies'

type IndexedEntry = { file?: File; handle?: unknown; path: string; name: string; size: number }

type NightSummary = {
  nightId: string
  totalDetections: number
  totalIdentified: number
  updatedAt?: number
  morphoCounts?: Record<string, number>
  morphoPreviewPatchIds?: Record<string, string>
  morphoTaxonomyByKey?: Record<string, MorphoTaxonomySummary>
}

type SummarySource = 'placeholder' | 'legacy' | 'canonical'

export function applyIndexedFilesState(params: {
  indexed: IndexedEntry[]
}) {
  const { indexed } = params
  if (!Array.isArray(indexed) || indexed.length === 0) return

  directoryFilesStore.set(indexed.map((i) => i.file).filter((f): f is File => !!f))
  indexedFilesStore.set(indexed)

  buildNightIndexes({ files: indexed })

  preloadNightSummariesFromIndexed(indexed)
  preloadMorphoLinksFromIndexed(indexed)

  // Ingest species lists from either File or Handle entries
  void ingestSpeciesListsFromFiles({ files: indexed })
  void loadProjectSpeciesSelection()
  void loadMorphoCovers()
  void loadMorphoLinks()
}

export function preloadNightSummariesFromIndexed(
  indexed: IndexedEntry[],
) {
  try {
    const initialStore = nightSummariesStore.get() || {}
    const placeholdersByNightId: Record<string, NightSummary> = {}
    const sourceByNightId: Record<string, SummarySource> = {}
    const userJsonEntriesByNightId = groupUserJsonEntriesByNightId(indexed)

    for (const it of indexed) {
      const lower = (it?.name ?? '').toLowerCase()
      if (lower !== 'night_summary.json') continue
      const pathNorm = (it?.path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
      const parts = pathNorm.split('/').filter(Boolean)
      if (parts.length < 2) continue
      const baseParts = parts.slice(0, -1)
      if (baseParts.length < 3) continue
      const nightId = normalizeLegacyNightId(baseParts.join('/'))
      if (!placeholdersByNightId[nightId] && !initialStore[nightId]) {
        placeholdersByNightId[nightId] = { nightId, totalDetections: 0, totalIdentified: 0 }
        sourceByNightId[nightId] = 'placeholder'
      }

      void ensureTextFromIndexedEntry(it)
        .then((txt) => JSON.parse(txt))
        .then((json) => {
          const rawNightId = typeof json?.nightId === 'string' ? json.nightId : nightId
          const normalizedRawNightId = normalizeLegacyNightId(rawNightId)
          const sourceNightId = normalizedRawNightId === nightId ? normalizedRawNightId : nightId
          const sourceType: 'legacy' | 'canonical' = isCanonicalNightId(rawNightId) ? 'canonical' : 'legacy'
          const s: NightSummary = {
            nightId: sourceNightId,
            totalDetections: Number(json?.totalDetections) || 0,
            totalIdentified: Number(json?.totalIdentified) || 0,
            updatedAt: typeof json?.updatedAt === 'number' ? json.updatedAt : undefined,
            morphoCounts:
              typeof json?.morphoCounts === 'object' && json?.morphoCounts ? (json.morphoCounts as Record<string, number>) : undefined,
            morphoPreviewPatchIds:
              typeof json?.morphoPreviewPatchIds === 'object' && json?.morphoPreviewPatchIds
                ? (json.morphoPreviewPatchIds as Record<string, string>)
                : undefined,
            morphoTaxonomyByKey:
              typeof json?.morphoTaxonomyByKey === 'object' && json?.morphoTaxonomyByKey
                ? (json.morphoTaxonomyByKey as Record<string, MorphoTaxonomySummary>)
                : undefined,
          }
          const current = nightSummariesStore.get() || {}
          const existing = current[sourceNightId]
          const existingSource = sourceByNightId[sourceNightId] ?? 'canonical'
          const shouldReplace = shouldReplaceSummary({
            incoming: s,
            incomingSource: sourceType,
            existing,
            existingSource,
          })
          if (!shouldReplace) return
          sourceByNightId[sourceNightId] = sourceType
          nightSummariesStore.set({ ...current, [sourceNightId]: s })

          if (!hasMorphoTaxonomySummary(s)) {
            const userEntries = userJsonEntriesByNightId[sourceNightId] || []
            if (userEntries.length > 0) {
              void backfillMorphoTaxonomyForNight({ nightId: sourceNightId, entries: userEntries })
            }
          }
        })
        .catch(() => {})
    }
    if (Object.keys(placeholdersByNightId).length) {
      const current = nightSummariesStore.get() || {}
      nightSummariesStore.set({ ...placeholdersByNightId, ...current })
    }
  } catch {
    return
  }
}

function groupUserJsonEntriesByNightId(indexed: IndexedEntry[]) {
  const grouped: Record<string, IndexedEntry[]> = {}
  for (const entry of indexed) {
    const lower = (entry?.name ?? '').toLowerCase()
    if (!lower.endsWith('_identified.json')) continue
    const pathNorm = (entry?.path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
    const parts = pathNorm.split('/').filter(Boolean)
    if (parts.length < 4) continue
    const nightId = normalizeLegacyNightId(parts.slice(0, -1).join('/'))
    if (!nightId) continue
    if (!grouped[nightId]) grouped[nightId] = []
    grouped[nightId].push(entry)
  }
  return grouped
}

async function backfillMorphoTaxonomyForNight(params: {
  nightId: string
  entries: IndexedEntry[]
}) {
  const { nightId, entries } = params

  const morphoCounts: Record<string, number> = {}
  const morphoPreviewPatchIds: Record<string, string> = {}
  const morphoTaxonomyByKey: Record<string, MorphoTaxonomySummary> = {}
  for (const entry of entries) {
    const parsedUser = await parseUserDetectionJsonSafely({ file: entry as any })
    if (!parsedUser?.shapes?.length) continue

    for (const shape of parsedUser.shapes) {
      const isError = shape?.is_error === true || String(shape?.label || '').toUpperCase() === 'ERROR'
      const taxonomy = extractTaxonomyFromShape({ shape })
      const taxon = buildTaxonFromShape({ shape, taxonomy, isError })
      const morphospecies = extractMorphospeciesFromShape({ shape, taxonomy, taxon, isError })
      const key = normalizeMorphoKey(morphospecies)
      if (!key) continue
      const patchId = extractPatchIdFromShape(shape)

      morphoCounts[key] = (morphoCounts[key] || 0) + 1
      if (!morphoPreviewPatchIds[key] && patchId) morphoPreviewPatchIds[key] = patchId

      morphoTaxonomyByKey[key] = mergeMorphoTaxonomySummary({
        existing: morphoTaxonomyByKey[key],
        candidate: buildMorphoTaxonomySummary({ taxon, morphospecies }),
      })
    }
  }

  if (Object.keys(morphoCounts).length === 0) return

  const current = nightSummariesStore.get() || {}
  const existing = current[nightId]
  if (!existing) return
  if (hasCompleteMorphoSummary(existing)) return

  nightSummariesStore.set({
    ...current,
    [nightId]: {
      ...existing,
      morphoCounts: hasMorphoCounts(existing) ? existing.morphoCounts : morphoCounts,
      morphoPreviewPatchIds: hasMorphoPreviewPatchIds(existing) ? existing.morphoPreviewPatchIds : morphoPreviewPatchIds,
      morphoTaxonomyByKey,
    },
  })
}

export function preloadMorphoLinksFromIndexed(indexed: IndexedEntry[]) {
  try {
    const found: Array<{ entry: IndexedEntry }> = []
    for (const it of indexed) {
      const lower = (it?.name ?? '').toLowerCase()
      if (lower === 'morpho_links.json') found.push({ entry: it })
    }
    if (!found.length) return

    for (const { entry } of found) {
      void ensureTextFromIndexedEntry(entry)
        .then((txt) => JSON.parse(txt))
        .then((json) => {
          if (json && typeof json === 'object') {
            const current = morphoLinksStore.get() || {}
            morphoLinksStore.set({ ...current, ...(json as Record<string, string>) })
          }
        })
        .catch(() => {})
    }
  } catch {
    return
  }
}

async function ensureTextFromIndexedEntry(entry: { file?: File; handle?: unknown }) {
  if (entry?.file) {
    const text = await entry.file.text()
    return text
  }

  const handle = entry?.handle as { getFile?: () => Promise<File> } | undefined
  const file = await handle?.getFile?.()
  if (!file) return ''

  const text = await file.text()
  return text
}

function shouldReplaceSummary(params: {
  incoming: NightSummary
  incomingSource: Exclude<SummarySource, 'placeholder'>
  existing?: NightSummary
  existingSource: SummarySource
}) {
  const { incoming, incomingSource, existing, existingSource } = params
  if (!existing) return true

  if (typeof incoming.updatedAt === 'number' && typeof existing.updatedAt === 'number') {
    return incoming.updatedAt >= existing.updatedAt
  }
  if (typeof incoming.updatedAt === 'number' && typeof existing.updatedAt !== 'number') return true
  if (typeof incoming.updatedAt !== 'number' && typeof existing.updatedAt === 'number') return false

  if (incomingSource === existingSource) return true
  if (incomingSource === 'canonical') return true
  return existingSource === 'placeholder'
}

function hasMorphoTaxonomySummary(summary?: NightSummary) {
  return !!summary?.morphoTaxonomyByKey && Object.keys(summary.morphoTaxonomyByKey).length > 0
}

function hasMorphoCounts(summary?: NightSummary) {
  return !!summary?.morphoCounts && Object.keys(summary.morphoCounts).length > 0
}

function hasMorphoPreviewPatchIds(summary?: NightSummary) {
  return !!summary?.morphoPreviewPatchIds && Object.keys(summary.morphoPreviewPatchIds).length > 0
}

function hasCompleteMorphoSummary(summary?: NightSummary) {
  return hasMorphoCounts(summary) && hasMorphoPreviewPatchIds(summary) && hasMorphoTaxonomySummary(summary)
}

function extractPatchIdFromShape(shape: any) {
  const patchPath = typeof shape?.patch_path === 'string' ? shape.patch_path : ''
  const normalized = patchPath.replaceAll('\\', '/').trim()
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function isCanonicalNightId(nightId: string) {
  const normalized = normalizeLegacyNightId(nightId)
  const parts = (nightId ?? '').replaceAll('\\', '/').replace(/^\/+/, '').split('/').filter(Boolean)
  return parts.length === 3 && normalized === (nightId ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
}
