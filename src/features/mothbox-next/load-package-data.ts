import type { MothboxNextDatasetManifest } from './dataset-manifest'
import { parseDatasetManifest } from './dataset-manifest'
import {
  parseCameraDayRecords,
  parseClassificationRecords,
  parseDeploymentRecords,
  parsePatchRecords,
  parsePatchSourceRecords,
} from './parse-package-records'
import type {
  CameraDayRecord,
  ClassificationRecord,
  DeploymentRecord,
  PatchRecord,
  PatchSourceRecord,
} from './records'
import { resolveManifestPaths } from './package-paths'
import { flattenClassificationFiles, resolveCurrentClassifications } from './resolve-classifications'
import type { ClassificationRowWithSource } from './resolve-classifications'

export type LoadedMothboxNextPackage = {
  packageRoot: string
  manifest: MothboxNextDatasetManifest
  paths: ReturnType<typeof resolveManifestPaths>
  patches: PatchRecord[]
  patchSources: PatchSourceRecord[]
  deployments: DeploymentRecord[]
  cameraDays: CameraDayRecord[]
  classificationFiles: Array<{ path: string; rows: ClassificationRecord[] }>
  resolvedClassifications: ClassificationRowWithSource[]
}

export type PackageDataAccess = {
  readPackageFile: (packageRelativePath: string) => Promise<string>
  listClassificationFiles: (classificationsDir: string) => Promise<string[]>
}

export async function loadMothboxNextPackageData(params: {
  packageRoot: string
  readManifestText: () => Promise<string>
  access: PackageDataAccess
}): Promise<LoadedMothboxNextPackage | null> {
  const { packageRoot, readManifestText, access } = params

  let manifestRaw: unknown
  try {
    manifestRaw = JSON.parse(await readManifestText())
  } catch {
    return null
  }

  const manifest = parseDatasetManifest(manifestRaw)
  if (!manifest) return null

  const paths = resolveManifestPaths({ packageRoot, manifest })

  const patches = await readPatchRecordsRequired({
    path: paths.patchesNdjson,
    label: 'patches.ndjson',
    access,
  })

  const patchSources = paths.patchSourcesNdjson
    ? await readPatchSourceRecordsOptional({ path: paths.patchSourcesNdjson, access })
    : []
  const deployments = paths.deploymentsNdjson
    ? await readDeploymentRecordsOptional({ path: paths.deploymentsNdjson, access })
    : []
  const cameraDays = paths.cameraDaysNdjson
    ? await readCameraDayRecordsOptional({ path: paths.cameraDaysNdjson, access })
    : []

  const classificationPaths = await access.listClassificationFiles(paths.classificationsDir)
  const classificationFiles: Array<{ path: string; rows: ClassificationRecord[] }> = []

  for (const filePath of classificationPaths) {
    const rows = await readClassificationRecordsRequired({
      path: filePath,
      label: filePath,
      access,
    })
    classificationFiles.push({ path: filePath, rows })
  }

  const flattened = flattenClassificationFiles({ files: classificationFiles })
  const resolvedClassifications = resolveCurrentClassifications({ rows: flattened })

  return {
    packageRoot,
    manifest,
    paths,
    patches,
    patchSources,
    deployments,
    cameraDays,
    classificationFiles,
    resolvedClassifications,
  }
}

async function readPatchRecordsRequired(params: {
  path: string
  label: string
  access: PackageDataAccess
}): Promise<PatchRecord[]> {
  const { path, label, access } = params
  const text = await access.readPackageFile(path)
  try {
    return parsePatchRecords(text)
  } catch (err) {
    throw new Error(`Invalid NDJSON in ${label}: ${String(err)}`)
  }
}

async function readPatchSourceRecordsOptional(params: {
  path: string
  access: PackageDataAccess
}): Promise<PatchSourceRecord[]> {
  const { path, access } = params
  try {
    const text = await access.readPackageFile(path)
    return parsePatchSourceRecords(text)
  } catch {
    return []
  }
}

async function readDeploymentRecordsOptional(params: {
  path: string
  access: PackageDataAccess
}): Promise<DeploymentRecord[]> {
  const { path, access } = params
  try {
    const text = await access.readPackageFile(path)
    return parseDeploymentRecords(text)
  } catch {
    return []
  }
}

async function readCameraDayRecordsOptional(params: {
  path: string
  access: PackageDataAccess
}): Promise<CameraDayRecord[]> {
  const { path, access } = params
  try {
    const text = await access.readPackageFile(path)
    return parseCameraDayRecords(text)
  } catch {
    return []
  }
}

async function readClassificationRecordsRequired(params: {
  path: string
  label: string
  access: PackageDataAccess
}): Promise<ClassificationRecord[]> {
  const { path, label, access } = params
  const text = await access.readPackageFile(path)
  try {
    return parseClassificationRecords(text)
  } catch (err) {
    throw new Error(`Invalid NDJSON in ${label}: ${String(err)}`)
  }
}

export function findPackageManifestInIndexedFiles(
  files: Array<{ path: string; name: string }>,
): { packageRoot: string; manifestPath: string } | null {
  const manifest = files.find((f) => f.name === 'dataset.json')
  if (!manifest) return null

  const normalized = manifest.path.replaceAll('\\', '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 1) {
    return { packageRoot: '', manifestPath: normalized }
  }

  const packageRoot = segments.slice(0, -1).join('/')
  return { packageRoot, manifestPath: normalized }
}

export function isPackageIndexedFiles(files: Array<{ path: string; name: string }>): boolean {
  return findPackageManifestInIndexedFiles(files) !== null
}

export const ADAPTER_COMMAND =
  'Use “Convert to Mothbox Next…” in the app, or: bun run adapters/dinalab-mothbox-v1/adapter.ts <dataset-folder>'
