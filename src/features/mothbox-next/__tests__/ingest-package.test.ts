import { describe, expect, it, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadMothboxNextPackageData } from '../load-package-data'
import { hydratePackageEntities } from '../hydration-bridge'
import { detectionsStore } from '~/stores/entities/detections'
import { patchesStore } from '~/stores/entities/5.patches'
import { projectsStore } from '~/stores/entities/1.projects'
import {
  createNodePackageDataAccess,
  fixturePackageRoot,
  walkFixtureFiles,
} from './node-fixture-access'
import { ingestMothboxNextPackageFromIndexedFiles } from '~/features/data-flow/1.ingest/package/ingest-package'

describe('ingestMothboxNextPackage (L3)', () => {
  beforeEach(() => {
    projectsStore.set({})
    patchesStore.set({})
    detectionsStore.set({})
  })

  it('hydrates stores from lightweight fixture', async () => {
    const packageRoot = fixturePackageRoot('04_dinacon_lightweight_substrate')
    const loaded = await loadMothboxNextPackageData({
      packageRoot,
      readManifestText: () => readFile(path.join(packageRoot, 'dataset.json'), 'utf8'),
      access: createNodePackageDataAccess(packageRoot),
    })

    expect(loaded).not.toBeNull()
    expect(loaded?.patches.length).toBe(5)

    const indexedByAssetPath: Record<string, { path: string; name: string; size: number }> = {}
    const walked = await walkFixtureFiles(packageRoot)
    for (const f of walked) {
      if (f.path.startsWith('01_patches/')) {
        indexedByAssetPath[f.path] = f as any
      }
    }

    const hydrated = hydratePackageEntities({
      datasetId: loaded!.manifest.dataset_id,
      patches: loaded!.patches,
      patchSources: loaded!.patchSources,
      deployments: loaded!.deployments,
      cameraDays: loaded!.cameraDays,
      resolvedClassifications: loaded!.resolvedClassifications,
      indexedByAssetPath: indexedByAssetPath as any,
    })

    expect(Object.keys(hydrated.patches)).toHaveLength(5)
    expect(Object.keys(hydrated.detections)).toHaveLength(5)
    for (const patch of Object.values(hydrated.patches)) {
      expect(patch.nightId).toBeTruthy()
      expect(patch.imageFile?.path).toContain('01_patches/')
    }
  })

  it('ingests via indexed file list', async () => {
    const packageRoot = fixturePackageRoot('04_dinacon_lightweight_substrate')
    const walked = await walkFixtureFiles(packageRoot)
    const indexed = await Promise.all(
      walked.map(async (f) => {
        const bytes = await readFile(path.join(packageRoot, f.path))
        const textContent = bytes.toString('utf8')
        return {
          path: f.path,
          name: f.name,
          size: f.size,
          file: { text: async () => textContent } as File,
        }
      }),
    )

    const result = await ingestMothboxNextPackageFromIndexedFiles({ files: indexed as any })
    expect(result.ok).toBe(true)
    expect(Object.keys(patchesStore.get() || {})).toHaveLength(5)
    expect(Object.keys(detectionsStore.get() || {})).toHaveLength(5)
  })
})
