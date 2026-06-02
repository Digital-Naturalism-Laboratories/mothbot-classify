import { describe, expect, it } from 'vitest'
import { buildDinalabMothboxV1Records } from '../build-dinalab-adapter-records'
import { buildAmiAdapterRecords } from '../build-ami-adapter-records'
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
    expect(built.humanRows.map((row) => row.patch_id)).toEqual(patchIds)
  })

  it('reads Mothbox _processed mirrors without requiring patches subfolders', async () => {
    const patchFileName = 'photo_0_Mothbot_model.pt.jpg'
    const files = new Map<string, string>([
      [
        `_processed/Deployment_A/2025-01-01/photo_botdetection.json`,
        JSON.stringify({ shapes: [shape({ patchFileName, label: 'ORDER_Diptera' })] }),
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
    })
    expect(built.patchSources[0]).toMatchObject({
      original_bot_detection_path: '_processed/Deployment_A/2025-01-01/photo_botdetection.json',
      original_patch_path: `_processed/Deployment_A/2025-01-01/${patchFileName}`,
      source_photo_asset_path: 'Deployment_A/2025-01-01/photo.jpg',
    })
  })
})

describe('buildAmiAdapterRecords', () => {
  it('builds patches from local AMI processed crops and CSV metadata', async () => {
    const detectionId = '0403014a-ef2b-40ef-bdc1-2d72c55d1b3d'
    const files = new Map<string, string>([
      [
        `snapshot_abms_denmark_2025_toke_special.csv`,
        [
          `"deploymentyear","deploymentcode","timestamp","orderlabel","orderscore","detectionid","cropurl","sourceimageid"`,
          `2025,"F1","2025-05-01 23:19:59+00","Diptera Brachycera","13.27","${detectionId}","https://example.test/abms/2025/_processed/denmark/F1/20250501231959-snapshot_crop_${detectionId}.jpg","source-image-1"`,
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
})

function shape(params: { patchFileName: string; label: string }) {
  return {
    patch_path: `patches/${params.patchFileName}`,
    label: params.label,
    score: 0.9,
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Insecta',
    order: params.label.replace(/^ORDER_/, ''),
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
      writeText: async () => undefined,
      copyFromSource: async () => undefined,
    },
  }
}
