import { speciesListsStore, speciesListsLoadingStore, type SpeciesList } from '~/features/data-flow/2.identify/species-list.store'
import { invalidateSpeciesIndexForListId } from '~/features/data-flow/2.identify/species-search'
import type { IndexedFile as FolderIndexedFile } from './files.state'
import type { SpeciesCsvWorkerRequest, SpeciesCsvWorkerResponse } from '~/workers/species-csv.types'
import { isSpeciesListIndexedPath } from './species-indexed-paths'
import {
  applyGbifInfoToList,
  getCachedGbifInfo,
  indexGbifSidecars,
  readGbifSidecar,
  resolveSpeciesListsFromGbif,
  retryGbifLookupsWhenOnline,
} from './species-list-gbif'

export type IndexedFile = FolderIndexedFile
export { isSpeciesListIndexedPath } from './species-indexed-paths'

let workerInstance: Worker | null = null

function getWorker(): Worker {
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('../../../workers/species-csv.worker.ts', import.meta.url), { type: 'module' })
    } catch (err) {
      throw err
    }
  }
  return workerInstance
}

/**
 * Parses every species-list CSV in `files`. `.gbif.json` sidecars in `files`
 * (saved by Mothbot Process) supply each GBIF download's DOI and description.
 */
export async function ingestSpeciesListsFromFiles(params: { files: IndexedFile[] }) {
  const { files } = params
  if (!files?.length) return
  const sidecars = indexGbifSidecars(files)

  const lists: Record<string, SpeciesList> = { ...(speciesListsStore.get() || {}) }
  const speciesFiles: IndexedFile[] = []

  speciesListsLoadingStore.set(true)

  for (const f of files) {
    if (isSpeciesListIndexedPath(f?.path ?? '')) speciesFiles.push(f)
  }

  if (speciesFiles.length === 0) {
    speciesListsLoadingStore.set(false)
    return
  }

  const worker = getWorker()

  try {
    for (const f of speciesFiles) {
      try {
        const file = f?.file || (await (f?.handle as any)?.getFile?.())
        if (!file) continue

        const csvText = await file.text()
        if (!csvText) continue

        const fileId = f?.name || f?.path
        const fileName = f?.name || f?.path

        const response = await processFileInWorker({ worker, csvText, fileId, fileName, sourcePath: f.path })

        if (response) {
          let list: SpeciesList = {
            id: response.id,
            name: response.name,
            doi: response.doi,
            doiStatus: response.doiStatus,
            downloadKey: response.downloadKey,
            pendingRef: response.pendingRef,
            taxonIDSource: response.taxonIDSource,
            fileName: response.fileName,
            sourcePath: response.sourcePath,
            records: response.records,
            recordCount: response.recordCount,
            validation: response.validation,
          }
          const gbif = (await readGbifSidecar(sidecars.forCsv(f.path))) ?? (await getCachedGbifInfo(list))
          if (gbif) list = applyGbifInfoToList(list, gbif)
          lists[response.id] = list

          invalidateSpeciesIndexForListId(response.id)
        }
      } catch (err) {
        console.log('🚨 species: failed to parse species list', { path: f?.path, err })
      }
    }

    const current = speciesListsStore.get() || {}
    speciesListsStore.set({ ...current, ...lists })
  } finally {
    speciesListsLoadingStore.set(false)
  }

  // Background, offline-safe: fetch DOIs still pending (and retry once back online).
  retryGbifLookupsWhenOnline()
  void resolveSpeciesListsFromGbif()
}

function processFileInWorker(params: {
  worker: Worker
  csvText: string
  fileId: string
  fileName: string
  sourcePath: string
}): Promise<SpeciesCsvWorkerResponse | null> {
  const { worker, csvText, fileId, fileName, sourcePath } = params
  const requestId = `${fileId}-${Date.now()}-${Math.random()}`

  return new Promise((resolve) => {
    const request: SpeciesCsvWorkerRequest = {
      requestId,
      csvText,
      fileId,
      fileName,
      sourcePath,
    }

    const messageHandler = (event: MessageEvent<SpeciesCsvWorkerResponse | null>) => {
      if (!event.data || (event.data as any).requestId !== requestId) {
        return
      }
      worker.removeEventListener('message', messageHandler)
      resolve(event.data)
    }

    worker.addEventListener('message', messageHandler)
    worker.addEventListener('error', () => {})
    worker.postMessage(request)
  })
}
