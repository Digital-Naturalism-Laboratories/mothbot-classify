/**
 * One set of records per project.
 *
 * A project is the folder that holds `_processed` (see data-flow/1.ingest/project-folder.ts).
 * Older setups kept one package per folder *inside* `_processed`:
 *
 *   Tucson/_processed/DesertHouse/{dataset.json, 02_records/, 03_classifications/, Cactus/…}
 *
 * This combines those packages into one at `Tucson/_processed/`. Every path in a package
 * is relative to the package folder, so paths gain the folder's name in front
 * (`Cactus/…` → `DesertHouse/Cactus/…`), and deployments and nights are named again the
 * way Classify names them when it loads a project (derive-dinalab-hierarchy.ts), e.g.
 * `DesertHouse~Cactus` and `DesertHouse~Cactus__2026-08-11`.
 *
 * Identifications are keyed by patch id, which never changes, so the files that hold
 * them (`03_classifications/*`, current classifications, measurements, morpho covers)
 * are copied line for line. Nothing here reads or writes files; see
 * data-flow/1.ingest/combine-project-packages.ts.
 */
import {
  DEPLOYMENT_PATH_SEPARATOR,
  resolveDeploymentContext,
  resolveDeploymentContextFromPatchPath,
} from './adapters/dinalab-mothbox-v1/derive-dinalab-hierarchy'
import {
  CAMEL_CASE_PACKAGE_VERSION,
  convertNdjsonTextToCamelCase,
  fileKeyStyleOfManifestText,
  fromFileKeys,
  manifestFromFile,
  manifestToFile,
  packageRowLine,
  type FileKeyStyle,
} from './file-keys'

export type SubPackageRecords = {
  /**
   * The package's folder inside `_processed`, e.g. `DesertHouse`; `''` for records the
   * project already has at `_processed` itself (projects merged into one that has records).
   */
  folder: string
  manifestText: string
  /** Record files by their path inside the package, e.g. `02_records/patches.ndjson`. */
  files: Record<string, string>
}

export type CombinedProjectRecords = {
  manifestText: string
  /** Record files by their path inside the project's `_processed`. */
  files: Record<string, string>
  summary: {
    patches: number
    /** Lines per `03_classifications/<file>`, combined. */
    classificationLines: Record<string, number>
    /** Old deployment id (per folder) → new one. */
    deployments: Array<{ folder: string; from: string; to: string }>
  }
}

const PATCHES = '02_records/patches.ndjson'
const PATCH_SOURCES = '02_records/patch-sources.ndjson'
const DEPLOYMENTS = '02_records/deployments.ndjson'
const CAMERA_DAYS = '02_records/camera-days.ndjson'
const SESSIONS = '02_records/sessions.ndjson'
/** Rows keyed by patch id (or plain values): copied line for line. */
const COPIED_AS_IS = new Set([
  '02_records/current-classifications.ndjson',
  '02_records/patch-measurements.ndjson',
  '02_records/morpho-covers.ndjson',
])
/** camelCase in every package version (own readers): never converted. */
const ALWAYS_CAMEL = new Set([SESSIONS, '02_records/non-target-categories.ndjson'])
const PATH_FIELDS_OF_SOURCES = ['source_photo_asset_path', 'original_patch_path', 'original_bot_detection_path', 'metadata_path']

type Row = Record<string, unknown>

function ndjsonLines(text: string | undefined): string[] {
  if (!text) return []
  const lines: string[] = []
  for (const line of text.split('\n')) if (line.trim()) lines.push(line)
  return lines
}

function parseRows(text: string | undefined): Row[] {
  const rows: Row[] = []
  for (const line of ndjsonLines(text)) {
    try {
      const value = JSON.parse(line)
      if (value && typeof value === 'object' && !Array.isArray(value)) rows.push(value as Row)
    } catch {
      // A damaged line in a record file is skipped, as the package readers do.
    }
  }
  return rows
}

function withFolder(folder: string, path: unknown): unknown {
  if (!folder || typeof path !== 'string' || !path) return path
  if (/^[a-z]+:\/\//i.test(path) || path.startsWith('/')) return path
  return `${folder}/${path.replace(/^\.\//, '')}`
}

function joinText(lines: string[]): string {
  return lines.length ? lines.join('\n') + '\n' : ''
}

/** Fills fields the first row lacks from the second; never overwrites a value. */
function mergeRows(first: Row, second: Row): Row {
  const out: Row = { ...first }
  for (const [key, value] of Object.entries(second)) {
    if (out[key] === undefined || out[key] === null || out[key] === '') out[key] = value
  }
  return out
}

export function combineProjectRecords(params: {
  projectName: string
  subPackages: SubPackageRecords[]
}): CombinedProjectRecords {
  const { projectName, subPackages } = params
  if (!subPackages.length) throw new Error('No folders with records to combine.')

  const styles = subPackages.map((sub) => fileKeyStyleOfManifestText(sub.manifestText))
  const style: FileKeyStyle = styles.includes('camel') ? 'camel' : 'snake'

  const patchLines: string[] = []
  const sourceLines: string[] = []
  const deploymentsById = new Map<string, Row>()
  const cameraDaysById = new Map<string, Row>()
  const sessionLines: string[] = []
  const copied = new Map<string, string[]>()
  const seenPatchIds = new Map<string, string>()
  const sessionOwners = new Map<string, number>() // session id → which package it came from
  const deploymentChanges: CombinedProjectRecords['summary']['deployments'] = []
  const classificationLines: Record<string, number> = {}

  subPackages.forEach((sub, index) => {
    const { folder, files } = sub
    const convert = styles[index] !== style // older snake_case package joining camelCase ones

    // Patch sources first: their detection-file path is what names the deployment.
    const botPathByPatch = new Map<string, string>()
    for (const raw of parseRows(files[PATCH_SOURCES])) {
      const row = fromFileKeys<Row>(raw)
      for (const field of PATH_FIELDS_OF_SOURCES) if (field in row) row[field] = withFolder(folder, row[field])
      if (typeof row.patch_id === 'string' && typeof row.original_bot_detection_path === 'string') {
        botPathByPatch.set(row.patch_id, row.original_bot_detection_path)
      }
      sourceLines.push(packageRowLine(row, style))
    }

    const deploymentMap = new Map<string, string>()
    const siteByDeployment = new Map<string, string>()
    const cameraDayMap = new Map<string, string>()
    const patchRows: Row[] = []
    for (const raw of parseRows(files[PATCHES])) {
      const row = fromFileKeys<Row>(raw)
      const patchId = String(row.patch_id ?? '')
      const other = seenPatchIds.get(patchId)
      if (patchId && other !== undefined) {
        throw new Error(`Patch ${patchId} is in both ${other} and ${folder}; the folders were not combined.`)
      }
      seenPatchIds.set(patchId, folder)
      row.asset_path = withFolder(folder, row.asset_path)
      row.dataset_id = projectName
      const botPath = botPathByPatch.get(patchId)
      const context = botPath
        ? resolveDeploymentContext({ botRelativePath: botPath, datasetId: projectName })
        : resolveDeploymentContextFromPatchPath({ patchRelativePath: String(row.asset_path ?? ''), datasetId: projectName })
      if (typeof row.deployment_id === 'string') deploymentMap.set(row.deployment_id, context.deploymentId)
      if (typeof row.camera_day_id === 'string') cameraDayMap.set(row.camera_day_id, context.cameraDayId)
      siteByDeployment.set(context.deploymentId, context.siteId)
      row.deployment_id = context.deploymentId
      row.camera_day_id = context.cameraDayId
      patchRows.push(row)
    }
    for (const [from, to] of deploymentMap) deploymentChanges.push({ folder, from, to })
    const newDeploymentId = (old: unknown) => {
      const id = String(old ?? '')
      return deploymentMap.get(id) ?? (id && folder ? `${folder}${DEPLOYMENT_PATH_SEPARATOR}${id}` : id)
    }

    // Sessions keep their ids unless another folder already used the same one.
    const sessionRename = new Map<string, string>()
    for (const raw of parseRows(files[SESSIONS])) {
      const session = { ...raw }
      const id = String(session.sessionID ?? '')
      if (id && sessionOwners.has(id) && sessionOwners.get(id) !== index) {
        const renamed = `${folder || 'project'}${DEPLOYMENT_PATH_SEPARATOR}${id}`
        sessionRename.set(id, renamed)
        session.sessionID = renamed
        if (Array.isArray(session.captureWindows)) {
          session.captureWindows = session.captureWindows.map((window: Row) => {
            const windowId = String(window?.captureWindowID ?? '')
            if (!windowId) return window
            const renamedWindow = `${folder || 'project'}${DEPLOYMENT_PATH_SEPARATOR}${windowId}`
            sessionRename.set(windowId, renamedWindow)
            return { ...window, captureWindowID: renamedWindow }
          })
        }
      }
      if (id) sessionOwners.set(String(session.sessionID), index)
      if (session.deploymentID !== undefined) session.deploymentID = newDeploymentId(session.deploymentID)
      sessionLines.push(JSON.stringify(session))
    }

    for (const row of patchRows) {
      if (typeof row.session_id === 'string' && sessionRename.has(row.session_id)) row.session_id = sessionRename.get(row.session_id)
      if (typeof row.capture_window_id === 'string' && sessionRename.has(row.capture_window_id)) {
        row.capture_window_id = sessionRename.get(row.capture_window_id)
      }
      patchLines.push(packageRowLine(row, style))
    }

    for (const raw of parseRows(files[DEPLOYMENTS])) {
      const row = fromFileKeys<Row>(raw)
      const id = newDeploymentId(row.deployment_id)
      row.deployment_id = id
      const site = siteByDeployment.get(id)
      if (site) row.site_id = site
      deploymentsById.set(id, deploymentsById.has(id) ? mergeRows(deploymentsById.get(id)!, row) : row)
    }

    for (const raw of parseRows(files[CAMERA_DAYS])) {
      const row = fromFileKeys<Row>(raw)
      const oldId = String(row.camera_day_id ?? '')
      const id = cameraDayMap.get(oldId) ?? oldId
      row.camera_day_id = id
      if (row.deployment_id !== undefined) row.deployment_id = newDeploymentId(row.deployment_id)
      cameraDaysById.set(id, cameraDaysById.has(id) ? mergeRows(cameraDaysById.get(id)!, row) : row)
    }

    for (const [path, text] of Object.entries(files)) {
      if ([PATCHES, PATCH_SOURCES, DEPLOYMENTS, CAMERA_DAYS, SESSIONS].includes(path)) continue
      if (!path.endsWith('.ndjson')) continue
      const lines = ndjsonLines(convert && !ALWAYS_CAMEL.has(path) ? convertNdjsonTextToCamelCase(text) : text)
      if (path.startsWith('03_classifications/')) {
        classificationLines[path] = (classificationLines[path] ?? 0) + lines.length
      }
      const target = copied.get(path) ?? []
      if (path.startsWith('03_classifications/') || COPIED_AS_IS.has(path)) {
        for (const line of lines) target.push(line)
      } else {
        // Lists shared across the project (morpho links, Non-Target categories, device
        // types): the same line from two folders is kept once.
        const have = new Set(target)
        for (const line of lines) {
          if (have.has(line)) continue
          target.push(line)
          have.add(line)
        }
      }
      copied.set(path, target)
    }
  })

  const files: Record<string, string> = {
    [PATCHES]: joinText(patchLines),
    [PATCH_SOURCES]: joinText(sourceLines),
    [DEPLOYMENTS]: joinText([...deploymentsById.values()].map((row) => packageRowLine(row, style))),
    [CAMERA_DAYS]: joinText([...cameraDaysById.values()].map((row) => packageRowLine(row, style))),
  }
  if (sessionLines.length) files[SESSIONS] = joinText(sessionLines)
  for (const [path, lines] of copied) files[path] = joinText(lines)

  // The project's dataset.json: its own when it had one, else the first folder's;
  // named after the project.
  const base = subPackages.find((sub) => sub.folder === '') ?? subPackages[0]
  const manifest = manifestFromFile(JSON.parse(base.manifestText)) as Row
  manifest.dataset_id = projectName
  if (style === 'camel' && (typeof manifest.version !== 'number' || manifest.version < CAMEL_CASE_PACKAGE_VERSION)) {
    manifest.version = CAMEL_CASE_PACKAGE_VERSION
  }
  const sources = new Set<string>()
  for (const sub of subPackages) {
    const each = (manifestFromFile(JSON.parse(sub.manifestText)) as Row).classification_sources
    if (Array.isArray(each)) for (const source of each) sources.add(String(source))
  }
  for (const path of Object.keys(files)) if (path.startsWith('03_classifications/')) sources.add(path)
  if (sources.size) manifest.classification_sources = [...sources].sort()
  const manifestText = JSON.stringify(style === 'camel' ? manifestToFile(manifest) : manifest, null, 2) + '\n'

  return { manifestText, files, summary: { patches: patchLines.length, classificationLines, deployments: deploymentChanges } }
}
