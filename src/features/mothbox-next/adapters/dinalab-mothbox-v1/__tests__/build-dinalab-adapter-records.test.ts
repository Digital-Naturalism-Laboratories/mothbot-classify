import { describe, expect, it } from 'vitest'
import { buildDinalabMothboxV1Records } from '../build-dinalab-adapter-records'
import { buildAmiAdapterRecords } from '../build-ami-adapter-records'
import { buildPatchImagesOnlyRecords } from '../build-patch-images-only-records'
import { runDinalabMothboxV1Adapter } from '../run-adapter'
import { loadMothboxNextPackageData } from '../../../load-package-data'
import type { DinalabAdapterIO } from '../adapter-io'

describe('buildDinalabMothboxV1Records', () => {
  it('uses disambiguated patch ids for matching identified rows', async () => {
    const patchFileName = 'shared_0_Mothbot_last.pt.jpg'
    const missingPatchFileName = 'missing_0_Mothbot_last.pt.jpg'
    const files = new Map<string, string>([
      [
        `Deployment_A/2025-01-01/photo_a_botdetection.json`,
        JSON.stringify({
          shapes: [
            shape({ patchFileName, label: 'ORDER_Lepidoptera' }),
            shape({ patchFileName: missingPatchFileName, label: 'ORDER_Hemiptera' }),
          ],
        }),
      ],
      [
        `Deployment_A/2025-01-01/photo_a_identified.json`,
        JSON.stringify({
          shapes: [
            shape({ patchFileName, label: 'ORDER_Lepidoptera' }),
            shape({ patchFileName: missingPatchFileName, label: 'ORDER_Hemiptera' }),
          ],
        }),
      ],
      [`Deployment_A/2025-01-01/patches/${patchFileName}`, ''],
      [
        `Deployment_A/2025-01-02/photo_b_botdetection.json`,
        JSON.stringify({ shapes: [shape({ patchFileName, label: 'ORDER_Coleoptera' })] }),
      ],
      [
        `Deployment_A/2025-01-02/photo_b_identified.json`,
        JSON.stringify({ shapes: [shape({ patchFileName, label: 'ORDER_Coleoptera' })] }),
      ],
      [`Deployment_A/2025-01-02/patches/${patchFileName}`, ''],
    ])

    const built = await buildDinalabMothboxV1Records({
      datasetId: 'Dataset_A',
      io: createMemoryIo(files),
      humanClassifierId: 'bf',
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
    })

    const patchIds = built.patches.map((patch) => patch.patch_id)
    expect(patchIds).toEqual([
      'shared_0_Mothbot_last.pt',
      'shared_0_Mothbot_last.pt@Deployment_A__2025-01-02',
    ])
    expect(built.botRows.map((row) => row.classifier_id)).toEqual(['last.pt', 'last.pt'])
    expect(built.humanRows.map((row) => row.patch_id)).toEqual(patchIds)
  })

  it('reads Mothbox _processed mirrors without requiring patches subfolders', async () => {
    const patchFileName = 'photo_0_Mothbot_model.pt.jpg'
    const files = new Map<string, string>([
      [
        `_processed/Deployment_A/2025-01-01/photo_botdetection.json`,
        JSON.stringify({
          shapes: [
            shape({
              patchFileName,
              label: 'ORDER_Diptera',
              clusterID: 4.1,
              timestamp_cluster: '2026-04-20__18_49_02_(+0200)',
              direction: 10.5,
              shape_type: 'rotation',
              points: [
                [10, 20],
                [30, 20],
                [30, 50],
                [10, 50],
              ],
            }),
          ],
        }),
      ],
      [`_processed/Deployment_A/2025-01-01/${patchFileName}`, ''],
      [`Deployment_A/2025-01-01/photo.jpg`, ''],
    ])

    const built = await buildDinalabMothboxV1Records({
      datasetId: 'Dataset_A',
      io: createMemoryIo(files),
      humanClassifierId: 'bf',
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
      processedMirrorRoot: '_processed',
    })

    expect(built.patches).toHaveLength(1)
    expect(built.patches[0]).toMatchObject({
      patch_id: 'photo_0_Mothbot_model.pt',
      asset_path: `_processed/Deployment_A/2025-01-01/${patchFileName}`,
      deployment_id: 'Deployment_A',
      camera_day_id: 'Deployment_A__2025-01-01',
      cluster_id: 4.1,
      clustered_at: '2026-04-20__18_49_02_(+0200)',
    })
    expect(built.patchSources[0]).toMatchObject({
      original_bot_detection_path: '_processed/Deployment_A/2025-01-01/photo_botdetection.json',
      original_patch_path: `_processed/Deployment_A/2025-01-01/${patchFileName}`,
      source_photo_asset_path: 'Deployment_A/2025-01-01/photo.jpg',
      crop_direction: 10.5,
      crop_shape_type: 'rotation',
      crop_points: [
        [10, 20],
        [30, 20],
        [30, 50],
        [10, 50],
      ],
    })
  })

  it('links Mothbox _processed patches to the existing source image extension', async () => {
    const patchFileName = 'photo_0_Mothbot_model.pt.jpg'
    const files = new Map<string, string>([
      [
        `_processed/Deployment_A/2025-01-01/photo_botdetection.json`,
        JSON.stringify({ shapes: [shape({ patchFileName, label: 'ORDER_Diptera' })] }),
      ],
      [`_processed/Deployment_A/2025-01-01/${patchFileName}`, ''],
      [`Deployment_A/2025-01-01/photo.jpeg`, ''],
    ])

    const built = await buildDinalabMothboxV1Records({
      datasetId: 'Dataset_A',
      io: createMemoryIo(files),
      humanClassifierId: 'bf',
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
      processedMirrorRoot: '_processed',
    })

    expect(built.patchSources[0]?.source_photo_asset_path).toBe('Deployment_A/2025-01-01/photo.jpeg')
  })

  it('sets Mothbox patch media type from the patch image extension', async () => {
    const patchFileName = 'photo_0_Mothbot_model.pt.png'
    const files = new Map<string, string>([
      [
        `_processed/Deployment_A/2025-01-01/photo_botdetection.json`,
        JSON.stringify({ shapes: [shape({ patchFileName, label: 'ORDER_Diptera' })] }),
      ],
      [`_processed/Deployment_A/2025-01-01/${patchFileName}`, ''],
      [`Deployment_A/2025-01-01/photo.png`, ''],
    ])

    const built = await buildDinalabMothboxV1Records({
      datasetId: 'Dataset_A',
      io: createMemoryIo(files),
      humanClassifierId: 'bf',
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
      processedMirrorRoot: '_processed',
    })

    expect(built.patches[0]?.media_type).toBe('image/png')
  })

  it('honors root-relative patch paths from bot detection shapes', async () => {
    const patchFileName = 'photo_0_Mothbot_model.pt.jpg'
    const rootRelativePatchPath = `dataset/shared-patches/Deployment_A/2025-01-01/${patchFileName}`
    const files = new Map<string, string>([
      [
        `dataset/abms/Deployment_A/2025-01-01/photo_botdetection.json`,
        JSON.stringify({
          shapes: [
            shape({
              patchFileName,
              label: 'ORDER_Diptera',
              patchPath: rootRelativePatchPath,
            }),
          ],
        }),
      ],
      [rootRelativePatchPath, ''],
      [`dataset/abms/Deployment_A/2025-01-01/photo.jpg`, ''],
    ])

    const built = await buildDinalabMothboxV1Records({
      datasetId: 'Dataset_A',
      io: createMemoryIo(files),
      humanClassifierId: 'bf',
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
    })

    expect(built.patches).toHaveLength(1)
    expect(built.patchSources[0]?.original_patch_path).toBe(rootRelativePatchPath)
  })

  it('does not keep stale generated human classifications after a source rerun removes identified rows', async () => {
    const patchFileName = 'photo_0_Mothbot_model.pt.jpg'
    const botDetectionPath = `_processed/Deployment_A/2025-01-01/photo_botdetection.json`
    const identifiedPath = `_processed/Deployment_A/2025-01-01/photo_identified.json`
    const files = new Map<string, string>([
      [botDetectionPath, JSON.stringify({ shapes: [shape({ patchFileName, label: 'ORDER_Diptera' })] })],
      [identifiedPath, JSON.stringify({ shapes: [shape({ patchFileName, label: 'ORDER_Lepidoptera' })] })],
      [`_processed/Deployment_A/2025-01-01/${patchFileName}`, ''],
      [`Deployment_A/2025-01-01/photo.jpg`, ''],
    ])

    const io = createMemoryIo(files)
    const runParams = {
      datasetId: 'Dataset_A',
      io,
      humanClassifierId: 'bf',
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place' as const,
      folderKind: 'mothbox-processed' as const,
    }

    await runDinalabMothboxV1Adapter(runParams)
    files.delete(identifiedPath)
    const result = await runDinalabMothboxV1Adapter(runParams)
    const loaded = await loadMothboxNextPackageData({
      packageRoot: '',
      readManifestText: async () => files.get('dataset.json') ?? '',
      access: {
        readPackageFile: async (relativePath) => files.get(relativePath) ?? '',
        listClassificationFiles: async (classificationsDir) => {
          const prefix = `${classificationsDir.replace(/\/+$/, '')}/`
          return [...files.keys()].filter((path) => path.startsWith(prefix) && path.endsWith('.ndjson')).sort()
        },
      },
    })

    expect(result.humanRowCount).toBe(0)
    expect(loaded?.resolvedClassifications).toEqual([
      expect.objectContaining({
        patch_id: 'photo_0_Mothbot_model.pt',
        classifier_id: 'model.pt',
        classifier_type: 'bot',
        label: 'ORDER_Diptera',
      }),
    ])
  })

  it('clears previous generated human classification files when rerun uses a different classifier id', async () => {
    const patchFileName = 'photo_0_Mothbot_model.pt.jpg'
    const botDetectionPath = `_processed/Deployment_A/2025-01-01/photo_botdetection.json`
    const identifiedPath = `_processed/Deployment_A/2025-01-01/photo_identified.json`
    const files = new Map<string, string>([
      [botDetectionPath, JSON.stringify({ shapes: [shape({ patchFileName, label: 'ORDER_Diptera' })] })],
      [identifiedPath, JSON.stringify({ shapes: [shape({ patchFileName, label: 'ORDER_Lepidoptera' })] })],
      [`_processed/Deployment_A/2025-01-01/${patchFileName}`, ''],
      [`Deployment_A/2025-01-01/photo.jpg`, ''],
    ])

    const io = createMemoryIo(files)
    const runParams = {
      datasetId: 'Dataset_A',
      io,
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place' as const,
      folderKind: 'mothbox-processed' as const,
    }

    await runDinalabMothboxV1Adapter({ ...runParams, humanClassifierId: 'ana' })
    files.delete(identifiedPath)
    const result = await runDinalabMothboxV1Adapter({ ...runParams, humanClassifierId: 'bf' })
    const loaded = await loadMothboxNextPackageData({
      packageRoot: '',
      readManifestText: async () => files.get('dataset.json') ?? '',
      access: {
        readPackageFile: async (relativePath) => files.get(relativePath) ?? '',
        listClassificationFiles: async (classificationsDir) => {
          const prefix = `${classificationsDir.replace(/\/+$/, '')}/`
          return [...files.keys()].filter((path) => path.startsWith(prefix) && path.endsWith('.ndjson')).sort()
        },
      },
    })

    expect(result.humanRowCount).toBe(0)
    expect(files.get('03_classifications/ana.ndjson')).toBe('')
    expect(loaded?.resolvedClassifications).toEqual([
      expect.objectContaining({
        patch_id: 'photo_0_Mothbot_model.pt',
        classifier_id: 'model.pt',
        classifier_type: 'bot',
        label: 'ORDER_Diptera',
      }),
    ])
  })
})

describe('buildAmiAdapterRecords', () => {
  it('builds patches from local AMI processed crops and CSV metadata', async () => {
    const detectionId = '0403014a-ef2b-40ef-bdc1-2d72c55d1b3d'
    const files = new Map<string, string>([
      [
        `snapshot_abms_denmark_2025_toke_special.csv`,
        [
          `"deploymentyear","deploymentcode","timestamp","orderlabel","orderscore","detectionid","cropurl","sourceimageid","x1","x2","y1","y2"`,
          `2025,"F1","2025-05-01 23:19:59+00","Diptera Brachycera","13.27","${detectionId}","https://example.test/abms/2025/_processed/denmark/F1/20250501231959-snapshot_crop_${detectionId}.jpg","source-image-1","10","30","20","50"`,
        ].join('\n'),
      ],
      [`abms/_processed/2025/denmark/F1/20250501231959-snapshot_crop_${detectionId}.jpg`, ''],
      [`abms/2025/denmark/F1/20250501231959-snapshot.jpg`, ''],
    ])

    const built = await buildAmiAdapterRecords({
      datasetId: 'ami_abms',
      io: createMemoryIo(files),
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
    })

    expect(built.patches).toHaveLength(1)
    expect(built.patches[0]).toMatchObject({
      patch_id: detectionId,
      asset_path: `abms/_processed/2025/denmark/F1/20250501231959-snapshot_crop_${detectionId}.jpg`,
      deployment_id: 'abms_denmark_F1_2025',
      camera_day_id: 'abms_denmark_F1_2025__2025-05-01',
      captured_at: '2025-05-01T23:19:59.000Z',
    })
    expect(built.patchSources[0]).toMatchObject({
      patch_id: detectionId,
      source_type: 'ami_crop',
      source_photo_id: 'source-image-1',
      source_photo_asset_path: 'abms/2025/denmark/F1/20250501231959-snapshot.jpg',
      metadata_path: 'snapshot_abms_denmark_2025_toke_special.csv',
      crop_points: [
        [10, 20],
        [30, 20],
        [30, 50],
        [10, 50],
      ],
    })
    expect(built.botRows[0]).toMatchObject({
      patch_id: detectionId,
      classifier_id: 'ami-csv',
      label: 'Diptera Brachycera',
      confidence: 13.27,
    })
    expect(built.deployments[0]).toMatchObject({
      deployment_id: 'abms_denmark_F1_2025',
      site_name_from_folder: 'denmark',
      device_id_from_folder: 'F1',
    })
  })

  it('links AMI crops to source images with the matching image extension', async () => {
    const detectionId = '0403014a-ef2b-40ef-bdc1-2d72c55d1b3d'
    const files = new Map<string, string>([
      [
        `snapshot_abms_denmark_2025_toke_special.csv`,
        [
          `"deploymentyear","deploymentcode","timestamp","orderlabel","orderscore","detectionid","cropurl","sourceimageid"`,
          `2025,"F1","2025-05-01 23:19:59+00","Diptera Brachycera","13.27","${detectionId}","https://example.test/abms/2025/_processed/denmark/F1/20250501231959-snapshot_crop_${detectionId}.png","source-image-1"`,
        ].join('\n'),
      ],
      [`abms/_processed/2025/denmark/F1/20250501231959-snapshot_crop_${detectionId}.png`, ''],
      [`abms/2025/denmark/F1/20250501231959-snapshot.png`, ''],
    ])

    const built = await buildAmiAdapterRecords({
      datasetId: 'ami_abms',
      io: createMemoryIo(files),
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
    })

    expect(built.patches[0]?.media_type).toBe('image/png')
    expect(built.patchSources[0]?.source_photo_asset_path).toBe('abms/2025/denmark/F1/20250501231959-snapshot.png')
  })

  it('builds AMI taxonomy lineage from multiple rank rows for one detection', async () => {
    const detectionId = '0403014a-ef2b-40ef-bdc1-2d72c55d1b3d'
    const cropUrl = `https://example.test/abms/2025/_processed/denmark/F1/20250501231959-snapshot_crop_${detectionId}.jpg`
    const files = new Map<string, string>([
      [
        `snapshot_abms_denmark_2025_toke_special.csv`,
        [
          `"deploymentyear","deploymentcode","timestamp","taxonlevel","label","score","algorithm","detectionid","cropurl","sourceimageid"`,
          `2025,"F1","2025-05-01 23:19:59+00","family","Crambidae","0.80","fastai-species","${detectionId}","${cropUrl}","source-image-1"`,
          `2025,"F1","2025-05-01 23:19:59+00","genus","Agriphila","0.19","fastai-species","${detectionId}","${cropUrl}","source-image-1"`,
          `2025,"F1","2025-05-01 23:19:59+00","species","Agriphila geniculea","0.13","fastai-species","${detectionId}","${cropUrl}","source-image-1"`,
        ].join('\n'),
      ],
      [`abms/_processed/2025/denmark/F1/20250501231959-snapshot_crop_${detectionId}.jpg`, ''],
      [`abms/2025/denmark/F1/20250501231959-snapshot.jpg`, ''],
    ])

    const built = await buildAmiAdapterRecords({
      datasetId: 'ami_abms',
      io: createMemoryIo(files),
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
    })

    expect(built.botRows[0]?.taxon).toMatchObject({
      scientificName: 'Agriphila geniculea',
      family: 'Crambidae',
      genus: 'Agriphila',
      species: 'geniculea',
    })
  })

  it('uses the AMI folder project id when CSV metadata omits projectid', async () => {
    const detectionId = '0403014a-ef2b-40ef-bdc1-2d72c55d1b3d'
    const files = new Map<string, string>([
      [
        `snapshot_custom_denmark_2025.csv`,
        [
          `"deploymentyear","deploymentcode","timestamp","orderlabel","orderscore","detectionid","cropurl","sourceimageid"`,
          `2025,"F1","2025-05-01 23:19:59+00","Diptera Brachycera","13.27","${detectionId}","https://example.test/custom_project/2025/_processed/denmark/F1/20250501231959-snapshot_crop_${detectionId}.jpg","source-image-1"`,
        ].join('\n'),
      ],
      [`custom_project/_processed/2025/denmark/F1/20250501231959-snapshot_crop_${detectionId}.jpg`, ''],
      [`custom_project/2025/denmark/F1/20250501231959-snapshot.jpg`, ''],
    ])

    const built = await buildAmiAdapterRecords({
      datasetId: 'ami_custom',
      io: createMemoryIo(files),
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
    })

    expect(built.deployments[0]?.deployment_id).toBe('custom_project_denmark_F1_2025')
    expect(built.patchSources[0]?.source_metadata?.ami_project_id).toBe('custom_project')
  })
})

describe('buildPatchImagesOnlyRecords', () => {
  it('sets media type from patch image extension', async () => {
    const files = new Map<string, string>([['patches/transparent-wing.png', '']])

    const built = await buildPatchImagesOnlyRecords({
      datasetId: 'Images_Only',
      io: createMemoryIo(files),
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
    })

    expect(built.patches[0]?.media_type).toBe('image/png')
  })

  it('keeps duplicate image basenames from different folders as distinct patches', async () => {
    const files = new Map<string, string>([
      ['Deployment_A/2025-01-01/shared.jpg', ''],
      ['Deployment_A/2025-01-02/shared.jpg', ''],
    ])

    const built = await buildPatchImagesOnlyRecords({
      datasetId: 'Images_Only',
      io: createMemoryIo(files),
      retainPatchesInSource: true,
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
    })

    expect(built.patches).toHaveLength(2)
    expect(new Set(built.patches.map((patch) => patch.patch_id)).size).toBe(2)
    expect(new Set(built.patchSources.map((source) => source.patch_id)).size).toBe(2)
    expect(new Set(built.patchSources.map((source) => source.source_photo_id)).size).toBe(2)
  })
})

function shape(params: {
  patchFileName: string
  label: string
  patchPath?: string
  clusterID?: number
  timestamp_cluster?: string
  direction?: number
  shape_type?: string
  points?: number[][]
}) {
  return {
    patch_path: params.patchPath ?? `patches/${params.patchFileName}`,
    label: params.label,
    score: 0.9,
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Insecta',
    order: params.label.replace(/^ORDER_/, ''),
    clusterID: params.clusterID,
    timestamp_cluster: params.timestamp_cluster,
    direction: params.direction,
    shape_type: params.shape_type,
    points: params.points,
  }
}

function createMemoryIo(files: Map<string, string>): DinalabAdapterIO {
  return {
    source: {
      exists: async (relativePath) => files.has(relativePath),
      readText: async (relativePath) => files.get(relativePath) ?? '',
      readBinary: async (relativePath) => {
        const text = files.get(relativePath) ?? ''
        return new TextEncoder().encode(text).buffer
      },
      findFiles: async (predicate) => [...files.keys()].filter((path) => predicate(path.split('/').pop() ?? path)),
    },
    package: {
      readText: async (relativePath) => files.get(relativePath) ?? '',
      writeText: async (relativePath, text) => {
        files.set(relativePath, text)
      },
      copyFromSource: async () => undefined,
    },
  }
}
