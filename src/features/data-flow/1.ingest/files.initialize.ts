import { directoryFilesStore, indexedFilesStore } from './files.state'
import { buildNightIndexes } from './files.index'
import { ingestSpeciesListsFromFiles } from './species.ingest'
import { loadProjectSpeciesSelection } from '~/stores/species/project-species-list'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import { loadMorphoCovers } from '~/features/data-flow/3.persist/covers'
import { loadMorphoLinks } from '~/features/data-flow/3.persist/links'
import { morphoLinksStore } from '~/features/data-flow/3.persist/links'
import { normalizeLegacyNightId } from './ingest-paths'

type IndexedEntry = { file?: File; handle?: unknown; path: string; name: string; size: number }

type NightSummary = {
  nightId: string
  totalDetections: number
  totalIdentified: number
  updatedAt?: number
  morphoCounts?: Record<string, number>
  morphoPreviewPatchIds?: Record<string, string>
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
          const sourceNightId = normalizeLegacyNightId(rawNightId)
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

async function ensureTextFromIndexedEntry(entry: { file?: File; handle?: { getFile?: () => Promise<File> } }) {
  if (entry?.file) {
    const text = await entry.file.text()
    return text
  }

  const file = await entry?.handle?.getFile?.()
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

function isCanonicalNightId(nightId: string) {
  const normalized = normalizeLegacyNightId(nightId)
  const parts = (nightId ?? '').replaceAll('\\', '/').replace(/^\/+/, '').split('/').filter(Boolean)
  return parts.length === 3 && normalized === (nightId ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
}
