import { detectionsStore, getDetectionsForLeafGroup } from '~/stores/entities/detections'
import type { DetectionEntity } from '~/models/detection.types'
import { classificationFromDetection, withdrawalRow } from '../classification-to-detection'
import { buildCurrentClassificationsNdjson } from './rebuild-current-classifications'
import { serializeNdjsonLines } from '../parse-ndjson'
import { parseClassificationRecords } from '../parse-package-records'
import type { ClassificationRecord, PatchRecord } from '../records'
import { mothboxNextPackageStore } from '../active-package'
import { joinRelativePaths, classifierFileName } from '../package-paths'
import { refreshActivePackageLoadedFromWriter } from '../reload-package'
import { savePackageSessionCacheFromStores } from '~/features/data-flow/3.persist/save-package-session-cache'
import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'
import { currentHumanClassifierId, currentHumanIdentifierName } from '../human-classifier-id'
import {
  isWithdrawal,
  newIdentificationId,
  occurrenceIdByPatchFromRecords,
  occurrenceKeyOf,
  sameIdentificationClaim,
} from '../identifications'

export type PackageTextWriter = {
  readText: (relativePath: string) => Promise<string>
  writeText: (relativePath: string, text: string) => Promise<void>
  fileExists: (relativePath: string) => Promise<boolean>
  listClassificationNdjsonPaths: (classificationsFolder: string) => Promise<string[]>
}

/**
 * Saves the current person's identifications into `03_classifications/<classifier>.ndjson`.
 *
 * The file is append-only: existing lines are kept byte for byte, and a row is added
 * only when something changed —
 * - a detection showing this person's identification gets a new row when its claim
 *   differs from their latest row for that occurrence;
 * - a detection no longer showing their (still active) identification, because they
 *   reset it, gets a `withdrawn` row.
 * Re-saving an unchanged state adds nothing.
 */
export async function persistPackageClassifications(params: {
  writer: PackageTextWriter
  leafGroupId?: string
}) {
  const { writer, leafGroupId } = params
  const active = mothboxNextPackageStore.get()
  if (!active) return

  const classifierId = currentHumanClassifierId()
  const identifierName = currentHumanIdentifierName()
  const relClassifierPath = joinRelativePaths(
    active.manifest.folders.classifications,
    classifierFileName(classifierId),
  )

  let existingText = ''
  if (await writer.fileExists(relClassifierPath)) {
    existingText = await writer.readText(relClassifierPath)
  }
  const existing = parseClassificationRecords(existingText)

  const appended = collectNewIdentificationRows({
    detections: leafGroupId ? getDetectionsForLeafGroup(leafGroupId) : Object.values(detectionsStore.get() || {}),
    existing,
    classifierId,
    identifierName,
    occurrenceIdByPatch: occurrenceIdByPatchFromRecords(active.loaded?.patches),
  })
  if (!appended.length) return

  await writer.writeText(relClassifierPath, appendNdjsonRows(existingText, appended))
  await rebuildCurrentClassificationsCacheFromDisk({ writer, activePackage: active })
  await refreshActivePackageLoadedFromWriter({ writer })

  const folderName = activeDatasetFolderNameStore.get()
  if (folderName) await savePackageSessionCacheFromStores({ folderName })
}

/** The rows to append to one person's file so it matches the detections' current state. */
export function collectNewIdentificationRows(params: {
  detections: DetectionEntity[]
  existing: ClassificationRecord[]
  classifierId: string
  identifierName?: string
  occurrenceIdByPatch?: ReadonlyMap<string, string>
  now?: number
}): ClassificationRecord[] {
  const { detections, existing, classifierId, identifierName, occurrenceIdByPatch } = params
  const now = params.now ?? Date.now()

  const latestByOccurrence = latestRowByOccurrence({ rows: existing, occurrenceIdByPatch })
  const appended: ClassificationRecord[] = []

  for (const detection of detections) {
    if (!detection?.patchId) continue
    const occurrenceKey = detection.occurrenceId || occurrenceIdByPatch?.get(detection.patchId) || detection.patchId
    const latest = latestByOccurrence.get(occurrenceKey)
    const latestActive = latest && !isWithdrawal(latest) ? latest : undefined

    if (isThisPersonsIdentification({ detection, classifierId })) {
      const row = classificationFromDetection({ detection, classifierId, classifierType: 'human', identifierName })
      if (latestActive && sameIdentificationClaim(row, latestActive)) continue
      const next = {
        ...row,
        occurrence_id: occurrenceKey,
        identification_id: newIdentificationId(),
        // Never older than the row it replaces (clock skew), or it wouldn't count as the latest.
        classified_at: notBefore(row.classified_at ?? now, latest),
      }
      appended.push(next)
      latestByOccurrence.set(occurrenceKey, next)
      continue
    }

    if (latestActive && isTakenBack({ detection, latestActive })) {
      const next = {
        ...withdrawalRow({ withdrawn: latestActive, classifiedAt: notBefore(now, latestActive), identifierName }),
        occurrence_id: occurrenceKey,
        identification_id: newIdentificationId(),
      }
      appended.push(next)
      latestByOccurrence.set(occurrenceKey, next)
    }
  }

  return appended
}

function isThisPersonsIdentification(params: { detection: DetectionEntity; classifierId: string }) {
  const { detection, classifierId } = params
  if (detection.detectedBy !== 'user') return false
  if (!detection.humanClassifierId) return true
  return detection.humanClassifierId === classifierId
}

/**
 * The person has an active identification here, but the detection shows something else.
 * Under the determination rule their identification would show unless it was taken back:
 * a human identification always beats a machine one, and the latest human one wins. So it
 * was reset when the detection shows a machine identification, or another person's
 * identification that is older than theirs.
 */
function isTakenBack(params: { detection: DetectionEntity; latestActive: ClassificationRecord }): boolean {
  const { detection, latestActive } = params
  if (detection.detectedBy !== 'user') return true
  const shownAt = typeof detection.identifiedAt === 'number' ? detection.identifiedAt : -Infinity
  const theirsAt = typeof latestActive.classified_at === 'number' ? latestActive.classified_at : -Infinity
  return theirsAt > shownAt
}

/** Each occurrence's latest row in one person's file (by time, then position in the file). */
function latestRowByOccurrence(params: {
  rows: ClassificationRecord[]
  occurrenceIdByPatch?: ReadonlyMap<string, string>
}): Map<string, ClassificationRecord> {
  const latest = new Map<string, { row: ClassificationRecord; order: number }>()
  params.rows.forEach((row, order) => {
    if (!row.patch_id) return
    const key = occurrenceKeyOf(row, params.occurrenceIdByPatch)
    const current = latest.get(key)
    if (!current || timeOf(current.row) <= timeOf(row)) latest.set(key, { row, order })
  })
  return new Map([...latest.entries()].map(([key, value]) => [key, value.row]))
}

/** `time`, raised to `previous`'s timestamp if that is later. Ties go to the later row in the file. */
function notBefore(time: number, previous: ClassificationRecord | undefined): number {
  const previousTime = previous ? timeOf(previous) : -Infinity
  return previousTime > time ? previousTime : time
}

function timeOf(row: ClassificationRecord): number {
  return typeof row.classified_at === 'number' && Number.isFinite(row.classified_at) ? row.classified_at : -Infinity
}

/** Appends rows to NDJSON text without touching the existing lines. */
export function appendNdjsonRows(existingText: string, rows: ClassificationRecord[]): string {
  const prefix = existingText && !existingText.endsWith('\n') ? `${existingText}\n` : existingText
  return prefix + serializeNdjsonLines(rows)
}

export async function rebuildCurrentClassificationsCacheFromDisk(params: {
  writer: PackageTextWriter
  activePackage: NonNullable<ReturnType<typeof mothboxNextPackageStore.get>>
}) {
  const { writer, activePackage } = params
  const currentRel = activePackage.manifest.records.current_classifications
  if (!currentRel) return

  const relPaths = await writer.listClassificationNdjsonPaths(activePackage.manifest.folders.classifications)
  const classificationFiles: Array<{ path: string; rows: ClassificationRecord[] }> = []

  for (const rel of relPaths) {
    const text = await writer.readText(rel)
    const rows = parseClassificationRecords(text)
    classificationFiles.push({ path: rel, rows })
  }

  const ndjson = buildCurrentClassificationsNdjson({
    classificationFiles,
    occurrenceIdByPatch: occurrenceIdByPatchFromRecords(activePackage.loaded?.patches as PatchRecord[] | undefined),
  })
  await writer.writeText(currentRel, ndjson)
}
