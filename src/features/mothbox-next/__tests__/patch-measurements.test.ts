import { describe, expect, it } from 'vitest'
import type { DinalabAdapterIO } from '../adapters/dinalab-mothbox-v1/adapter-io'
import {
  measurementChange,
  measurementFromShape,
  mergeMeasurement,
  parsePatchMeasurements,
  PATCH_MEASUREMENTS_RECORD,
} from '../patch-measurements'
import {
  archivedDetectionPath,
  findPatchesToMeasure,
  readMeasurementsFromDetections,
  toSourceRelative,
  upsertPatchMeasurements,
} from '../refresh-patch-measurements'

const ndjson = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'

function memoryIO(files: Record<string, string>): DinalabAdapterIO & { files: Record<string, string> } {
  const read = async (p: string) => {
    if (!(p in files)) throw new Error(`missing ${p}`)
    return files[p]
  }
  return {
    files,
    source: { exists: async (p) => p in files, readText: read, readBinary: async () => new ArrayBuffer(0), findFiles: async () => [] },
    package: { readText: read, writeText: async (p, t) => void (files[p] = t), copyFromSource: async () => {} },
  }
}

describe('measurementFromShape', () => {
  it('reads blur score and method', () => {
    expect(measurementFromShape({ patchId: 'p', shape: { blur_score: 42.5, blur_method: 'crete-roffet-2007/v1' } })).toEqual({
      patch_id: 'p',
      blur_score: 42.5,
      blur_method: 'crete-roffet-2007/v1',
    })
  })
  it('returns null for unscored shapes', () => {
    expect(measurementFromShape({ patchId: 'p', shape: {} })).toBeNull()
    expect(measurementFromShape({ patchId: 'p', shape: { blur_score: 'x' } })).toBeNull()
  })
  it('reads pixel mass, with mm² null when the night was not calibrated', () => {
    expect(
      measurementFromShape({
        patchId: 'p',
        shape: { pixel_mass_pixels: 812, pixel_mass_method: 'border-colour-mask/v1', timestamp_pixel_mass: '2026-10-01__06_00_00_(+0200)' },
      }),
    ).toEqual({
      patch_id: 'p',
      pixel_mass_pixels: 812,
      pixel_mass_mm2: null,
      pixel_mass_method: 'border-colour-mask/v1',
    })
    expect(measurementFromShape({ patchId: 'p', shape: { blur_score: 3, pixel_mass_pixels: 10, pixel_mass_mm2: 0.1 } })).toEqual({
      patch_id: 'p',
      blur_score: 3,
      pixel_mass_pixels: 10,
      pixel_mass_mm2: 0.1,
    })
  })
})

describe('measurementChange / mergeMeasurement', () => {
  const blurOnly = { patch_id: 'p', blur_score: 40, blur_method: 'm1' }
  it('adds pixel mass next to an existing blur score', () => {
    const fresh = { patch_id: 'p', blur_score: 40, blur_method: 'm1', pixel_mass_pixels: 500, pixel_mass_mm2: 2 }
    const change = measurementChange(blurOnly, fresh)
    expect(change).toEqual({ pixelMass: 'added' })
    expect(mergeMeasurement({ current: blurOnly, fresh, change })).toEqual({ ...blurOnly, pixel_mass_pixels: 500, pixel_mass_mm2: 2 })
  })
  it('ignores a pixel mass re-run with the same result, but not a new method or count', () => {
    const current = { patch_id: 'p', pixel_mass_pixels: 500, pixel_mass_mm2: null, pixel_mass_method: 'a' }
    expect(measurementChange(current, { ...current })).toEqual({})
    expect(measurementChange(current, { ...current, pixel_mass_method: 'b' })).toEqual({ pixelMass: 'updated' })
    expect(measurementChange(current, { ...current, pixel_mass_pixels: 501 })).toEqual({ pixelMass: 'updated' })
  })
  it('keeps the package blur score when only pixel mass changed', () => {
    const current = { ...blurOnly, pixel_mass_pixels: 1 }
    const fresh = { patch_id: 'p', blur_score: 99, blur_method: 'm1', pixel_mass_pixels: 2, pixel_mass_mm2: null }
    const change = measurementChange(current, fresh)
    expect(change).toEqual({ pixelMass: 'updated' })
    expect(mergeMeasurement({ current, fresh, change }).blur_score).toBe(40)
  })
})

describe('parsePatchMeasurements', () => {
  it('keys by patch id and skips malformed lines', () => {
    const parsed = parsePatchMeasurements('{"patch_id":"a","blur_score":1}\nnot json\n\n{"patch_id":"b","blur_score":2}\n')
    expect(Object.keys(parsed)).toEqual(['a', 'b'])
    expect(parsed.b.blur_score).toBe(2)
  })
})

describe('path helpers', () => {
  it('toSourceRelative inverts the package source prefix', () => {
    expect(toSourceRelative('n1/x_botdetection.json', '')).toBe('n1/x_botdetection.json')
    expect(toSourceRelative('archive/n1/x_botdetection.json', 'archive')).toBe('n1/x_botdetection.json')
  })
  it('archivedDetectionPath matches Process naming (<photo>_botdetection_<model without .pt>.json)', () => {
    expect(archivedDetectionPath('n1/IMG_botdetection.json', 'Mothbot_MBD-0-2.pt')).toBe('n1/IMG_botdetection_Mothbot_MBD-0-2.json')
    expect(archivedDetectionPath('n1/IMG_humandetection.json', 'HumanDetection')).toBeNull()
  })
})

describe('importing blur scores into an existing package', () => {
  function packageWithTwoRuns() {
    return memoryIO({
      '02_records/patches.ndjson': ndjson([
        { patch_id: 'IMG_0_Mothbot_MBD-1-1.pt', detector_id: 'Mothbot_MBD-1-1.pt' },
        { patch_id: 'IMG_0_Mothbot_MBD-0-2.pt', detector_id: 'Mothbot_MBD-0-2.pt' },
        { patch_id: 'IMG_1_Mothbot_MBD-1-1.pt', detector_id: 'Mothbot_MBD-1-1.pt' },
      ]),
      '02_records/patch-sources.ndjson': ndjson([
        { patch_id: 'IMG_0_Mothbot_MBD-1-1.pt', original_bot_detection_path: 'n1/IMG_botdetection.json', original_patch_path: 'n1/IMG_0_Mothbot_MBD-1-1.pt.jpg' },
        // older run: patch-sources still points at the CURRENT json; its shapes live in the archive
        { patch_id: 'IMG_0_Mothbot_MBD-0-2.pt', original_bot_detection_path: 'n1/IMG_botdetection.json', original_patch_path: 'n1/IMG_0_Mothbot_MBD-0-2.pt.jpg' },
        { patch_id: 'IMG_1_Mothbot_MBD-1-1.pt', original_bot_detection_path: 'n1/IMG_botdetection.json', original_patch_path: 'n1/IMG_1_Mothbot_MBD-1-1.pt.jpg' },
      ]),
      '02_records/current-classifications.ndjson': ndjson([{ patch_id: 'IMG_0_Mothbot_MBD-1-1.pt', label: 'human id' }]),
      'n1/IMG_botdetection.json': JSON.stringify({
        shapes: [
          { patch_path: 'IMG_0_Mothbot_MBD-1-1.pt.jpg', blur_score: 12 },
          { patch_path: 'IMG_1_Mothbot_MBD-1-1.pt.jpg' }, // not scored yet
        ],
      }),
      'n1/IMG_botdetection_Mothbot_MBD-0-2.json': JSON.stringify({
        shapes: [{ patch_path: 'IMG_0_Mothbot_MBD-0-2.pt.jpg', blur_score: 77 }],
      }),
    })
  }

  it('imports current and archived-run scores, skips unscored, and is idempotent', async () => {
    const io = packageWithTwoRuns()
    const before = io.files['02_records/current-classifications.ndjson']
    const pending = await findPatchesToMeasure(io)
    const updates = await readMeasurementsFromDetections({ io, pendingByJson: pending, sourcePrefix: '' })
    expect(updates.map((u) => [u.row.patch_id, u.row.blur_score, u.change.blur]).sort()).toEqual([
      ['IMG_0_Mothbot_MBD-0-2.pt', 77, 'added'],
      ['IMG_0_Mothbot_MBD-1-1.pt', 12, 'added'],
    ])
    const rows = updates.map((u) => u.row)
    expect(await upsertPatchMeasurements(io, rows)).toBe(2)
    expect(await upsertPatchMeasurements(io, rows)).toBe(0)
    // only the measurements file was written
    expect(io.files['02_records/current-classifications.ndjson']).toBe(before)
    expect(Object.keys(parsePatchMeasurements(io.files[PATCH_MEASUREMENTS_RECORD])).sort()).toEqual([
      'IMG_0_Mothbot_MBD-0-2.pt',
      'IMG_0_Mothbot_MBD-1-1.pt',
    ])
    // nothing new on a second look
    const again = await readMeasurementsFromDetections({ io, pendingByJson: await findPatchesToMeasure(io), sourcePrefix: '' })
    expect(again).toEqual([])
  })

  it('survives a missing detection JSON', async () => {
    const io = packageWithTwoRuns()
    delete io.files['n1/IMG_botdetection.json']
    delete io.files['n1/IMG_botdetection_Mothbot_MBD-0-2.json']
    const pending = await findPatchesToMeasure(io)
    expect(await readMeasurementsFromDetections({ io, pendingByJson: pending, sourcePrefix: '' })).toEqual([])
  })
})

describe('re-scoring with a newer method', () => {
  function scoredPackage(params: { packageMethod?: string; jsonMethod?: string; jsonScore: number }) {
    const row = { patch_id: 'IMG_0', blur_score: 40, ...(params.packageMethod ? { blur_method: params.packageMethod } : {}) }
    return memoryIO({
      '02_records/patches.ndjson': ndjson([{ patch_id: 'IMG_0', detector_id: 'Mothbot_MBD-1-1.pt' }]),
      '02_records/patch-sources.ndjson': ndjson([
        { patch_id: 'IMG_0', original_bot_detection_path: 'n1/IMG_botdetection.json', original_patch_path: 'n1/IMG_0.jpg' },
      ]),
      [PATCH_MEASUREMENTS_RECORD]: ndjson([row]),
      'n1/IMG_botdetection.json': JSON.stringify({
        shapes: [{ patch_path: 'IMG_0.jpg', blur_score: params.jsonScore, ...(params.jsonMethod ? { blur_method: params.jsonMethod } : {}) }],
      }),
    })
  }
  async function probe(io: ReturnType<typeof memoryIO>) {
    const pendingByJson = await findPatchesToMeasure(io)
    return readMeasurementsFromDetections({ io, pendingByJson, sourcePrefix: '' })
  }

  it('pending patches carry the measurements the package already has', async () => {
    const io = scoredPackage({ packageMethod: 'old', jsonMethod: 'new', jsonScore: 80 })
    expect([...(await findPatchesToMeasure(io)).values()].flat()[0].current).toEqual({ patch_id: 'IMG_0', blur_score: 40, blur_method: 'old' })
  })

  it('replaces scores from an older method', async () => {
    const io = scoredPackage({ packageMethod: 'old', jsonMethod: 'new', jsonScore: 80 })
    const updates = await probe(io)
    expect(updates).toEqual([{ row: { patch_id: 'IMG_0', blur_score: 80, blur_method: 'new' }, change: { blur: 'updated' } }])
    expect(await upsertPatchMeasurements(io, updates.map((u) => u.row))).toBe(1)
    expect(parsePatchMeasurements(io.files[PATCH_MEASUREMENTS_RECORD]).IMG_0).toEqual(updates[0].row)
    expect(await probe(io)).toEqual([]) // now up to date
  })

  it('offers nothing when the method is unchanged, even if no method was ever recorded', async () => {
    expect(await probe(scoredPackage({ packageMethod: 'same', jsonMethod: 'same', jsonScore: 40 }))).toEqual([])
    expect(await probe(scoredPackage({ jsonScore: 40 }))).toEqual([])
  })
})

describe('importing pixel mass that Process measured later', () => {
  it('adds pixel mass to scored patches, then picks up a re-run with another method', async () => {
    const shape = (method: string, pixels: number) => ({
      patch_path: 'IMG_0.jpg',
      blur_score: 40,
      blur_method: 'm1',
      pixel_mass_pixels: pixels,
      pixel_mass_mm2: pixels / 100,
      pixel_mass_method: method,
      timestamp_pixel_mass: '2026-10-01__06_00_00_(+0200)',
    })
    const io = memoryIO({
      '02_records/patches.ndjson': ndjson([{ patch_id: 'IMG_0' }]),
      '02_records/patch-sources.ndjson': ndjson([
        { patch_id: 'IMG_0', original_bot_detection_path: 'n1/IMG_botdetection.json', original_patch_path: 'n1/IMG_0.jpg' },
      ]),
      [PATCH_MEASUREMENTS_RECORD]: ndjson([{ patch_id: 'IMG_0', blur_score: 40, blur_method: 'm1' }]),
      'n1/IMG_botdetection.json': JSON.stringify({ shapes: [shape('border-colour-mask/v1', 700)] }),
    })
    const probe = async () => readMeasurementsFromDetections({ io, pendingByJson: await findPatchesToMeasure(io), sourcePrefix: '' })

    const first = await probe()
    expect(first.map((u) => u.change)).toEqual([{ pixelMass: 'added' }])
    expect(await upsertPatchMeasurements(io, first.map((u) => u.row))).toBe(1)
    expect(parsePatchMeasurements(io.files[PATCH_MEASUREMENTS_RECORD]).IMG_0).toMatchObject({
      blur_score: 40,
      pixel_mass_pixels: 700,
      pixel_mass_mm2: 7,
      pixel_mass_method: 'border-colour-mask/v1',
    })
    expect(await probe()).toEqual([])

    io.files['n1/IMG_botdetection.json'] = JSON.stringify({ shapes: [shape('birefnet-general-lite', 520)] })
    const second = await probe()
    expect(second.map((u) => u.change)).toEqual([{ pixelMass: 'updated' }])
    expect(second[0].row).toMatchObject({ blur_score: 40, pixel_mass_pixels: 520, pixel_mass_method: 'birefnet-general-lite' })
  })

  it('the quick probe looks at every night folder, so one measured night is noticed', async () => {
    const sources: object[] = []
    const files: Record<string, string> = {}
    for (let i = 0; i < 20; i++) {
      sources.push({ patch_id: `A${i}`, original_bot_detection_path: `n1/A${i}_botdetection.json`, original_patch_path: `n1/A${i}.jpg` })
      files[`n1/A${i}_botdetection.json`] = JSON.stringify({ shapes: [{ patch_path: `A${i}.jpg` }] })
    }
    sources.push({ patch_id: 'B0', original_bot_detection_path: 'n2/B0_botdetection.json', original_patch_path: 'n2/B0.jpg' })
    files['n2/B0_botdetection.json'] = JSON.stringify({ shapes: [{ patch_path: 'B0.jpg', pixel_mass_pixels: 9 }] })
    const io = memoryIO({ ...files, '02_records/patch-sources.ndjson': ndjson(sources) })
    const sample = await readMeasurementsFromDetections({ io, pendingByJson: await findPatchesToMeasure(io), sourcePrefix: '', sampleFiles: 4 })
    expect(sample.map((u) => u.row.patch_id)).toEqual(['B0'])
  })
})
