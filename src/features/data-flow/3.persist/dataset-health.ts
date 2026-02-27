import { indexedFilesStore, type IndexedFile } from '~/features/data-flow/1.ingest/files.state'
import { normalizeLegacyNightId, parsePathParts } from '~/features/data-flow/1.ingest/ingest-paths'
import { ensureReadWritePermission, persistenceConstants } from './files.persistence'
import { idbGet } from '~/utils/index-db'

type FileSystemDirectoryHandleLike = {
  values: () => AsyncIterable<unknown>
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'> | 'granted' | 'denied' | 'prompt'
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'> | 'granted' | 'denied' | 'prompt'
  getDirectoryHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>
}

type FileSystemFileHandleLike = {
  getFile?: () => Promise<File>
  createWritable?: () => Promise<{
    write: (data: string) => Promise<void>
    close: () => Promise<void>
  }>
}

type SummaryIssueType = 'invalid-json' | 'missing-night-id' | 'legacy-night-id' | 'mismatched-night-id'

type SummaryIssue = {
  path: string
  type: SummaryIssueType
  expectedNightId: string
  currentNightId?: string
}

type CollisionIssue = {
  kind: 'photo' | 'patch'
  id: string
  firstNightId: string
  secondNightId: string
  firstPath: string
  secondPath: string
}

export type DatasetHealthAuditReport = {
  scannedFiles: number
  nightSummaryFiles: number
  identifiedFiles: number
  summaryIssues: SummaryIssue[]
  invalidIdentifiedJsonCount: number
  photoCollisionCount: number
  patchCollisionCount: number
  collisions: CollisionIssue[]
}

export type NightSummaryHealReport = {
  scanned: number
  candidates: number
  healed: number
  alreadyCanonical: number
  skippedInvalidJson: number
  failedWrites: number
}

export async function runDatasetHealthAudit(params?: { entries?: IndexedFile[] }): Promise<DatasetHealthAuditReport> {
  const entries = params?.entries ?? indexedFilesStore.get() ?? []
  const report: DatasetHealthAuditReport = {
    scannedFiles: entries.length,
    nightSummaryFiles: 0,
    identifiedFiles: 0,
    summaryIssues: [],
    invalidIdentifiedJsonCount: 0,
    photoCollisionCount: 0,
    patchCollisionCount: 0,
    collisions: [],
  }

  const firstPhotoById = new Map<string, { nightId: string; path: string }>()
  const firstPatchById = new Map<string, { nightId: string; path: string }>()
  const photoCollisionKeys = new Set<string>()
  const patchCollisionKeys = new Set<string>()

  for (const entry of entries) {
    const lower = (entry?.name ?? '').toLowerCase()
    if (lower === 'night_summary.json') {
      report.nightSummaryFiles++
      await auditNightSummaryFile({ entry, report })
      continue
    }

    if (lower.endsWith('_identified.json')) {
      report.identifiedFiles++
      await auditIdentifiedFile({ entry, report })
    }

    const parsed = parsePathParts({ path: entry.path })
    if (!parsed) continue
    const nightId = `${parsed.project}/${parsed.deployment}/${parsed.night}`

    if (parsed.isPhotoJpg) {
      const photoId = `${parsed.baseName}.jpg`
      registerCollision({
        kind: 'photo',
        id: photoId,
        nightId,
        path: entry.path,
        firstById: firstPhotoById,
        collisionKeys: photoCollisionKeys,
        collisions: report.collisions,
      })
      continue
    }

    if (parsed.isPatch) {
      registerCollision({
        kind: 'patch',
        id: parsed.fileName,
        nightId,
        path: entry.path,
        firstById: firstPatchById,
        collisionKeys: patchCollisionKeys,
        collisions: report.collisions,
      })
    }
  }

  report.photoCollisionCount = photoCollisionKeys.size
  report.patchCollisionCount = patchCollisionKeys.size
  return report
}

export async function healNightSummaryNightIds(params?: { entries?: IndexedFile[] }): Promise<NightSummaryHealReport> {
  const entries = params?.entries ?? indexedFilesStore.get() ?? []
  const summaryEntries = entries.filter((entry) => (entry?.name ?? '').toLowerCase() === 'night_summary.json')
  const root = (await idbGet(
    persistenceConstants.IDB_NAME,
    persistenceConstants.IDB_STORE,
    'projectsRoot',
  )) as FileSystemDirectoryHandleLike | null

  if (!root) {
    return {
      scanned: summaryEntries.length,
      candidates: 0,
      healed: 0,
      alreadyCanonical: 0,
      skippedInvalidJson: 0,
      failedWrites: summaryEntries.length,
    }
  }

  const granted = await ensureReadWritePermission(root)
  if (!granted) {
    return {
      scanned: summaryEntries.length,
      candidates: 0,
      healed: 0,
      alreadyCanonical: 0,
      skippedInvalidJson: 0,
      failedWrites: summaryEntries.length,
    }
  }

  let candidates = 0
  let healed = 0
  let alreadyCanonical = 0
  let skippedInvalidJson = 0
  let failedWrites = 0

  for (const entry of summaryEntries) {
    const expectedNightId = deriveExpectedNightIdFromSummaryPath(entry.path)
    if (!expectedNightId) continue

    const text = await readTextFromIndexedEntry(entry)
    if (!text) {
      skippedInvalidJson++
      continue
    }

    let json: Record<string, unknown>
    try {
      json = JSON.parse(text)
    } catch {
      skippedInvalidJson++
      continue
    }

    const currentNightId = typeof json?.nightId === 'string' ? json.nightId : undefined
    if (currentNightId === expectedNightId) {
      alreadyCanonical++
      continue
    }

    candidates++
    const next = { ...json, nightId: expectedNightId }
    const ok = await writeJsonToIndexedPath({ root, entry, json: next })
    if (ok) healed++
    else failedWrites++
  }

  return { scanned: summaryEntries.length, candidates, healed, alreadyCanonical, skippedInvalidJson, failedWrites }
}

function registerCollision(params: {
  kind: 'photo' | 'patch'
  id: string
  nightId: string
  path: string
  firstById: Map<string, { nightId: string; path: string }>
  collisionKeys: Set<string>
  collisions: CollisionIssue[]
}) {
  const { kind, id, nightId, path, firstById, collisionKeys, collisions } = params
  const first = firstById.get(id)
  if (!first) {
    firstById.set(id, { nightId, path })
    return
  }

  if (first.nightId === nightId) return
  if (collisionKeys.has(id)) return

  collisionKeys.add(id)
  collisions.push({
    kind,
    id,
    firstNightId: first.nightId,
    secondNightId: nightId,
    firstPath: first.path,
    secondPath: path,
  })
}

async function auditNightSummaryFile(params: { entry: IndexedFile; report: DatasetHealthAuditReport }) {
  const { entry, report } = params
  const expectedNightId = deriveExpectedNightIdFromSummaryPath(entry.path)
  const text = await readTextFromIndexedEntry(entry)
  if (!text) {
    report.summaryIssues.push({ path: entry.path, type: 'invalid-json', expectedNightId })
    return
  }

  let json: Record<string, unknown>
  try {
    json = JSON.parse(text)
  } catch {
    report.summaryIssues.push({ path: entry.path, type: 'invalid-json', expectedNightId })
    return
  }

  const currentNightId = typeof json?.nightId === 'string' ? json.nightId : undefined
  if (!currentNightId) {
    report.summaryIssues.push({ path: entry.path, type: 'missing-night-id', expectedNightId })
    return
  }

  if (currentNightId === expectedNightId) return

  const normalizedCurrentNightId = normalizeLegacyNightId(currentNightId)
  if (normalizedCurrentNightId === expectedNightId) {
    report.summaryIssues.push({
      path: entry.path,
      type: 'legacy-night-id',
      expectedNightId,
      currentNightId,
    })
    return
  }

  report.summaryIssues.push({
    path: entry.path,
    type: 'mismatched-night-id',
    expectedNightId,
    currentNightId,
  })
}

async function auditIdentifiedFile(params: { entry: IndexedFile; report: DatasetHealthAuditReport }) {
  const { entry, report } = params
  const text = await readTextFromIndexedEntry(entry)
  if (!text) {
    report.invalidIdentifiedJsonCount++
    return
  }

  try {
    const json = JSON.parse(text)
    const hasValidShapes = Array.isArray(json?.shapes)
    if (!hasValidShapes) report.invalidIdentifiedJsonCount++
  } catch {
    report.invalidIdentifiedJsonCount++
  }
}

async function readTextFromIndexedEntry(entry: IndexedFile) {
  if (entry?.file) return entry.file.text()

  const handle = entry?.handle as FileSystemFileHandleLike | undefined
  const file = await handle?.getFile?.()
  if (!file) return ''
  return file.text()
}

function deriveExpectedNightIdFromSummaryPath(path: string) {
  const normalizedPath = (path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const parsed = parsePathParts({ path: normalizedPath })
  if (parsed) return `${parsed.project}/${parsed.deployment}/${parsed.night}`

  const segments = normalizedPath.split('/').filter(Boolean)
  if (segments.length < 4) return ''
  const baseParts = segments.slice(0, -1)
  return normalizeLegacyNightId(baseParts.join('/'))
}

async function writeJsonToIndexedPath(params: {
  root: FileSystemDirectoryHandleLike
  entry: IndexedFile
  json: Record<string, unknown>
}) {
  const { root, entry, json } = params
  const text = JSON.stringify(json, null, 2)

  const handle = entry?.handle as FileSystemFileHandleLike | undefined
  if (handle?.createWritable) {
    try {
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      return true
    } catch {
      return false
    }
  }

  const normalizedPath = (entry.path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const pathParts = normalizedPath.split('/').filter(Boolean)
  const fileName = pathParts[pathParts.length - 1]
  if (!fileName) return false

  let dir = root
  for (const part of pathParts.slice(0, -1)) {
    const next = await dir.getDirectoryHandle?.(part, { create: false })
    if (!next) return false
    dir = next
  }

  const fileHandle = await dir.getFileHandle?.(fileName, { create: true })
  const writable = await fileHandle?.createWritable?.()
  if (!writable) return false

  await writable.write(text)
  await writable.close()
  return true
}

export function formatDatasetHealthAuditSummary(report: DatasetHealthAuditReport) {
  const summaryIssueCount = report.summaryIssues.length
  return `scanned ${report.scannedFiles} files; summary issues: ${summaryIssueCount}, invalid identified JSON: ${report.invalidIdentifiedJsonCount}, photo collisions: ${report.photoCollisionCount}, patch collisions: ${report.patchCollisionCount}`
}

export function formatNightSummaryHealSummary(report: NightSummaryHealReport) {
  return `scanned ${report.scanned}, candidates ${report.candidates}, healed ${report.healed}, already canonical ${report.alreadyCanonical}, invalid JSON ${report.skippedInvalidJson}, failed writes ${report.failedWrites}`
}
