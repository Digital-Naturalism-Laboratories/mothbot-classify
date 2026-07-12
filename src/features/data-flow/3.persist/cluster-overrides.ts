import type { DetectionEntity } from '~/models/detection.types'
import type { PhotoEntity } from '~/stores/entities/photos'
import { photosStore } from '~/stores/entities/photos'
import { getNightDiskPathFromPhoto } from '~/utils/paths'
import { idbGet } from '~/utils/index-db'
import { ensureReadWritePermission, persistenceConstants } from './files.persistence'

const FILENAME = 'cluster_overrides.json'

// Caller (files.writer.ts) registers a scheduler that reads detectionsStore itself,
// avoiding a circular dependency back to detections.ts.
let _scheduler: ((leafGroupId: string) => void) | undefined

export function setClusterOverridesSaveScheduler(fn: (leafGroupId: string) => void) {
  _scheduler = fn
}

export function triggerClusterOverridesSave(leafGroupId: string) {
  _scheduler?.(leafGroupId)
}

export async function saveClusterOverrides(leafGroupId: string, overrides: Record<string, number>) {
  const root = await getRoot()
  if (!root) return
  const nightPath = getNightPathForLeafGroup(leafGroupId)
  if (!nightPath) return
  const pathParts = nightPath.split('/').filter(Boolean)
  await writeJson(root, [...pathParts, FILENAME], overrides)
}

export async function applyClusterOverridesForLeafGroup(params: {
  leafGroupId: string
  detections: Record<string, DetectionEntity>
  photos?: Record<string, PhotoEntity>
}) {
  const { leafGroupId, detections, photos } = params
  const root = await getRoot()
  if (!root) return
  const nightPath = getNightPathForLeafGroup(leafGroupId, photos)
  if (!nightPath) return
  const pathParts = nightPath.split('/').filter(Boolean)
  const overrides = await readJson(root, [...pathParts, FILENAME])
  if (!overrides) return
  for (const [id, clusterId] of Object.entries(overrides)) {
    if (detections[id] && typeof clusterId === 'number') {
      detections[id] = { ...detections[id], clusterId }
    }
  }
}

function getNightPathForLeafGroup(leafGroupId: string, photosOverride?: Record<string, PhotoEntity>): string | null {
  const photos = photosOverride ?? photosStore.get() ?? {}
  for (const photo of Object.values(photos)) {
    if (photo.leafGroupId !== leafGroupId) continue
    const path = getNightDiskPathFromPhoto(photo)
    if (path) return path
  }
  return null
}

async function getRoot(): Promise<any | null> {
  const root = await idbGet(persistenceConstants.IDB_NAME, persistenceConstants.IDB_STORE, 'projectsRoot') as any
  if (!root) return null
  const granted = await ensureReadWritePermission(root)
  return granted ? root : null
}

async function writeJson(root: any, path: string[], data: unknown) {
  try {
    const fileName = path[path.length - 1]!
    const dirParts = path.slice(0, -1)
    let dir = root
    for (const part of dirParts) {
      dir = await dir.getDirectoryHandle(part, { create: true })
      if (!dir) return
    }
    const fh = await dir.getFileHandle(fileName, { create: true })
    const writable = await fh.createWritable()
    await writable.write(JSON.stringify(data))
    await writable.close()
  } catch {
    // ignore write errors
  }
}

async function readJson(root: any, path: string[]): Promise<Record<string, unknown> | null> {
  try {
    const fileName = path[path.length - 1]!
    const dirParts = path.slice(0, -1)
    let dir = root
    for (const part of dirParts) {
      dir = await dir.getDirectoryHandle(part)
      if (!dir) return null
    }
    const fh = await dir.getFileHandle(fileName)
    const file = await fh.getFile()
    const text = await file.text()
    return JSON.parse(text)
  } catch {
    return null  // file not yet written or read error
  }
}
