import { describe, expect, it } from 'vitest'
import { hydratePackageEntities } from '../hydration-bridge'
import type { PatchMeasurementRecord } from '../patch-measurements'
import type { ClassificationRecord } from '../records'

const botRow: ClassificationRecord = {
  patch_id: 'p1',
  classifier_id: 'mothbot',
  classifier_type: 'bot',
  classification_type: 'taxon',
  label: 'Lepidoptera',
  pixel_mass_pixels: 500,
  pixel_mass_mm2: 1.5,
  pixel_mass_method: 'birefnet-general-lite',
}
const humanRow: ClassificationRecord = {
  patch_id: 'p1',
  classifier_id: 'andrew',
  classifier_type: 'human',
  classification_type: 'taxon',
  label: 'Noctuidae',
  classified_at: 1_700_000_000_000,
}

function hydrate(params: { resolved: ClassificationRecord; measurement?: PatchMeasurementRecord }) {
  return hydratePackageEntities({
    datasetId: 'D',
    manifest: {
      format: 'mothbox-next-dataset',
      version: 3,
      dataset_id: 'D',
      folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
      records: {
        patches: '02_records/patches.ndjson',
        deployments: '02_records/deployments.ndjson',
        camera_days: '02_records/camera-days.ndjson',
      },
    },
    patches: [{ patch_id: 'p1', dataset_id: 'D', asset_path: '01_patches/p1.jpg', deployment_id: 'dep', camera_day_id: 'cd' }],
    deployments: [{ deployment_id: 'dep' }],
    cameraDays: [{ camera_day_id: 'cd', deployment_id: 'dep', night_date: '2026-06-24' }],
    resolvedClassifications: [params.resolved],
    classificationFiles: [{ path: '03_classifications/mothbot.ndjson', rows: [botRow] }],
    ...(params.measurement ? { measurements: { p1: params.measurement } } : {}),
    indexedByAssetPath: {},
  }).detections.p1
}

describe('pixel mass on hydrated detections', () => {
  it('a patch identified by a person keeps the pixel mass from the bot row', () => {
    const detection = hydrate({ resolved: humanRow })
    expect(detection.label).toBe('Noctuidae')
    expect(detection).toMatchObject({ pixelMassPixels: 500, pixelMassMm2: 1.5, pixelMassMethod: 'birefnet-general-lite' })
  })

  it('pixel mass imported from Process later wins over the value from the original ingest', () => {
    const detection = hydrate({
      resolved: botRow,
      measurement: { patch_id: 'p1', pixel_mass_pixels: 640, pixel_mass_mm2: null, pixel_mass_method: 'border-colour-mask/v1' },
    })
    expect(detection).toMatchObject({ pixelMassPixels: 640, pixelMassMm2: null, pixelMassMethod: 'border-colour-mask/v1' })
  })
})
