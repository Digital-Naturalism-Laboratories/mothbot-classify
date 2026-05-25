import { directoryFilesStore, indexedFilesStore } from './files.state'
import { buildNightIndexes } from './files.index'
import { ingestSpeciesListsFromFiles } from './species.ingest'
import { loadProjectSpeciesSelection } from '~/stores/species/project-species-list'
import {
  buildSpeciesTaxonomySummary,
  buildMorphoTaxonomySummary,
  mergeSpeciesTaxonomySummary,
  mergeMorphoTaxonomySummary,
  leafGroupSummariesStore,
  type LeafGroupSummaryEntity,
  type SpeciesTaxonomySummary,
  type MorphoTaxonomySummary,
} from '~/stores/entities/night-summaries'
import { loadMorphoCovers } from '~/features/data-flow/3.persist/covers'
import { loadMorphoLinks } from '~/features/data-flow/3.persist/links'
import { setMorphoLinksForActiveDataset } from '~/features/data-flow/3.persist/links'
import {
  parseMorphoLinksJson,
  parseMorphoLinksNdjson,
} from '~/features/mothbox-next/morpho-links-package'
import { normalizeLegacyNightId } from './ingest-paths'
import type { IngestMode } from './ingest-mode'
import { excludePackageArchiveIndexedFiles } from './reserved-paths'
import { parseUserDetectionJsonSafely } from './ingest-json'
import { buildTaxonFromShape, extractTaxonomyFromShape } from '~/models/taxonomy/extract'
import { extractMorphospeciesFromShape, normalizeMorphoKey } from '~/models/taxonomy/morphospecies'

type IndexedEntry = { file?: File; handle?: unknown; path: string; name: string; size: number }

type NightSummary = LeafGroupSummaryEntity

type SummarySource = 'placeholder' | 'legacy' | 'canonical'

export function applyIndexedFilesState(params: {
  indexed: IndexedEntry[]
  ingestMode: IngestMode
}) {
  const { indexed, ingestMode } = params
  if (!Array.isArray(indexed) || indexed.length === 0) return

  const isPackage = ingestMode === 'mothbox-next'
  const storedIndexed = isPackage ? excludePackageArchiveIndexedFiles(indexed) : indexed

  directoryFilesStore.set(storedIndexed.map((i) => i.file).filter((f): f is File => !!f))
  indexedFilesStore.set(storedIndexed)

  buildNightIndexes({ files: storedIndexed })

  if (!isPackage) {
    preloadNightSummariesFromIndexed(storedIndexed)
  }

  if (!isPackage) {
    preloadMorphoLinksFromIndexed(storedIndexed)
    void loadMorphoLinks()
  }

  void ingestSpeciesListsFromFiles({ files: storedIndexed })
  void loadProjectSpeciesSelection()
  void loadMorphoCovers()
}

export function preloadNightSummariesFromIndexed(
  indexed: IndexedEntry[],
) {
  try {
    const initialStore = leafGroupSummariesStore.get() || {}
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
      const leafGroupId = normalizeLegacyNightId(baseParts.join('/'))
      if (!placeholdersByNightId[leafGroupId] && !initialStore[leafGroupId]) {
        placeholdersByNightId[leafGroupId] = { leafGroupId, totalDetections: 0, totalIdentified: 0 }
        sourceByNightId[leafGroupId] = 'placeholder'
      }

      void ensureTextFromIndexedEntry(it)
        .then((txt) => JSON.parse(txt))
        .then((json) => {
          const rawNightId = typeof json?.leafGroupId === 'string' ? json.leafGroupId : leafGroupId
          const normalizedRawNightId = normalizeLegacyNightId(rawNightId)
          const sourceNightId = normalizedRawNightId === leafGroupId ? normalizedRawNightId : leafGroupId
          const sourceType: 'legacy' | 'canonical' = isCanonicalNightId(rawNightId) ? 'canonical' : 'legacy'
          const s: NightSummary = {
            leafGroupId: sourceNightId,
            totalDetections: Number(json?.totalDetections) || 0,
            totalIdentified: Number(json?.totalIdentified) || 0,
            updatedAt: typeof json?.updatedAt === 'number' ? json.updatedAt : undefined,
            speciesCounts:
              typeof json?.speciesCounts === 'object' && json?.speciesCounts ? (json.speciesCounts as Record<string, number>) : undefined,
            speciesPreviewPatchIds:
              typeof json?.speciesPreviewPatchIds === 'object' && json?.speciesPreviewPatchIds
                ? (json.speciesPreviewPatchIds as Record<string, string>)
                : undefined,
            speciesTaxonomyByName:
              typeof json?.speciesTaxonomyByName === 'object' && json?.speciesTaxonomyByName
                ? (json.speciesTaxonomyByName as Record<string, SpeciesTaxonomySummary>)
                : undefined,
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
          const current = leafGroupSummariesStore.get() || {}
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
          leafGroupSummariesStore.set({ ...current, [sourceNightId]: s })

          if (shouldBackfillSummaryTaxonomy(s)) {
            const userEntries = userJsonEntriesByNightId[sourceNightId] || []
            if (userEntries.length > 0) {
              void backfillTaxonomySummariesForNight({ leafGroupId: sourceNightId, entries: userEntries })
            }
          }
        })
        .catch(() => {})
    }
    if (Object.keys(placeholdersByNightId).length) {
      const current = leafGroupSummariesStore.get() || {}
      leafGroupSummariesStore.set({ ...placeholdersByNightId, ...current })
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
    const leafGroupId = normalizeLegacyNightId(parts.slice(0, -1).join('/'))
    if (!leafGroupId) continue
    if (!grouped[leafGroupId]) grouped[leafGroupId] = []
    grouped[leafGroupId].push(entry)
  }
  return grouped
}

async function backfillTaxonomySummariesForNight(params: {
  leafGroupId: string
  entries: IndexedEntry[]
}) {
  const { leafGroupId, entries } = params

  const speciesCounts: Record<string, number> = {}
  const speciesPreviewPatchIds: Record<string, string> = {}
  const speciesTaxonomyByName: Record<string, SpeciesTaxonomySummary> = {}
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
      const key = normalizeMorphoKey(morphospecies ?? '')
      const patchId = extractPatchIdFromShape(shape)

      const speciesName = !key ? String(taxon?.species ?? '').trim() : ''
      if (speciesName) {
        speciesCounts[speciesName] = (speciesCounts[speciesName] || 0) + 1
        if (!speciesPreviewPatchIds[speciesName] && patchId) speciesPreviewPatchIds[speciesName] = patchId

        speciesTaxonomyByName[speciesName] = mergeSpeciesTaxonomySummary({
          existing: speciesTaxonomyByName[speciesName],
          candidate: buildSpeciesTaxonomySummary({ taxon }),
        })
      }

      if (!key) continue

      morphoCounts[key] = (morphoCounts[key] || 0) + 1
      if (!morphoPreviewPatchIds[key] && patchId) morphoPreviewPatchIds[key] = patchId

      morphoTaxonomyByKey[key] = mergeMorphoTaxonomySummary({
        existing: morphoTaxonomyByKey[key],
        candidate: buildMorphoTaxonomySummary({ taxon, morphospecies }),
      })
    }
  }

  if (Object.keys(morphoCounts).length === 0 && Object.keys(speciesCounts).length === 0) return

  const current = leafGroupSummariesStore.get() || {}
  const existing = current[leafGroupId]
  if (!existing) return
  if (hasCompleteMorphoSummary(existing) && hasCompleteSpeciesSummary(existing)) return

  leafGroupSummariesStore.set({
    ...current,
    [leafGroupId]: {
      ...existing,
      speciesCounts: hasSpeciesCounts(existing) ? existing.speciesCounts : speciesCounts,
      speciesPreviewPatchIds: hasSpeciesPreviewPatchIds(existing) ? existing.speciesPreviewPatchIds : speciesPreviewPatchIds,
      speciesTaxonomyByName: hasSpeciesTaxonomySummary(existing) ? existing.speciesTaxonomyByName : speciesTaxonomyByName,
      morphoCounts: hasMorphoCounts(existing) ? existing.morphoCounts : morphoCounts,
      morphoPreviewPatchIds: hasMorphoPreviewPatchIds(existing) ? existing.morphoPreviewPatchIds : morphoPreviewPatchIds,
      morphoTaxonomyByKey: hasMorphoTaxonomySummary(existing) ? existing.morphoTaxonomyByKey : morphoTaxonomyByKey,
    },
  })
}

export function preloadMorphoLinksFromIndexed(indexed: IndexedEntry[]) {
  try {
    const found: Array<{ entry: IndexedEntry }> = []
    for (const it of indexed) {
      const lower = (it?.name ?? '').toLowerCase()
      if (lower === 'morpho_links.json' || lower === 'morpho-links.ndjson') found.push({ entry: it })
    }
    if (!found.length) return

    for (const { entry } of found) {
      void ensureTextFromIndexedEntry(entry)
        .then(async (txt) => {
          const lowerName = (entry?.name ?? '').toLowerCase()
          if (lowerName === 'morpho-links.ndjson') return parseMorphoLinksNdjson(txt)
          return parseMorphoLinksJson(txt)
        })
        .then((links) => {
          if (links) setMorphoLinksForActiveDataset({ links, mode: 'merge' })
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

function shouldBackfillSummaryTaxonomy(summary?: NightSummary) {
  return !hasCompleteMorphoSummary(summary) || !hasCompleteSpeciesSummary(summary)
}

function hasSpeciesTaxonomySummary(summary?: NightSummary) {
  return !!summary?.speciesTaxonomyByName && Object.keys(summary.speciesTaxonomyByName).length > 0
}

function hasSpeciesCounts(summary?: NightSummary) {
  return !!summary?.speciesCounts && Object.keys(summary.speciesCounts).length > 0
}

function hasSpeciesPreviewPatchIds(summary?: NightSummary) {
  return !!summary?.speciesPreviewPatchIds && Object.keys(summary.speciesPreviewPatchIds).length > 0
}

function hasCompleteSpeciesSummary(summary?: NightSummary) {
  return hasSpeciesCounts(summary) && hasSpeciesPreviewPatchIds(summary) && hasSpeciesTaxonomySummary(summary)
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

function isCanonicalNightId(leafGroupId: string) {
  const normalized = normalizeLegacyNightId(leafGroupId)
  const parts = (leafGroupId ?? '').replaceAll('\\', '/').replace(/^\/+/, '').split('/').filter(Boolean)
  return parts.length === 3 && normalized === (leafGroupId ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
}
