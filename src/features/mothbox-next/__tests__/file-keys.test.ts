import { describe, expect, it } from 'vitest'
import {
  camelToSnake,
  convertNdjsonTextToCamelCase,
  fromFileKeys,
  manifestFromFile,
  manifestToFile,
  snakeToCamel,
  toFileKeys,
} from '../file-keys'
import { parseClassificationRecords, parsePatchRecords } from '../parse-package-records'
import { parseDatasetManifest } from '../dataset-manifest'
import { appendNdjsonRowsByKey } from '../incremental-nights'
import type { ClassificationRecord } from '../records'

const humanRow: ClassificationRecord = {
  patch_id: 'p1',
  occurrence_id: 'p1',
  identification_id: 'id-1',
  classifier_id: 'aq',
  classifier_type: 'human',
  identifier_name: 'A. Quitmeyer',
  classification_type: 'error',
  label: 'NON_TARGET/Error/Blur',
  taxon: { scientificName: 'x', taxonID: 'B6L67', taxonIDSource: 'col' },
  morphospecies: null,
  is_error: true,
  confidence: 0.5,
  classified_at: 100,
  species_list: 'https://doi.org/10.15468/dl.x',
  pixel_mass_mm2: 1.2,
}

describe('package file field names', () => {
  it('converts names the Darwin Core way, with the ontology’s renames', () => {
    expect(snakeToCamel('camera_day_id')).toBe('cameraDayID')
    expect(snakeToCamel('pixel_mass_mm2')).toBe('pixelMassMm2')
    expect(snakeToCamel('classifier_type')).toBe('identifierType')
    expect(snakeToCamel('label')).toBe('label')
    expect(camelToSnake('cameraDayID')).toBe('camera_day_id')
    expect(camelToSnake('identificationScore')).toBe('confidence')
    expect(camelToSnake('patch_id')).toBe('patch_id')
  })

  it('round-trips a classification row, values included, without touching nested objects', () => {
    const file = toFileKeys(humanRow as unknown as Record<string, unknown>)
    expect(file).toMatchObject({
      patchID: 'p1',
      identificationID: 'id-1',
      identifierType: 'human',
      identifierID: 'aq',
      identifierName: 'A. Quitmeyer',
      classificationType: 'nonTarget',
      isNonTarget: true,
      identificationScore: 0.5,
      identifiedAt: 100,
      taxaList: 'https://doi.org/10.15468/dl.x',
      taxon: { scientificName: 'x', taxonID: 'B6L67', taxonIDSource: 'col' },
    })
    expect(fromFileKeys(file)).toEqual(humanRow)
    expect(toFileKeys({ classifier_type: 'bot' }).identifierType).toBe('machine')
  })

  it('reads camelCase and snake_case files alike', () => {
    const snake = JSON.stringify(humanRow)
    const camel = convertNdjsonTextToCamelCase(`${snake}\nnot json\n`)
    // Lines that aren't JSON objects are kept exactly as they are.
    expect(camel.split('\n')[1]).toBe('not json')
    const camelRow = camel.split('\n')[0]!
    expect(camelRow).toContain('"identifierType":"human"')
    expect(parseClassificationRecords(camelRow)).toEqual(parseClassificationRecords(snake))
    expect(parsePatchRecords('{"patchID":"p1","datasetID":"d","assetPath":"a.jpg","cameraDayID":"D__2026-01-01"}')).toEqual([
      { patch_id: 'p1', dataset_id: 'd', asset_path: 'a.jpg', camera_day_id: 'D__2026-01-01' },
    ])
  })

  it('appends by key without duplicating rows written in the other style', () => {
    const existing = '{"patchID":"p1","datasetID":"d","assetPath":"a.jpg"}\n'
    const merged = appendNdjsonRowsByKey({
      existingText: existing,
      additions: [{ patch_id: 'p1' }, { patch_id: 'p2' }],
      key: 'patch_id',
    })
    expect(merged.addedCount).toBe(1)
  })

  it('reads a camelCase dataset.json and refuses a newer format', () => {
    const manifest = {
      format: 'mothbox-next-dataset',
      version: 3,
      dataset_id: 'd1',
      folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
      records: { patches: '02_records/patches.ndjson', current_classifications: '02_records/current-classifications.ndjson' },
    }
    const camel = manifestToFile(manifest)
    expect(camel).toMatchObject({ datasetID: 'd1', records: { currentClassifications: '02_records/current-classifications.ndjson' } })
    expect(manifestFromFile(camel)).toEqual(manifest)
    expect(parseDatasetManifest({ ...camel, version: 4 })?.dataset_id).toBe('d1')
    expect(parseDatasetManifest({ ...manifest, version: 5 })).toBeNull()
  })
})
