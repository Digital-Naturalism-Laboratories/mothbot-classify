import { describe, expect, it } from 'vitest'
import { moveProjectRecords } from '../move-project-records'

const manifest = (id: string) =>
  JSON.stringify({
    format: 'mothbox-next-dataset',
    version: 4,
    datasetID: id,
    folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
    records: { patches: '02_records/patches.ndjson' },
  })
const nd = (rows: object[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
const rows = (text: string | undefined) => (text ?? '').split('\n').filter(Boolean).map((line) => JSON.parse(line))

// Tucson's records: DesertHouse/Cactus moves to Maine (keeping its path); Ditch stays.
const tucson = {
  manifestText: manifest('Tucson'),
  files: {
    '02_records/patches.ndjson': nd([
      { patchID: 'c1', assetPath: 'DesertHouse/Cactus/2026-08-11/c1.jpg', deploymentID: 'DesertHouse~Cactus', cameraDayID: 'DesertHouse~Cactus__2026-08-11' },
      { patchID: 'd1', assetPath: 'DesertHouse/Ditch/2026-08-13/d1.jpg', deploymentID: 'DesertHouse~Ditch', cameraDayID: 'DesertHouse~Ditch__2026-08-13' },
    ]),
    '02_records/patch-sources.ndjson': nd([
      { patchID: 'c1', originalBotDetectionPath: 'DesertHouse/Cactus/2026-08-11/c_botdetection.json' },
      { patchID: 'd1', originalBotDetectionPath: 'DesertHouse/Ditch/2026-08-13/d_botdetection.json' },
    ]),
    '02_records/deployments.ndjson': nd([
      { deploymentID: 'DesertHouse~Cactus', latitude: 32.1 },
      { deploymentID: 'DesertHouse~Ditch', latitude: 32.2 },
    ]),
    '02_records/camera-days.ndjson': nd([
      { cameraDayID: 'DesertHouse~Cactus__2026-08-11', deploymentID: 'DesertHouse~Cactus', nightDate: '2026-08-11' },
      { cameraDayID: 'DesertHouse~Ditch__2026-08-13', deploymentID: 'DesertHouse~Ditch', nightDate: '2026-08-13' },
    ]),
    '03_classifications/aq.ndjson': '{"patchID":"c1","identifierType":"human","label":"Noctuidae"}\n{"patchID":"d1","identifierType":"human","label":"ERROR"}\n',
    '02_records/non-target-categories.ndjson': '{"path":"Error/Glare"}\n',
  },
}

// Maine already has records, and (before the move was applied) its own copy of c1.
const maine = {
  manifestText: manifest('Maine'),
  files: {
    '02_records/patches.ndjson': nd([
      { patchID: 'h1', assetPath: 'Haystack/Tree/2026-07-01/h1.jpg' },
      { patchID: 'c1', assetPath: 'DesertHouse/Cactus/2026-08-11/c1.jpg' },
    ]),
    '02_records/patch-sources.ndjson': nd([
      { patchID: 'h1', originalBotDetectionPath: 'Haystack/Tree/2026-07-01/h_botdetection.json' },
      { patchID: 'c1', originalBotDetectionPath: 'DesertHouse/Cactus/2026-08-11/c_botdetection.json' },
    ]),
    '03_classifications/ab.ndjson': '{"patchID":"h1","identifierType":"human","label":"Geometridae"}\n',
    '03_classifications/_bot.ndjson': nd([{ patchID: 'h1' }, { patchID: 'c1' }]),
  },
}

describe('moveProjectRecords', () => {
  const out = moveProjectRecords({
    giver: tucson,
    receiver: maine,
    receiverName: 'Maine',
    moves: [{ fromFolder: 'DesertHouse/Cactus', toFolder: 'DesertHouse/Cactus' }],
  })

  it('moves the folder’s patches and identifications, and leaves the rest', () => {
    expect(out.movedPatches).toBe(1)
    expect(out.movedHumanLines).toBe(1)
    expect(rows(out.giverFiles['02_records/patches.ndjson']).map((p) => p.patchID)).toEqual(['d1'])
    expect(out.giverFiles['03_classifications/aq.ndjson']).toBe('{"patchID":"d1","identifierType":"human","label":"ERROR"}\n')
    expect(out.receiver.files['03_classifications/aq.ndjson']).toBe('{"patchID":"c1","identifierType":"human","label":"Noctuidae"}\n')
    expect(out.receiver.files['03_classifications/ab.ndjson']).toContain('"h1"')
    expect(out.giverEmpty).toBe(false)
  })

  it('replaces the receiver’s own copy of a moved patch instead of doubling it', () => {
    const patches = rows(out.receiver.files['02_records/patches.ndjson'])
    expect(patches.map((p) => p.patchID).sort()).toEqual(['c1', 'h1'])
    expect(rows(out.receiver.files['03_classifications/_bot.ndjson']).map((r) => r.patchID)).toEqual(['h1'])
  })

  it('names the moved deployment in its new project and carries its details', () => {
    const deployments = rows(out.receiver.files['02_records/deployments.ndjson'])
    expect(deployments.find((d) => d.deploymentID === 'DesertHouse~Cactus')?.latitude).toBe(32.1)
    expect(rows(out.giverFiles['02_records/deployments.ndjson']).map((d) => d.deploymentID)).toEqual(['DesertHouse~Ditch'])
    expect(JSON.parse(out.receiver.manifestText).datasetID).toBe('Maine')
  })

  it('keeps project-wide lists in both projects', () => {
    expect(out.giverFiles['02_records/non-target-categories.ndjson']).toBe('{"path":"Error/Glare"}\n')
    expect(out.receiver.files['02_records/non-target-categories.ndjson']).toBe('{"path":"Error/Glare"}\n')
  })

  it('splits a folder off into a new project at its top, and empties the giver when nothing is left', () => {
    const split = moveProjectRecords({
      giver: tucson,
      receiver: null,
      receiverName: 'DesertHouse',
      moves: [{ fromFolder: 'DesertHouse', toFolder: '' }],
    })
    expect(split.giverEmpty).toBe(true)
    const patches = rows(split.receiver.files['02_records/patches.ndjson'])
    expect(patches.map((p) => [p.assetPath, p.deploymentID])).toEqual([
      ['Cactus/2026-08-11/c1.jpg', 'Cactus'],
      ['Ditch/2026-08-13/d1.jpg', 'Ditch'],
    ])
    expect(rows(split.receiver.files['02_records/deployments.ndjson']).map((d) => [d.deploymentID, d.latitude])).toEqual([
      ['Cactus', 32.1],
      ['Ditch', 32.2],
    ])
  })
})
