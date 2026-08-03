import { detectionsStore, getDetectionsForLeafGroup, getIdentifiedDetectionsForLeafGroup, type DetectionEntity } from '~/stores/entities/detections'
import { photosStore, type PhotoEntity } from '~/stores/entities/photos'
import { idbGet } from '~/utils/index-db'
import { leafGroupSummariesStore, type LeafGroupSummaryEntity } from '~/stores/entities/night-summaries'
import { ensureReadWritePermission, persistenceConstants } from './files.persistence'
import { userSessionStore } from '~/stores/ui'
import { morphoLinksStore } from './links'
import { getPhotoBaseFromPhotoId, getNightDiskPathFromPhoto } from '~/utils/paths'
import { buildIdentifiedJsonShapeFromDetection } from '~/models/detection-shapes'
import { setDetectionSaveScheduler } from './detection-persistence'
import { setClusterOverridesSaveScheduler, saveClusterOverrides } from './cluster-overrides'
import { isMothboxNextIngestMode } from '~/features/data-flow/1.ingest/ingest-mode'
import { exportUserDetectionsForMothboxNextPackage } from '~/features/mothbox-next/persist/package-fs-writer'
import { buildLeafGroupSummary } from '~/stores/entities/night-summaries'
import { writeTextFile } from '~/utils/fs-directory-handle'
import {
  morphoLinksMapToRecords,
  PACKAGE_MORPHO_LINKS_RECORD,
} from '~/features/mothbox-next/morpho-links-package'
import { serializeNdjsonLines } from '~/features/mothbox-next/parse-ndjson'

type FileSystemDirectoryHandleLike = {
  getDirectoryHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>
}

type FileSystemFileHandleLike = {
  createWritable?: () => Promise<{ write: (data: any) => Promise<void>; close: () => Promise<void> }>
}

const pendingTimers: Record<string, number> = {}
const PACKAGE_SAVE_TIMER_KEY = '__mothbox-next-package__'

export function scheduleSaveUserDetections(params: { leafGroupId: string; delayMs?: number }) {
  const { leafGroupId } = params

  const delayMs = typeof params?.delayMs === 'number' ? params.delayMs : 400

  if (!leafGroupId) return

  const timerKey = isMothboxNextIngestMode() ? PACKAGE_SAVE_TIMER_KEY : leafGroupId
  const prev = pendingTimers[timerKey]
  if (prev) window.clearTimeout(prev)

  const t = window.setTimeout(() => {
    if (isMothboxNextIngestMode()) {
      void exportUserDetectionsForMothboxNextPackage()
      return
    }
    void exportUserDetectionsForNight({ leafGroupId })
  }, delayMs)

  pendingTimers[timerKey] = t
}

export async function exportUserDetectionsForNight(params: { leafGroupId: string }) {
  const { leafGroupId } = params
  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null

  if (!root) return

  const granted = await ensureReadWritePermission(root as any)
  if (!granted) return

  const allPhotos = photosStore.get() || {}

  const detectionsForNight = getDetectionsForLeafGroup(leafGroupId)
  const identifiedForNight = getIdentifiedDetectionsForLeafGroup(leafGroupId)
  const byPhoto: Record<string, DetectionEntity[]> = {}

  for (const d of identifiedForNight) {
    const photoId = (d as any)?.photoId
    if (!photoId) continue
    if (!byPhoto[photoId]) byPhoto[photoId] = []
    byPhoto[photoId].push(d)
  }

  const photosForNight = Object.values(allPhotos).filter((p) => p.leafGroupId === leafGroupId)
  const nightDiskPathByPhotoId: Record<string, string> = {}

  for (const p of photosForNight) {
    const diskPath = getNightDiskPathFromPhoto(p)
    if (diskPath) nightDiskPathByPhotoId[p.id] = diskPath
  }

  const tasks: Array<Promise<void>> = []

  // Write identified JSON for every photo in the night.
  // When a photo has no user detections, write an empty shapes array to clear any stale file.
  for (const p of photosForNight) {
    const photoId = (p as any)?.id as string
    if (!photoId) continue
    const baseName = getPhotoBaseFromPhotoId(photoId)
    if (!baseName) continue
    const nightDiskPath = nightDiskPathByPhotoId[photoId]
    if (!nightDiskPath) continue
    const items = byPhoto[photoId] || []
    const fileName = `${baseName}_identified.json`
    const pathParts = nightDiskPath.split('/').filter(Boolean)
    const json = buildUserIdentifiedJson({ baseName, detections: items })
    tasks.push(writeJson(root, [...pathParts, fileName], json))
  }

  await Promise.all(tasks)

  // Update + persist night summary
  const summary = buildLeafGroupSummary({ leafGroupId, detections: detectionsForNight })
  const currentSummaries = leafGroupSummariesStore.get() || {}
  leafGroupSummariesStore.set({ ...currentSummaries, [leafGroupId]: summary })

  const anyPhoto = photosForNight[0]
  if (anyPhoto) {
    const nightDiskPath = getNightDiskPathFromPhoto(anyPhoto)
    if (nightDiskPath) {
      const pathParts = nightDiskPath.split('/').filter(Boolean)
      await writeJson(root, [...pathParts, 'night_summary.json'], summary)
    }
  }
}

export async function writeMorphoLinksToDisk() {
  try {
    const root = (await idbGet(
      persistenceConstants.IDB_NAME,
      persistenceConstants.IDB_STORE,
      'projectsRoot',
    )) as FileSystemDirectoryHandleLike | null

    if (!root) return

    const granted = await ensureReadWritePermission(root as any)
    if (!granted) return

    const links = morphoLinksStore.get() || {}

    if (isMothboxNextIngestMode()) {
      const rows = morphoLinksMapToRecords(links)
      await writeTextFile(root, PACKAGE_MORPHO_LINKS_RECORD, serializeNdjsonLines(rows))
      return
    }

    await writeJson(root, ['morpho_links.json'], links)
  } catch {
    // ignore write errors
  }
}

function buildUserIdentifiedJson(params: { baseName: string; detections: DetectionEntity[] }) {
  const { baseName, detections } = params
  const user = userSessionStore.get()
  const human = (user?.initials || 'user').trim()
  const shapes = detections.map((d) => buildIdentifiedJsonShapeFromDetection({ detection: d, identifierHuman: human }))
  const json = { version: '1', photoBase: baseName, shapes }

  const morphoShapes = shapes.filter((s: any) => s?.morphospecies)
  if (morphoShapes.length > 0) {
    console.log('💾 persist: writing JSON with morphospecies', {
      baseName,
      morphoCount: morphoShapes.length,
      morphoShapes: morphoShapes.map((s: any) => ({ patch_path: s?.patch_path, morphospecies: s?.morphospecies })),
    })
  }

  return json
}

async function writeJson(root: FileSystemDirectoryHandleLike, path: string[], data: unknown) {
  if (!root?.getDirectoryHandle || !root?.getFileHandle) return
  const fileName = path[path.length - 1]
  const dirParts = path.slice(0, -1)
  let dir = root
  for (const part of dirParts) {
    dir = (await dir.getDirectoryHandle?.(part, { create: true })) as any
    if (!dir) return
  }
  const fh = (await dir.getFileHandle?.(fileName, { create: true })) as FileSystemFileHandleLike
  const writable = await fh?.createWritable?.()
  if (!writable) return
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}

// Initialize schedulers so detections.ts can trigger saves without circular dependencies
setDetectionSaveScheduler(scheduleSaveUserDetections)

const pendingClusterOverridesTimers: Record<string, number> = {}
setClusterOverridesSaveScheduler((leafGroupId: string) => {
  const prev = pendingClusterOverridesTimers[leafGroupId]
  if (prev) window.clearTimeout(prev)
  pendingClusterOverridesTimers[leafGroupId] = window.setTimeout(() => {
    const all = detectionsStore.get() || {}
    const overrides: Record<string, number> = {}
    for (const det of Object.values(all)) {
      if (det.leafGroupId !== leafGroupId) continue
      if (typeof det.clusterId === 'number') overrides[det.id] = det.clusterId
    }
    void saveClusterOverrides(leafGroupId, overrides)
  }, 400)
})
