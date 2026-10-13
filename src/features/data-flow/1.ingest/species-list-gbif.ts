/**
 * Fills in GBIF download metadata (DOI, description, license) for species lists.
 *
 * Sources, in order: the `.gbif.json` sidecar Mothbot Process saves next to the
 * CSV, this browser's IndexedDB cache, then the GBIF API. Everything works
 * offline — a list whose DOI can't be fetched stays `pending` (IDs reference
 * its GBIF download page) and is retried when the browser comes back online.
 */

import type { SpeciesList } from '~/features/data-flow/2.identify/species-list.store'
import { speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import {
  GBIF_DOWNLOAD_API,
  GBIF_SIDECAR_SUFFIX,
  type GbifDownloadInfo,
  gbifDownloadInfoFromApi,
  gbifDownloadPageUrl,
  gbifSidecarPathForCsv,
  parseGbifSidecar,
  speciesListNameFromGbif,
} from '~/models/taxonomy/species-list-source'
import { DB_NAME, idbGet, idbPut } from '~/utils/index-db'
import type { IndexedFile } from './files.state'

const IDB_STORE = 'gbif-downloads'
const FETCH_TIMEOUT_MS = 8000

export function isGbifSidecarPath(path: string) {
  return (path ?? '').toLowerCase().endsWith(GBIF_SIDECAR_SUFFIX)
}

/** Looks up the `.gbif.json` sidecar (if any) that sits next to each CSV. */
export function indexGbifSidecars(files: IndexedFile[]) {
  const sidecars = new Map<string, IndexedFile>()
  for (const f of files) if (isGbifSidecarPath(f?.path ?? '')) sidecars.set(normalizePath(f.path), f)
  return {
    forCsv: (csvPath: string) => sidecars.get(normalizePath(gbifSidecarPathForCsv(csvPath))),
  }
}

export async function readGbifSidecar(file: IndexedFile | undefined): Promise<GbifDownloadInfo | undefined> {
  if (!file) return undefined
  try {
    const f = file.file || (await (file.handle as any)?.getFile?.())
    if (!f) return undefined
    return parseGbifSidecar(JSON.parse(await f.text()))
  } catch {
    return undefined
  }
}

/** Applies GBIF metadata to a list. The pending download-page ref is kept as an alias. */
export function applyGbifInfoToList(list: SpeciesList, info: GbifDownloadInfo): SpeciesList {
  const downloadKey = info.downloadKey || list.downloadKey
  return {
    ...list,
    name: speciesListNameFromGbif(info, list.name),
    doi: info.doiUrl,
    doiStatus: 'resolved',
    downloadKey,
    pendingRef: downloadKey ? gbifDownloadPageUrl(downloadKey) : list.pendingRef,
    description: info.description || list.description,
    gbif: info,
  }
}

/** GBIF metadata for a list from the browser cache, if this browser fetched it before. */
export async function getCachedGbifInfo(list: SpeciesList): Promise<GbifDownloadInfo | undefined> {
  const key = cacheKeyForList(list)
  if (!key) return undefined
  try {
    return parseGbifSidecar(await idbGet(DB_NAME, IDB_STORE, key))
  } catch {
    return undefined
  }
}

/** Lists worth asking GBIF about: pending DOIs, and filename-DOI lists with no description yet. */
function needsGbifLookup(list: SpeciesList) {
  if (list.gbif) return false
  return (list.doiStatus === 'pending' && !!list.downloadKey) || list.doiStatus === 'filename'
}

let resolving = false

/**
 * Fetches GBIF metadata for every list that needs it. Safe to call any time:
 * offline it does nothing and the lists stay pending.
 */
export async function resolveSpeciesListsFromGbif() {
  if (resolving) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  resolving = true
  try {
    const lists = Object.values(speciesListsStore.get() || {}).filter(needsGbifLookup)
    for (const list of lists) {
      const ref = list.downloadKey || bareDoi(list.doi)
      if (!ref) continue
      const info = await fetchGbifDownload(ref)
      if (!info) {
        if (list.doiStatus === 'pending') console.log('🌐 species: DOI still pending (GBIF unreachable)', { list: list.fileName })
        continue
      }
      void idbPut(DB_NAME, IDB_STORE, cacheKeyForList(list)!, info).catch(() => {})
      const current = speciesListsStore.get() || {}
      const latest = current[list.id]
      if (!latest) continue
      speciesListsStore.set({ ...current, [list.id]: applyGbifInfoToList(latest, info) })
      console.log('🌐 species: fetched GBIF download info', { list: list.fileName, doi: info.doiUrl })
    }
  } finally {
    resolving = false
  }
}

async function fetchGbifDownload(keyOrDoi: string): Promise<GbifDownloadInfo | undefined> {
  try {
    const res = await fetch(GBIF_DOWNLOAD_API + keyOrDoi, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return undefined
    return gbifDownloadInfoFromApi(await res.json())
  } catch {
    return undefined
  }
}

let onlineListenerAdded = false

/** Retry pending lookups whenever the browser regains a connection. */
export function retryGbifLookupsWhenOnline() {
  if (onlineListenerAdded || typeof window === 'undefined') return
  onlineListenerAdded = true
  window.addEventListener('online', () => void resolveSpeciesListsFromGbif())
}

function cacheKeyForList(list: SpeciesList) {
  if (list.downloadKey) return `key:${list.downloadKey}`
  const doi = bareDoi(list.doi)
  return doi ? `doi:${doi}` : undefined
}

function bareDoi(ref?: string) {
  const m = (ref ?? '').match(/doi\.org\/(10\..+)$/i)
  return m ? m[1] : undefined
}

function normalizePath(path: string) {
  return (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase()
}
