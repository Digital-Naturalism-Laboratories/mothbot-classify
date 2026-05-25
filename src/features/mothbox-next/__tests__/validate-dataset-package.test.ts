import { describe, expect, it } from 'vitest'
import { validateDatasetPackage } from '../validate-dataset-package'
import {
  createNodePackageFileAccess,
  fixturePackageRoot,
} from './node-fixture-access'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

describe('validateDatasetPackage (L0)', () => {
  it('accepts lightweight substrate fixture', async () => {
    const packageRoot = fixturePackageRoot('04_dinacon_lightweight_substrate')
    const result = await validateDatasetPackage({
      packageRoot,
      readManifestText: () => readFile(path.join(packageRoot, 'dataset.json'), 'utf8'),
      files: createNodePackageFileAccess(packageRoot),
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.patchCount).toBe(5)
  })
})
