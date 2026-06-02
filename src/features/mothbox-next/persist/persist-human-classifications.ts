import { detectionsStore, getDetectionsForLeafGroup, getIdentifiedDetectionsForLeafGroup } from '~/stores/entities/detections'
import type { DetectionEntity } from '~/models/detection.types'
import { classificationFromDetection } from '../classification-to-detection'
import { mergeClassifierRowsByPatchId } from './merge-classifier-rows'
import { buildCurrentClassificationsNdjson } from './rebuild-current-classifications'
import { serializeNdjsonLines } from '../parse-ndjson'
import { parseClassificationRecords } from '../parse-package-records'
import type { ClassificationRecord } from '../records'
import { mothboxNextPackageStore } from '../active-package'
import { joinRelativePaths, classifierFileName } from '../package-paths'
import { userSessionStore } from '~/stores/ui'
import { refreshActivePackageLoadedFromWriter } from '../reload-package'
import { savePackageSessionCacheFromStores } from '~/features/data-flow/3.persist/save-package-session-cache'
import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'

export type PackageTextWriter = {
  readText: (relativePath: string) => Promise<string>
  writeText: (relativePath: string, text: string) => Promise<void>
  fileExists: (relativePath: string) => Promise<boolean>
  listClassificationNdjsonPaths: (classificationsFolder: string) => Promise<string[]>
}

export async function persistPackageClassifications(params: {
  writer: PackageTextWriter
  leafGroupId?: string
}) {
  const { writer, leafGroupId } = params
  const active = mothboxNextPackageStore.get()
  if (!active) return

  const classifierId = defaultClassifierId()
  const relClassifierPath = joinRelativePaths(
    active.manifest.folders.classifications,
    classifierFileName(classifierId),
  )

  const updates = collectHumanClassificationUpdates({ leafGroupId, classifierId })
  const desiredPatchIds = new Set(updates.map((row) => row.patch_id).filter(Boolean))
  const pruneScopePatchIds = leafGroupId ? collectPatchIdsForLeafGroup({ leafGroupId }) : null

  let existing: ClassificationRecord[] = []
  if (await writer.fileExists(relClassifierPath)) {
    const text = await writer.readText(relClassifierPath)
    existing = parseClassificationRecords(text)
  }

  const shouldPruneExistingRow = (row: ClassificationRecord) =>
    row.patch_id &&
    !desiredPatchIds.has(row.patch_id) &&
    (!pruneScopePatchIds || pruneScopePatchIds.has(row.patch_id))

  const hasStaleHumanRows = existing.some(shouldPruneExistingRow)
  if (!updates.length && !hasStaleHumanRows) return

  const prunedExisting = existing.filter((row) => !shouldPruneExistingRow(row))
  const merged = mergeClassifierRowsByPatchId({ existing: prunedExisting, updates })
  await writer.writeText(relClassifierPath, serializeNdjsonLines(merged))
  await rebuildCurrentClassificationsCacheFromDisk({ writer, activePackage: active })
  await refreshActivePackageLoadedFromWriter({ writer })

  const folderName = activeDatasetFolderNameStore.get()
  if (folderName) await savePackageSessionCacheFromStores({ folderName })
}

function collectHumanClassificationUpdates(params: { leafGroupId?: string; classifierId: string }) {
  const { leafGroupId, classifierId } = params
  const detections = leafGroupId ? getIdentifiedDetectionsForLeafGroup(leafGroupId) : getAllIdentifiedDetections()

  return detections.map((detection) =>
    classificationFromDetection({
      detection,
      classifierId,
      classifierType: 'human',
    }),
  )
}

function getAllIdentifiedDetections(): DetectionEntity[] {
  const all = detectionsStore.get() || {}
  return Object.values(all).filter((d) => d.detectedBy === 'user')
}

function collectPatchIdsForLeafGroup(params: { leafGroupId: string }): Set<string> {
  return new Set(getDetectionsForLeafGroup(params.leafGroupId).map((detection) => detection.patchId).filter(Boolean))
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

  const ndjson = buildCurrentClassificationsNdjson({ classificationFiles })
  await writer.writeText(currentRel, ndjson)
}

function defaultClassifierId(): string {
  const user = userSessionStore.get()
  const initials = (user?.initials || 'user').trim().toLowerCase()
  return initials || 'user'
}
