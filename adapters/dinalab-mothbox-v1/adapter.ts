#!/usr/bin/env bun
/**
 * dinalab-mothbox-v1 — convert legacy Dinalab source tree into a Mothbox Next package.
 *
 * Usage: bun run adapters/dinalab-mothbox-v1/adapter.ts <dataset-folder>
 *
 * Expects <dataset-folder>/00_source/ with night folders, *_botdetection.json, and patches/*.jpg.
 */
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { runDinalabMothboxV1Adapter } from '../../src/features/mothbox-next/adapters/dinalab-mothbox-v1/run-adapter'
import { createNodeDinalabAdapterIO } from '../../src/features/mothbox-next/adapters/dinalab-mothbox-v1/node-adapter-io'

const datasetFolder = process.argv[2]
if (!datasetFolder) {
  console.error('Usage: bun run adapters/dinalab-mothbox-v1/adapter.ts <dataset-folder>')
  process.exit(2)
}

const root = path.resolve(datasetFolder)
const sourceDir = path.join(root, '00_source')

async function main() {
  if (!(await exists(sourceDir))) {
    console.error(`Missing 00_source/ in ${root}`)
    process.exit(1)
  }

  const datasetId = path.basename(root)
  const result = await runDinalabMothboxV1Adapter({
    datasetId,
    archiveSourceTree: false,
    io: createNodeDinalabAdapterIO({ sourceDir, packageDir: root }),
  })

  console.log(`✅ Adapter complete: ${result.patchCount} patches`)
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
