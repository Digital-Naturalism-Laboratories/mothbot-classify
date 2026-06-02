#!/usr/bin/env bun
/**
 * dinalab-mothbox-v1 — convert legacy Dinalab source tree into a Mothbox Next package.
 *
 * Usage: bun run adapters/dinalab-mothbox-v1/adapter.ts <dataset-folder> [--force]
 *
 * Supports either <dataset-folder>/00_source/ or an in-place legacy folder with
 * night folders, *_botdetection.json, and patches/*.jpg.
 */
import path from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { isAmiCropImagePath } from '../../src/features/data-flow/1.ingest/classify-dataset-folder'
import { runDinalabMothboxV1Adapter } from '../../src/features/mothbox-next/adapters/dinalab-mothbox-v1/run-adapter'
import { createNodeDinalabAdapterIO } from '../../src/features/mothbox-next/adapters/dinalab-mothbox-v1/node-adapter-io'

const datasetFolder = process.argv[2]
if (!datasetFolder) {
  console.error('Usage: bun run adapters/dinalab-mothbox-v1/adapter.ts <dataset-folder> [--force]')
  process.exit(2)
}

const root = path.resolve(datasetFolder)
const sourceDir = path.join(root, '00_source')
const force = process.argv.includes('--force')

async function main() {
  if ((await exists(path.join(root, 'dataset.json'))) && !force) {
    console.error(`Already a Mothbox Next package: ${root}`)
    process.exit(1)
  }

  const layout = await resolveCliSourceLayout(root)
  const datasetId = path.basename(root)
  const result = await runDinalabMothboxV1Adapter({
    datasetId,
    archiveSourceTree: false,
    retainPatchesInSource: true,
    packageRelativeSourcePrefix: layout.packageRelativeSourcePrefix,
    packageSourceLayout: layout.packageSourceLayout,
    folderKind: layout.folderKind,
    io: createNodeDinalabAdapterIO({ sourceDir: layout.sourceDir, packageDir: root }),
  })

  console.log(`✅ Adapter complete: ${result.patchCount} patches`)
}

async function resolveCliSourceLayout(root: string): Promise<{
  sourceDir: string
  packageRelativeSourcePrefix: string
  packageSourceLayout: 'archive' | 'in_place'
  folderKind: 'legacy-root' | 'source-only' | 'mothbox-processed' | 'ami' | 'patch-images-only'
}> {
  if (await exists(sourceDir)) {
    const sourceFiles = await findFilesUnder(sourceDir)
    if (sourceFiles.some((file) => file.endsWith('_botdetection.json'))) {
      return {
        sourceDir,
        packageRelativeSourcePrefix: '00_source',
        packageSourceLayout: 'archive',
        folderKind: 'source-only',
      }
    }
    if (sourceFiles.some(isAmiMetadataFileName) && sourceFiles.some(isAmiCropImagePath)) {
      return {
        sourceDir,
        packageRelativeSourcePrefix: '00_source',
        packageSourceLayout: 'archive',
        folderKind: 'ami',
      }
    }
    if (sourceFiles.some(isPatchImageFileName)) {
      return {
        sourceDir,
        packageRelativeSourcePrefix: '00_source',
        packageSourceLayout: 'archive',
        folderKind: 'patch-images-only',
      }
    }
  }

  const rootFiles = await findFilesUnder(root, (relativePath) => !relativePath.startsWith('00_source/'))
  if (rootFiles.some(isMothboxProcessedBotPath)) {
    return {
      sourceDir: root,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
      folderKind: 'mothbox-processed',
    }
  }
  if (rootFiles.some(isAmiMetadataFileName) && rootFiles.some(isAmiCropImagePath)) {
    return {
      sourceDir: root,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
      folderKind: 'ami',
    }
  }
  if (rootFiles.some((file) => file.endsWith('_botdetection.json'))) {
    return {
      sourceDir: root,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
      folderKind: 'legacy-root',
    }
  }
  if (rootFiles.some(isPatchImageFileName)) {
    return {
      sourceDir: root,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
      folderKind: 'patch-images-only',
    }
  }

  console.error(`No supported source files found in ${root}`)
  process.exit(1)
}

async function findFilesUnder(dir: string, include: (relativePath: string) => boolean = () => true): Promise<string[]> {
  const out: string[] = []

  async function walk(current: string, prefix: string) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolutePath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath)
      } else if (include(relativePath)) {
        out.push(relativePath.replaceAll('\\', '/'))
      }
    }
  }

  await walk(dir, '')
  return out
}

function isPatchImageFileName(fileName: string) {
  return /\.(jpg|jpeg|png)$/i.test(fileName)
}

function isMothboxProcessedBotPath(fileName: string) {
  return fileName.replaceAll('\\', '/').split('/').some((part) => part.toLowerCase() === '_processed') &&
    fileName.endsWith('_botdetection.json')
}

function isAmiMetadataFileName(fileName: string) {
  return /\.(parquet|csv)$/i.test(fileName)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
