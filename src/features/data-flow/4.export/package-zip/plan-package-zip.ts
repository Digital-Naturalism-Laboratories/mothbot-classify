/**
 * What goes into a zipped export of a package for a collaborator: the processed side of
 * the data for some sessions (or all of them), laid out so the unzipped folder opens in
 * Classify as a package of its own.
 *
 * - dataset.json, unchanged.
 * - 02_records/: every record file, filtered to the chosen sessions' patches.
 * - 03_classifications/: every identification file (machine and each person's), filtered
 *   the same way, with every row kept in order so the history travels with it.
 * - The files the records point to: each patch image, each photo's detection JSON, and —
 *   only when asked — the full-size source photos (often too large to send).
 *
 * Rows are written back in the package's own field-name style.
 */

import type { LoadedMothboxNextPackage } from '~/features/mothbox-next/load-package-data'
import type { ClassificationRecord, PatchRecord } from '~/features/mothbox-next/records'
import { fileKeyStyleForVersion, serializePackageRows } from '~/features/mothbox-next/file-keys'
import { PATCH_MEASUREMENTS_RECORD } from '~/features/mothbox-next/patch-measurements'
import { PACKAGE_SESSIONS_RECORD, serializeSessionRecords } from '~/features/mothbox-next/sessions'
import { PACKAGE_NON_TARGET_CATEGORIES_RECORD, serializeNonTargetCategories } from '~/features/mothbox-next/non-target-categories-package'
import { resolveSourcePhotoAssetPathForPatchSource } from '~/features/mothbox-next/migrate-package-source-to-archive'

export type ZipTextEntry = { kind: 'text'; path: string; text: string }
/** A file copied from the package folder, by its path relative to the package. */
export type ZipFileEntry = { kind: 'file'; path: string; role: 'patch' | 'detection' | 'photo' | 'extra' }
export type ZipEntry = ZipTextEntry | ZipFileEntry

export type PackageZipPlan = {
  entries: ZipEntry[]
  patchCount: number
  sessionCount: number
  photoCount: number
}

export function planPackageZip(params: {
  loaded: LoadedMothboxNextPackage
  /** The package's dataset.json text, copied as it is. */
  manifestText: string
  /** Camera-day (session) ids to include; all sessions when omitted. */
  cameraDayIds?: readonly string[]
  includeSourcePhotos?: boolean
  /** Extra record files read from the package (e.g. morpho links), copied as they are. */
  extraRecordTexts?: Record<string, string>
}): PackageZipPlan {
  const { loaded, manifestText, includeSourcePhotos = false } = params
  const style = fileKeyStyleForVersion(loaded.manifest.version)
  const records = loaded.manifest.records
  const chosen = params.cameraDayIds ? new Set(params.cameraDayIds) : null

  const patches = loaded.patches.filter((p) => !chosen || (p.camera_day_id != null && chosen.has(p.camera_day_id)))
  const patchIds = new Set(patches.map((p) => p.patch_id))
  const occurrenceIds = new Set(patches.map((p) => p.occurrence_id || p.patch_id))
  const inScope = (row: { patch_id?: string; occurrence_id?: string }) =>
    (!!row.patch_id && patchIds.has(row.patch_id)) || (!!row.occurrence_id && occurrenceIds.has(row.occurrence_id))

  const cameraDays = loaded.cameraDays.filter((d) => !chosen || chosen.has(d.camera_day_id))
  const deploymentIds = new Set(patches.map((p) => p.deployment_id).filter(Boolean) as string[])
  const deployments = loaded.deployments.filter((d) => deploymentIds.has(d.deployment_id))
  const sessionIds = new Set(patches.map((p) => p.session_id).filter(Boolean) as string[])
  const sessions = (loaded.sessions ?? []).filter((s) => sessionIds.has(s.sessionID))
  const patchSources = loaded.patchSources.filter((s) => patchIds.has(s.patch_id))
  const measurements = Object.values(loaded.measurements ?? {}).filter((m) => patchIds.has(m.patch_id))

  const entries: ZipEntry[] = [{ kind: 'text', path: 'dataset.json', text: manifestText }]
  const text = (path: string | undefined, rows: readonly object[]) => {
    if (path) entries.push({ kind: 'text', path, text: serializePackageRows(rows, style) })
  }
  text(records.patches, patches)
  text(records.patch_sources ?? '02_records/patch-sources.ndjson', patchSources)
  text(records.deployments ?? '02_records/deployments.ndjson', deployments)
  text(records.camera_days ?? '02_records/camera-days.ndjson', cameraDays)
  text(PATCH_MEASUREMENTS_RECORD, measurements)
  text(
    records.current_classifications ?? '02_records/current-classifications.ndjson',
    loaded.resolvedClassifications.filter(inScope),
  )
  entries.push({ kind: 'text', path: records.sessions ?? PACKAGE_SESSIONS_RECORD, text: serializeSessionRecords(sessions) })
  if (loaded.nonTargetCategories?.length) {
    entries.push({
      kind: 'text',
      path: PACKAGE_NON_TARGET_CATEGORIES_RECORD,
      text: serializeNonTargetCategories(loaded.nonTargetCategories.map((path) => ({ path }))),
    })
  }
  for (const [path, extra] of Object.entries(params.extraRecordTexts ?? {})) {
    entries.push({ kind: 'text', path, text: extra })
  }

  // Every identification file, filtered, rows kept in order (the history travels too).
  for (const file of loaded.classificationFiles) {
    const rows: ClassificationRecord[] = file.rows.filter(inScope)
    entries.push({ kind: 'text', path: stripPackageRoot(file.path, loaded.packageRoot), text: serializePackageRows(rows, style) })
  }

  // The files the records point to.
  const files = new Map<string, ZipFileEntry['role']>()
  const add = (path: string | undefined | null, role: ZipFileEntry['role']) => {
    const clean = normalizeRelative(path)
    if (clean && !files.has(clean)) files.set(clean, role)
  }
  for (const patch of patches) add(patch.asset_path, 'patch')
  const photos = new Set<string>()
  for (const source of patchSources) {
    add(source.original_bot_detection_path ?? source.metadata_path, 'detection')
    const photo = resolveSourcePhotoAssetPathForPatchSource(source)
    if (photo) photos.add(normalizeRelative(photo))
  }
  if (includeSourcePhotos) for (const photo of photos) add(photo, 'photo')
  for (const [path, role] of files) entries.push({ kind: 'file', path, role })

  return { entries, patchCount: patches.length, sessionCount: cameraDays.length, photoCount: photos.size }
}

/** Sessions (camera days) a package has, with their patch counts, for choosing what to export. */
export function sessionsForExport(loaded: LoadedMothboxNextPackage): Array<{ id: string; patchCount: number }> {
  const counts = new Map<string, number>()
  for (const patch of loaded.patches as PatchRecord[]) {
    if (patch.camera_day_id) counts.set(patch.camera_day_id, (counts.get(patch.camera_day_id) ?? 0) + 1)
  }
  return loaded.cameraDays.map((d) => ({ id: d.camera_day_id, patchCount: counts.get(d.camera_day_id) ?? 0 }))
}

function normalizeRelative(path: string | undefined | null): string {
  return (path ?? '').replaceAll('\\', '/').replace(/^\.?\/+/, '').trim()
}

function stripPackageRoot(path: string, packageRoot: string): string {
  const clean = normalizeRelative(path)
  const root = normalizeRelative(packageRoot).replace(/\/+$/, '')
  return root && clean.startsWith(`${root}/`) ? clean.slice(root.length + 1) : clean
}
