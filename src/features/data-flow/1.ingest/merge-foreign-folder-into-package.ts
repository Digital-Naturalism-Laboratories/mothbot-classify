import { toast } from 'sonner'
import { parseNdjsonLines, serializeNdjsonLines } from '~/features/mothbox-next/parse-ndjson'
import type { PatchRecord, PatchSourceRecord, ClassificationRecord, DeploymentRecord, CameraDayRecord } from '~/features/mothbox-next/records'
import { flattenClassificationFiles, resolveCurrentClassifications } from '~/features/mothbox-next/resolve-classifications'
import { buildDinalabMothboxV1Records } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/build-dinalab-adapter-records'
import { writeMergedPackageRecords } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/write-dinalab-adapter-package'
import { userSessionStore } from '~/stores/ui'
import { createBrowserDinalabAdapterIO } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import type { DinalabAdapterProgressCallback } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/adapter-io'
import { readTextFile } from '~/utils/fs-directory-handle'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { sanitizeDatasetFolderName } from './choose-datasets-folder'

const MERGE_FOREIGN_TOAST_ID = 'merge-foreign-folder'

type DirectoryWithGet = FileSystemDirectoryHandleLike & {
  getDirectoryHandle?: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  getFileHandle?: (name: string, opts?: { create?: boolean }) => Promise<{ getFile?: () => Promise<File> }>
}

export async function mergeForeignFolderIntoPackage(params: {
  packageHandle: FileSystemDirectoryHandleLike
  folderName: string
  foreignFolderName: string
  onProgress?: DinalabAdapterProgressCallback
}): Promise<{ addedPatchCount: number }> {
  const { packageHandle, folderName, foreignFolderName, onProgress } = params
  const packageDir = packageHandle as DirectoryWithGet

  let foreignHandle: FileSystemDirectoryHandleLike
  try {
    foreignHandle = (await packageDir.getDirectoryHandle?.(foreignFolderName, { create: false })) as FileSystemDirectoryHandleLike
  } catch {
    throw new Error(`Could not find foreign folder “${foreignFolderName}”.`)
  }

  const datasetId = await readDatasetIdFromManifest(packageDir)
  const humanClassifierId =
    (userSessionStore.get()?.initials || '').trim().toLowerCase() ||
    (await readHumanClassifierIdFromPackage(packageDir)) ||
    'user'

  const existingPatches = await readNdjsonFile<PatchRecord>(packageDir, '02_records/patches.ndjson')
  const existingPatchSources = await readNdjsonFile<PatchSourceRecord>(packageDir, '02_records/patch-sources.ndjson')
  const existingDeployments = await readNdjsonFile<DeploymentRecord>(packageDir, '02_records/deployments.ndjson')
  const existingCameraDays = await readNdjsonFile<CameraDayRecord>(packageDir, '02_records/camera-days.ndjson')
  const existingBotRows = await readNdjsonFile<ClassificationRecord>(packageDir, '03_classifications/_bot.ndjson')
  const humanClassifierPath = `03_classifications/${humanClassifierId}.ndjson`
  const existingHumanRows = await readNdjsonFile<ClassificationRecord>(packageDir, humanClassifierPath)

  const built = await buildDinalabMothboxV1Records({
    datasetId,
    io: createBrowserDinalabAdapterIO({ sourceHandle: foreignHandle, packageHandle }),
    humanClassifierId,
    retainPatchesInSource: true,
    packageRelativeSourcePrefix: foreignFolderName,
    packageSourceLayout: 'in_place',
    legacySourceRootName: foreignFolderName,
    onProgress,
  })

  const merged = mergeRecordsByPatchId({
    humanClassifierId,
    existing: {
      patches: existingPatches,
      patchSources: existingPatchSources,
      deployments: existingDeployments,
      cameraDays: existingCameraDays,
      botRows: existingBotRows,
      humanRows: existingHumanRows,
    },
    incoming: built,
  })

  if (merged.addedPatchCount === 0) {
    toast.message('No new patches found', {
      id: MERGE_FOREIGN_TOAST_ID,
      description: `“${foreignFolderName}” did not add any patches not already in ${folderName}.`,
    })
    return { addedPatchCount: 0 }
  }

  const io = createBrowserDinalabAdapterIO({ sourceHandle: foreignHandle, packageHandle })
  await writeMergedPackageRecords({
    io,
    built: merged.built,
    humanClassifierId,
    patchCount: merged.built.patches.length,
  })

  toast.success('Foreign folder merged', {
    id: MERGE_FOREIGN_TOAST_ID,
    description: `Added ${merged.addedPatchCount.toLocaleString()} patches from “${foreignFolderName}”.`,
  })

  return { addedPatchCount: merged.addedPatchCount }
}

function mergeRecordsByPatchId(params: {
  humanClassifierId: string
  existing: {
    patches: PatchRecord[]
    patchSources: PatchSourceRecord[]
    deployments: DeploymentRecord[]
    cameraDays: CameraDayRecord[]
    botRows: ClassificationRecord[]
    humanRows: ClassificationRecord[]
  }
  incoming: Awaited<ReturnType<typeof buildDinalabMothboxV1Records>>
}) {
  const { existing, incoming, humanClassifierId } = params
  const humanClassifierPath = `03_classifications/${humanClassifierId}.ndjson`
  const knownPatchIds = new Set(existing.patches.map((row) => row.patch_id))

  const newPatches = incoming.patches.filter((row) => !knownPatchIds.has(row.patch_id))
  const patches = [...existing.patches, ...newPatches]
  const patchSources = [...existing.patchSources, ...incoming.patchSources.filter((row) => !knownPatchIds.has(row.patch_id))]

  const deploymentsById = new Map(existing.deployments.map((row) => [row.deployment_id, row]))
  for (const row of incoming.deployments) deploymentsById.set(row.deployment_id, row)

  const cameraDaysById = new Map(existing.cameraDays.map((row) => [row.camera_day_id, row]))
  for (const row of incoming.cameraDays) cameraDaysById.set(row.camera_day_id, row)

  const botRows = [...existing.botRows, ...incoming.botRows.filter((row) => !knownPatchIds.has(row.patch_id))]
  const humanRows = [...existing.humanRows, ...incoming.humanRows.filter((row) => !knownPatchIds.has(row.patch_id))]

  const resolvedClassifications = resolveCurrentClassifications({
    rows: flattenClassificationFiles({
      files: [
        { path: '03_classifications/_bot.ndjson', rows: botRows },
        ...(humanRows.length ? [{ path: humanClassifierPath, rows: humanRows }] : []),
      ],
    }),
  })

  return {
    addedPatchCount: newPatches.length,
    built: {
      patches,
      patchSources,
      botRows,
      humanRows,
      resolvedClassifications,
      deployments: [...deploymentsById.values()].sort((a, b) => a.deployment_id.localeCompare(b.deployment_id)),
      cameraDays: [...cameraDaysById.values()].sort((a, b) => a.camera_day_id.localeCompare(b.camera_day_id)),
    },
  }
}

async function readNdjsonFile<T>(packageDir: DirectoryWithGet, relativePath: string): Promise<T[]> {
  try {
    const text = await readTextFile(packageDir, relativePath)
    return parseNdjsonLines<T>(text)
  } catch {
    return []
  }
}

async function readDatasetIdFromManifest(packageDir: DirectoryWithGet): Promise<string> {
  try {
    const file = await packageDir.getFileHandle?.('dataset.json', { create: false })
    const blob = await file?.getFile?.()
    if (!blob) return sanitizeDatasetFolderName((packageDir as { name?: string }).name ?? 'dataset')
    const parsed = JSON.parse(await blob.text())
    const id = (parsed as { dataset_id?: unknown })?.dataset_id
    if (typeof id === 'string' && id.trim()) return id.trim()
  } catch {
    // fall through
  }
  return sanitizeDatasetFolderName((packageDir as { name?: string }).name ?? 'dataset')
}

async function readHumanClassifierIdFromPackage(packageDir: DirectoryWithGet): Promise<string | null> {
  const patches = await readNdjsonFile<PatchRecord>(packageDir, '02_records/patches.ndjson')
  if (!patches.length) return null

  try {
    const entries = await listClassificationFiles(packageDir)
    const humanFile = entries.find((name) => name !== '_bot.ndjson' && name.endsWith('.ndjson'))
    if (!humanFile) return null
    return humanFile.replace(/\.ndjson$/i, '')
  } catch {
    return null
  }
}

async function listClassificationFiles(packageDir: DirectoryWithGet): Promise<string[]> {
  const dir = (await packageDir.getDirectoryHandle?.('03_classifications', { create: false })) as DirectoryWithEntries
  if (!dir?.entries) return []

  const names: string[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle?.kind === 'file' && name.endsWith('.ndjson')) names.push(name)
  }
  return names
}

type DirectoryWithEntries = FileSystemDirectoryHandleLike & {
  entries?: () => AsyncIterable<[string, FileSystemDirectoryHandleLike]>
}
