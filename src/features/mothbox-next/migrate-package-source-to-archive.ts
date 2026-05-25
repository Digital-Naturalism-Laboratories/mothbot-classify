import { toast } from 'sonner'
import {
  deriveSourcePhotoAssetPathFromBotPath,
  isPackageArchiveRelativePath,
  normalizeIngestRelativePath,
  PACKAGE_ARCHIVE_DIR,
  rowQualifiesForArchiveRelocation,
  toPackageArchiveRelativePath,
} from '~/features/data-flow/1.ingest/reserved-paths'
import { readTextFile, writeTextFile, type FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { parsePatchSourceRecords } from './parse-package-records'
import { serializeNdjsonLines } from './parse-ndjson'
import type { PatchSourceRecord } from './records'

const PATCH_SOURCES_RECORD = '02_records/patch-sources.ndjson'
const ADAPTER_REPORT = 'adapter-report.json'
const ARCHIVE_RELOCATE_TOAST_ID = 'migrate-package-source-archive'

export type ArchiveRelocationDetection = {
  shouldMigrate: boolean
  matchedCount: number
  totalCandidates: number
  reason?: string
}

export type MigratePackageSourceArchiveResult = {
  migrated: boolean
  writeFailed?: boolean
  reason?: string
  rowCount?: number
}

export { deriveSourcePhotoAssetPathFromBotPath } from '~/features/data-flow/1.ingest/reserved-paths'

export function detectPackageSourceArchiveRelocation(params: {
  patchSources: PatchSourceRecord[]
  indexedPaths: string[]
}): ArchiveRelocationDetection {
  const { patchSources, indexedPaths } = params
  const pathSet = new Set(indexedPaths.map((path) => normalizeIngestRelativePath(path)))

  const hasArchiveInIndex = [...pathSet].some((path) => isPackageArchiveRelativePath(path))
  if (!hasArchiveInIndex) {
    return { shouldMigrate: false, matchedCount: 0, totalCandidates: 0, reason: 'no-archive-in-index' }
  }

  const botRows = patchSources.filter((row) => row.original_bot_detection_path?.trim())
  if (!botRows.length) {
    return { shouldMigrate: false, matchedCount: 0, totalCandidates: 0, reason: 'no-bot-paths' }
  }

  const needsPrefix = botRows.some((row) => !isPackageArchiveRelativePath(row.original_bot_detection_path ?? ''))
  if (!needsPrefix) {
    return { shouldMigrate: false, matchedCount: 0, totalCandidates: botRows.length, reason: 'already-archived' }
  }

  const candidates = botRows.filter((row) => {
    const botPath = normalizeIngestRelativePath(row.original_bot_detection_path ?? '')
    return botPath && !isPackageArchiveRelativePath(botPath)
  })

  const totalCandidates = candidates.length
  if (totalCandidates === 0) {
    return { shouldMigrate: false, matchedCount: 0, totalCandidates: 0, reason: 'no-candidates' }
  }

  let matchedCount = 0
  for (const row of candidates) {
    const botPath = normalizeIngestRelativePath(row.original_bot_detection_path ?? '')
    if (rowQualifiesForArchiveRelocation({ botPath, indexedPathSet: pathSet })) matchedCount++
  }

  if (matchedCount !== totalCandidates) {
    return {
      shouldMigrate: false,
      matchedCount,
      totalCandidates,
      reason: matchedCount > 0 ? 'partial-archive-relocation' : 'not-all-rows-qualified',
    }
  }

  return { shouldMigrate: true, matchedCount, totalCandidates }
}

export function resolveSourcePhotoAssetPathForPatchSource(row: PatchSourceRecord): string | undefined {
  const explicit = row.source_photo_asset_path?.trim()
  if (explicit) return normalizeIngestRelativePath(explicit)

  const botPath = row.original_bot_detection_path?.trim()
  if (!botPath) return undefined

  return deriveSourcePhotoAssetPathFromBotPath(botPath)
}

function prefixPathForArchive(path: string): string {
  return toPackageArchiveRelativePath(path)
}

export function rewritePatchSourcesForArchivePrefix(params: {
  patchSources: PatchSourceRecord[]
  indexedPaths: string[]
}): PatchSourceRecord[] {
  const pathSet = new Set(params.indexedPaths.map((path) => normalizeIngestRelativePath(path)))

  return params.patchSources.map((row) => {
    const botPath = row.original_bot_detection_path?.trim()
    if (!botPath || !rowQualifiesForArchiveRelocation({ botPath, indexedPathSet: pathSet })) {
      return row
    }

    const patchPath = row.original_patch_path?.trim()
    const photoPath = row.source_photo_asset_path?.trim()

    const nextBot = prefixPathForArchive(botPath)
    const nextPatch = patchPath ? prefixPathForArchive(patchPath) : undefined
    let nextPhoto = photoPath ? prefixPathForArchive(photoPath) : undefined

    if (!nextPhoto && nextBot) nextPhoto = deriveSourcePhotoAssetPathFromBotPath(nextBot)

    return {
      ...row,
      ...(nextBot ? { original_bot_detection_path: nextBot } : {}),
      ...(nextPatch ? { original_patch_path: nextPatch } : {}),
      ...(nextPhoto ? { source_photo_asset_path: nextPhoto } : {}),
    }
  })
}

async function patchAdapterReportSourcePrefix(packageHandle: FileSystemDirectoryHandleLike) {
  try {
    const text = await readTextFile(packageHandle, ADAPTER_REPORT)
    const raw = JSON.parse(text) as Record<string, unknown>
    raw.source_prefix = PACKAGE_ARCHIVE_DIR
    await writeTextFile(packageHandle, ADAPTER_REPORT, `${JSON.stringify(raw, null, 2)}\n`)
  } catch {
    // adapter-report is optional
  }
}

export async function migratePackageSourceToArchiveIfNeeded(params: {
  packageHandle: FileSystemDirectoryHandleLike
  indexedPaths: string[]
  showToast?: boolean
}): Promise<MigratePackageSourceArchiveResult> {
  const { packageHandle, indexedPaths, showToast = true } = params

  let patchSources: PatchSourceRecord[] = []
  try {
    const text = await readTextFile(packageHandle, PATCH_SOURCES_RECORD)
    patchSources = parsePatchSourceRecords(text)
  } catch {
    return { migrated: false, reason: 'missing-patch-sources' }
  }

  if (!patchSources.length) return { migrated: false, reason: 'empty-patch-sources' }

  const detection = detectPackageSourceArchiveRelocation({ patchSources, indexedPaths })
  if (!detection.shouldMigrate) {
    if (showToast && detection.reason === 'partial-archive-relocation') {
      toast.message('Mixed source layout', {
        id: ARCHIVE_RELOCATE_TOAST_ID,
        description:
          'Files are under 00_source/ but records were not updated. Previews may still work; move remaining files or repath manually.',
      })
    }
    return { migrated: false, reason: detection.reason }
  }

  const rewritten = rewritePatchSourcesForArchivePrefix({ patchSources, indexedPaths })

  try {
    await writeTextFile(packageHandle, PATCH_SOURCES_RECORD, serializeNdjsonLines(rewritten))
    await patchAdapterReportSourcePrefix(packageHandle)
  } catch (err) {
    console.warn('🚨 migratePackageSourceArchive: write failed', { err })
    return { migrated: false, writeFailed: true, reason: 'write-failed' }
  }

  console.log('✅ migratePackageSourceArchive: updated patch-sources', {
    rowCount: rewritten.length,
    matchedCount: detection.matchedCount,
    totalCandidates: detection.totalCandidates,
  })

  if (showToast) {
    toast.success('Updated source paths', {
      id: ARCHIVE_RELOCATE_TOAST_ID,
      description: 'Records now point at 00_source/.',
    })
  }

  return { migrated: true, rowCount: rewritten.length }
}
