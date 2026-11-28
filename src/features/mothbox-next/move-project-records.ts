/**
 * Moving records between projects, after Mothbot Process moved folders of results
 * from one project to another (a deployment moved, or a project split into its
 * folders). Process leaves a note in the receiving project naming the folders; this
 * moves exactly those folders' records and identifications.
 *
 * The giving project keeps everything else. The moved rows are joined onto the
 * receiving project's own records with the same code that combines projects
 * (combine-project-records.ts), so their deployments and nights are named the way
 * Classify names them in the receiving project. Identification lines are moved as
 * they are. Nothing here reads or writes files; see data-flow/1.ingest/records-to-move.ts.
 */
import { combineProjectRecords, type CombinedProjectRecords } from './combine-project-records'
import { fromFileKeys } from './file-keys'

export type PackageTexts = { manifestText: string; files: Record<string, string> }

export type FolderMove = {
  /** The folder's path inside the giving project's `_processed`. */
  fromFolder: string
  /** Its path inside the receiving project's `_processed` (`''`: the whole of it). */
  toFolder: string
}

export type MovedProjectRecords = {
  receiver: CombinedProjectRecords
  /** The giving project's record files without the moved rows. */
  giverFiles: Record<string, string>
  movedPatches: number
  movedHumanLines: number
  /** True when no patches are left in the giving project. */
  giverEmpty: boolean
}

const PATCHES = '02_records/patches.ndjson'
const PATCH_SOURCES = '02_records/patch-sources.ndjson'
const DEPLOYMENTS = '02_records/deployments.ndjson'
const CAMERA_DAYS = '02_records/camera-days.ndjson'
const SESSIONS = '02_records/sessions.ndjson'
const PATCH_KEYED = new Set([
  '02_records/current-classifications.ndjson',
  '02_records/patch-measurements.ndjson',
  '02_records/morpho-covers.ndjson',
])

type Row = Record<string, unknown>

function lines(text: string | undefined): string[] {
  const out: string[] = []
  for (const line of (text ?? '').split('\n')) if (line.trim()) out.push(line)
  return out
}

function parse(line: string): Row | null {
  try {
    const value = JSON.parse(line)
    return value && typeof value === 'object' && !Array.isArray(value) ? (fromFileKeys(value) as Row) : null
  } catch {
    return null
  }
}

function joinText(list: string[]) {
  return list.length ? list.join('\n') + '\n' : ''
}

/** Rewrites a path inside the giving project to the receiving one, or `null` when it isn't moving. */
function moverFor(moves: FolderMove[]) {
  return (path: unknown): string | null => {
    if (typeof path !== 'string' || !path) return null
    for (const { fromFolder, toFolder } of moves) {
      const from = fromFolder.replace(/^\/+|\/+$/g, '')
      if (!from || !path.startsWith(`${from}/`)) continue
      const rest = path.slice(from.length + 1)
      const to = toFolder.replace(/^\/+|\/+$/g, '')
      return to ? `${to}/${rest}` : rest
    }
    return null
  }
}

/** Replaces the path fields of a raw (file-style) row, keeping its key style. */
function rewriteRow(line: string, fields: Record<string, string>, move: (path: unknown) => string | null): string {
  const raw = JSON.parse(line) as Row
  for (const [internal, camel] of Object.entries(fields)) {
    for (const key of [internal, camel]) {
      if (key in raw) {
        const moved = move(raw[key])
        if (moved !== null) raw[key] = moved
      }
    }
  }
  return JSON.stringify(raw)
}

const ASSET_FIELD = { asset_path: 'assetPath' }
const SOURCE_FIELDS = {
  source_photo_asset_path: 'sourcePhotoAssetPath',
  original_patch_path: 'originalPatchPath',
  original_bot_detection_path: 'originalBotDetectionPath',
  metadata_path: 'metadataPath',
}

export function moveProjectRecords(params: {
  giver: PackageTexts
  receiver?: PackageTexts | null
  receiverName: string
  moves: FolderMove[]
}): MovedProjectRecords {
  const { giver, receiver, receiverName, moves } = params
  const move = moverFor(moves)

  // Which patches move: those whose image is inside a moved folder.
  const moving = new Set<string>()
  const movedDeployments = new Set<string>()
  const movedNights = new Set<string>()
  const movedSessions = new Set<string>()
  const keptDeployments = new Set<string>()
  const keptNights = new Set<string>()
  const keptSessions = new Set<string>()
  const movedPatchLines: string[] = []
  const keptPatchLines: string[] = []
  for (const line of lines(giver.files[PATCHES])) {
    const row = parse(line)
    if (!row) continue
    const id = String(row.patch_id ?? '')
    if (move(row.asset_path) !== null) {
      moving.add(id)
      movedPatchLines.push(rewriteRow(line, ASSET_FIELD, move))
      if (row.deployment_id) movedDeployments.add(String(row.deployment_id))
      if (row.camera_day_id) movedNights.add(String(row.camera_day_id))
      if (row.session_id) movedSessions.add(String(row.session_id))
    } else {
      keptPatchLines.push(line)
      if (row.deployment_id) keptDeployments.add(String(row.deployment_id))
      if (row.camera_day_id) keptNights.add(String(row.camera_day_id))
      if (row.session_id) keptSessions.add(String(row.session_id))
    }
  }

  const moved: Record<string, string[]> = { [PATCHES]: movedPatchLines }
  const kept: Record<string, string[]> = { [PATCHES]: keptPatchLines }
  const push = (target: Record<string, string[]>, path: string, line: string) => {
    if (!target[path]) target[path] = []
    target[path].push(line)
  }
  let movedHumanLines = 0

  for (const [path, text] of Object.entries(giver.files)) {
    if (path === PATCHES || !path.endsWith('.ndjson')) continue
    const isClassifications = path.startsWith('03_classifications/')
    for (const line of lines(text)) {
      const row = parse(line)
      if (path === PATCH_SOURCES || isClassifications || PATCH_KEYED.has(path)) {
        const goes = !!row && moving.has(String(row.patch_id ?? ''))
        if (!goes) {
          push(kept, path, line)
          continue
        }
        push(moved, path, path === PATCH_SOURCES ? rewriteRow(line, SOURCE_FIELDS, move) : line)
        if (isClassifications && !path.endsWith('/_bot.ndjson')) movedHumanLines++
      } else if (path === DEPLOYMENTS || path === CAMERA_DAYS || path === SESSIONS) {
        // Sessions are camelCase in every package version (their own reader).
        const id =
          path === DEPLOYMENTS
            ? String(row?.deployment_id ?? '')
            : path === CAMERA_DAYS
              ? String(row?.camera_day_id ?? '')
              : String((JSON.parse(line) as Row).sessionID ?? '')
        const [movedSet, keptSet] =
          path === DEPLOYMENTS ? [movedDeployments, keptDeployments] : path === CAMERA_DAYS ? [movedNights, keptNights] : [movedSessions, keptSessions]
        if (movedSet.has(id)) push(moved, path, line)
        // A row still used by patches that stay, or by none at all, stays too.
        if (keptSet.has(id) || !movedSet.has(id)) push(kept, path, line)
      } else {
        // Lists for the whole project (morpho links, Non-Target categories, device types): both keep them.
        push(moved, path, line)
        push(kept, path, line)
      }
    }
  }

  // The receiving project may already have its own copies of these patches (its new
  // nights were added before the move was applied): the moved rows, which carry the
  // identifications, replace them. Its own identification lines are kept.
  let receiverPackage: PackageTexts | null = receiver ?? null
  if (receiverPackage) {
    const files: Record<string, string> = {}
    for (const [path, text] of Object.entries(receiverPackage.files)) {
      const keepAll = path.startsWith('03_classifications/') && !path.endsWith('/_bot.ndjson')
      files[path] = keepAll
        ? text
        : joinText(lines(text).filter((line) => !moving.has(String(parse(line)?.patch_id ?? '\u0000'))))
    }
    receiverPackage = { manifestText: receiverPackage.manifestText, files }
  }

  const movedPackage: PackageTexts = {
    manifestText: giver.manifestText,
    files: Object.fromEntries(Object.entries(moved).map(([path, list]) => [path, joinText(list)])),
  }
  const receiverRecords = combineProjectRecords({
    projectName: receiverName,
    subPackages: [
      ...(receiverPackage ? [{ folder: '', ...receiverPackage }] : []),
      { folder: '', ...movedPackage },
    ],
  })

  const giverFiles: Record<string, string> = {}
  for (const path of Object.keys(giver.files)) giverFiles[path] = joinText(kept[path] ?? [])

  return {
    receiver: receiverRecords,
    giverFiles,
    movedPatches: moving.size,
    movedHumanLines,
    giverEmpty: keptPatchLines.length === 0,
  }
}
