import { describe, expect, it, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadMothboxNextPackageData } from '../load-package-data'
import { hydratePackageEntities } from '../hydration-bridge'
import { detectionsStore } from '~/stores/entities/detections'
import { patchesStore } from '~/stores/entities/5.patches'
import { photosStore } from '~/stores/entities/photos'
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
      manifest: loaded!.manifest,
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
      expect(patch.leafGroupId).toBeTruthy()
      expect(patch.imageFile?.path).toContain('01_patches/')
    }

    const sourcePhotoPath =
      '00_source/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/hopeCobo_2025_06_22__04_58_06_HDR0.jpg'
    const photoId = 'hopeCobo_2025_06_22__04_58_06_HDR0.jpg'
    const photoFile = { path: sourcePhotoPath, name: 'hopeCobo_2025_06_22__04_58_06_HDR0.jpg', size: 1 }

    const withArchivePhoto = hydratePackageEntities({
      datasetId: loaded!.manifest.dataset_id,
      manifest: loaded!.manifest,
      patches: loaded!.patches,
      patchSources: loaded!.patchSources,
      deployments: loaded!.deployments,
      cameraDays: loaded!.cameraDays,
      resolvedClassifications: loaded!.resolvedClassifications,
      indexedByAssetPath: indexedByAssetPath as any,
      sourceResolutionByPath: { [sourcePhotoPath]: photoFile as any },
      packageRoot: packageRoot,
    })

    expect(withArchivePhoto.photos[photoId]?.imageFile?.path).toBe(sourcePhotoPath)
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

  it('hydrates patch cluster and crop metadata onto detections', () => {
    const hydrated = hydratePackageEntities({
      datasetId: 'clustered-dataset',
      manifest: {
        format: 'mothbox-next-dataset',
        version: 3,
        dataset_id: 'clustered-dataset',
        folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
        records: { patches: '02_records/patches.ndjson' },
      },
      patches: [
        {
          patch_id: 'clustered-patch.pt',
          dataset_id: 'clustered-dataset',
          asset_path: '01_patches/clustered-patch.jpg',
          camera_day_id: 'clustered-dataset__default',
          captured_at: '2025-05-01T23:19:59.000Z',
          cluster_id: 4.1,
        },
      ],
      patchSources: [
        {
          patch_id: 'clustered-patch.pt',
          source_type: 'crop_from_photo',
          source_photo_id: 'source-photo',
          crop_direction: 10.5,
          crop_shape_type: 'rotation',
          crop_points: [
            [10, 20],
            [30, 20],
            [30, 50],
            [10, 50],
          ],
        },
      ],
      deployments: [],
      cameraDays: [{ camera_day_id: 'clustered-dataset__default', night_date: 'default' }],
      resolvedClassifications: [
        {
          patch_id: 'clustered-patch.pt',
          classifier_id: 'mothbot',
          classifier_type: 'bot',
          classification_type: 'taxon',
          label: 'ORDER_Diptera',
          taxon: null,
        },
      ],
      indexedByAssetPath: {},
    })

    expect(hydrated.patches['clustered-patch.pt']?.capturedAt).toBe('2025-05-01T23:19:59.000Z')
    expect(hydrated.detections['clustered-patch.pt']?.clusterId).toBe(4.1)
    expect(hydrated.detections['clustered-patch.pt']?.botClassifierId).toBe('mothbot')
    expect(hydrated.detections['clustered-patch.pt']?.direction).toBe(10.5)
    expect(hydrated.detections['clustered-patch.pt']?.shapeType).toBe('rotation')
    expect(hydrated.detections['clustered-patch.pt']?.points).toEqual([
      [10, 20],
      [30, 20],
      [30, 50],
      [10, 50],
    ])
  })

  it('keeps bot classifier metadata when the current package classification is human', () => {
    const hydrated = hydratePackageEntities({
      datasetId: 'human-reviewed-ami',
      manifest: {
        format: 'mothbox-next-dataset',
        version: 3,
        dataset_id: 'human-reviewed-ami',
        folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
        records: { patches: '02_records/patches.ndjson' },
      },
      patches: [
        {
          patch_id: '11f4a909-1d1f-470b-8d99-9d2f473df1dc',
          dataset_id: 'human-reviewed-ami',
          asset_path: 'abms/_processed/crop.jpg',
          camera_day_id: 'human-reviewed-ami__default',
        },
      ],
      patchSources: [],
      deployments: [],
      cameraDays: [{ camera_day_id: 'human-reviewed-ami__default', night_date: 'default' }],
      resolvedClassifications: [
        {
          patch_id: '11f4a909-1d1f-470b-8d99-9d2f473df1dc',
          classifier_id: 'bf',
          classifier_type: 'human',
          classification_type: 'taxon',
          label: 'Scythris sinensis',
          taxon: null,
        },
      ],
      classificationFiles: [
        {
          path: '03_classifications/_bot.ndjson',
          rows: [
            {
              patch_id: '11f4a909-1d1f-470b-8d99-9d2f473df1dc',
              classifier_id: 'fastai-species',
              classifier_type: 'bot',
              classification_type: 'taxon',
              label: 'Scythris sinensis',
              taxon: null,
              confidence: 0.84,
            },
          ],
        },
      ],
      indexedByAssetPath: {},
    })

    const detection = hydrated.detections['11f4a909-1d1f-470b-8d99-9d2f473df1dc']
    expect(detection?.detectedBy).toBe('user')
    expect(detection?.botClassifierId).toBe('fastai-species')
    expect(detection?.score).toBe(0.84)
  })

  it('uses the current bot metadata when package bot rows are superseded', () => {
    const patchId = 'superseded-bot-row'
    const hydrated = hydratePackageEntities({
      datasetId: 'rerun-bot-dataset',
      manifest: {
        format: 'mothbox-next-dataset',
        version: 3,
        dataset_id: 'rerun-bot-dataset',
        folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
        records: { patches: '02_records/patches.ndjson' },
      },
      patches: [
        {
          patch_id: patchId,
          dataset_id: 'rerun-bot-dataset',
          asset_path: '01_patches/superseded-bot-row.jpg',
          camera_day_id: 'rerun-bot-dataset__default',
        },
      ],
      patchSources: [],
      deployments: [],
      cameraDays: [{ camera_day_id: 'rerun-bot-dataset__default', night_date: 'default' }],
      resolvedClassifications: [
        {
          patch_id: patchId,
          classifier_id: 'new-model.pt',
          classifier_type: 'bot',
          classification_type: 'taxon',
          label: 'ORDER_Diptera',
          taxon: null,
          confidence: 0.91,
          classified_at: 200,
        },
      ],
      classificationFiles: [
        {
          path: '03_classifications/_bot.ndjson',
          rows: [
            {
              patch_id: patchId,
              classifier_id: 'old-model.pt',
              classifier_type: 'bot',
              classification_type: 'taxon',
              label: 'ORDER_Coleoptera',
              taxon: null,
              confidence: 0.12,
              classified_at: 100,
            },
            {
              patch_id: patchId,
              classifier_id: 'new-model.pt',
              classifier_type: 'bot',
              classification_type: 'taxon',
              label: 'ORDER_Diptera',
              taxon: null,
              confidence: 0.91,
              classified_at: 200,
            },
          ],
        },
      ],
      indexedByAssetPath: {},
    })

    const detection = hydrated.detections[patchId]
    expect(detection?.botClassifierId).toBe('new-model.pt')
    expect(detection?.score).toBe(0.91)
  })
})
