import { describe, expect, it } from 'vitest'
import type { DinalabAdapterIO } from '../adapters/dinalab-mothbox-v1/adapter-io'
import { measurementFromShape, parsePatchMeasurements, PATCH_MEASUREMENTS_RECORD } from '../patch-measurements'
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
    const rows = await readMeasurementsFromDetections({ io, pendingByJson: pending, sourcePrefix: '' })
    expect(rows.map((r) => [r.patch_id, r.blur_score]).sort()).toEqual([
      ['IMG_0_Mothbot_MBD-0-2.pt', 77],
      ['IMG_0_Mothbot_MBD-1-1.pt', 12],
    ])
    expect(await upsertPatchMeasurements(io, rows)).toBe(2)
    expect(await upsertPatchMeasurements(io, rows)).toBe(0)
    // only the measurements file was written
    expect(io.files['02_records/current-classifications.ndjson']).toBe(before)
    expect(Object.keys(parsePatchMeasurements(io.files[PATCH_MEASUREMENTS_RECORD])).sort()).toEqual([
      'IMG_0_Mothbot_MBD-0-2.pt',
      'IMG_0_Mothbot_MBD-1-1.pt',
    ])
    // already-scored patches are no longer pending
    const left = await findPatchesToMeasure(io)
    expect([...left.values()].flat().map((p) => p.patchId)).toEqual(['IMG_1_Mothbot_MBD-1-1.pt'])
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
    const pendingByJson = await findPatchesToMeasure(io, { includeScored: true })
    return readMeasurementsFromDetections({ io, pendingByJson, sourcePrefix: '' })
  }

  it('scored patches are only pending when asked for', async () => {
    const io = scoredPackage({ packageMethod: 'old', jsonMethod: 'new', jsonScore: 80 })
    expect((await findPatchesToMeasure(io)).size).toBe(0)
    expect([...(await findPatchesToMeasure(io, { includeScored: true })).values()].flat()[0].currentMethod).toBe('old')
  })

  it('replaces scores from an older method', async () => {
    const io = scoredPackage({ packageMethod: 'old', jsonMethod: 'new', jsonScore: 80 })
    const rows = await probe(io)
    expect(rows).toEqual([{ patch_id: 'IMG_0', blur_score: 80, blur_method: 'new' }])
    expect(await upsertPatchMeasurements(io, rows)).toBe(1)
    expect(parsePatchMeasurements(io.files[PATCH_MEASUREMENTS_RECORD]).IMG_0).toEqual(rows[0])
    expect(await probe(io)).toEqual([]) // now up to date
  })

  it('offers nothing when the method is unchanged, even if no method was ever recorded', async () => {
    expect(await probe(scoredPackage({ packageMethod: 'same', jsonMethod: 'same', jsonScore: 40 }))).toEqual([])
    expect(await probe(scoredPackage({ jsonScore: 40 }))).toEqual([])
  })
})
