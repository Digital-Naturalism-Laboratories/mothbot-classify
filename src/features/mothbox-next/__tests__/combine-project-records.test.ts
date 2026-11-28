import { describe, expect, it } from 'vitest'
import { combineProjectRecords, type SubPackageRecords } from '../combine-project-records'

const manifest = (id: string, sources: string[]) =>
  JSON.stringify({
    format: 'mothbox-next-dataset',
    version: 4,
    datasetID: id,
    folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
    records: { patches: '02_records/patches.ndjson' },
    classificationSources: sources,
  })
const nd = (rows: object[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n'

// Tucson/_processed/DesertHouse: deployments Cactus and Ditch (Process's usual depth).
const desertHouse: SubPackageRecords = {
  folder: 'DesertHouse',
  manifestText: manifest('DesertHouse', ['03_classifications/_bot.ndjson', '03_classifications/aq.ndjson']),
  files: {
    '02_records/patches.ndjson': nd([
      { patchID: 'c1', datasetID: 'DesertHouse', assetPath: 'Cactus/2026-08-11/c1.jpg', deploymentID: 'Cactus', cameraDayID: 'Cactus__2026-08-11', sessionID: 'Cactus__2026-08-11' },
      { patchID: 'd1', datasetID: 'DesertHouse', assetPath: 'Ditch/2026-08-13/d1.jpg', deploymentID: 'Ditch', cameraDayID: 'Ditch__2026-08-13' },
    ]),
    '02_records/patch-sources.ndjson': nd([
      { patchID: 'c1', sourceType: 'crop_from_photo', sourcePhotoAssetPath: 'Cactus/2026-08-11/c.jpg', originalBotDetectionPath: 'Cactus/2026-08-11/c_botdetection.json', originalPatchPath: 'Cactus/2026-08-11/c1.jpg' },
      { patchID: 'd1', sourceType: 'crop_from_photo', sourcePhotoAssetPath: 'Ditch/2026-08-13/d.jpg', originalBotDetectionPath: 'Ditch/2026-08-13/d_botdetection.json', originalPatchPath: 'Ditch/2026-08-13/d1.jpg' },
    ]),
    '02_records/deployments.ndjson': nd([
      { deploymentID: 'Cactus', siteID: 'DesertHouse/site/Cactus', latitude: 32.1 },
      { deploymentID: 'Ditch', siteID: 'DesertHouse/site/Ditch' },
    ]),
    '02_records/camera-days.ndjson': nd([
      { cameraDayID: 'Cactus__2026-08-11', deploymentID: 'Cactus', nightDate: '2026-08-11' },
      { cameraDayID: 'Ditch__2026-08-13', deploymentID: 'Ditch', nightDate: '2026-08-13' },
    ]),
    '02_records/sessions.ndjson': nd([{ sessionID: 'Cactus__2026-08-11', deploymentID: 'Cactus', captureWindows: [] }]),
    '02_records/current-classifications.ndjson': nd([{ patchID: 'c1', identifierType: 'human', label: 'ERROR_Blur' }]),
    '03_classifications/aq.ndjson': '{"patchID":"c1","identifierID":"aq","identifierType":"human","label":"ERROR_Blur","identifiedAt":1786553019736}\n',
    '03_classifications/_bot.ndjson': nd([{ patchID: 'c1' }, { patchID: 'd1' }]),
  },
}

// BikeBlitz/_processed/night1: photos one folder deep (the package folder held the nights).
const night1: SubPackageRecords = {
  folder: 'night1',
  manifestText: manifest('night1', ['03_classifications/aq.ndjson']),
  files: {
    '02_records/patches.ndjson': nd([
      { patchID: 'n1', assetPath: 'bowedBarbo_2026-06-04/n1.jpg', deploymentID: 'bowedBarbo_2026-06-04', cameraDayID: 'bowedBarbo_2026-06-04__2026-06-04', sessionID: 'Cactus__2026-08-11' },
    ]),
    '02_records/patch-sources.ndjson': nd([
      { patchID: 'n1', originalBotDetectionPath: 'bowedBarbo_2026-06-04/n_botdetection.json', sourcePhotoAssetPath: 'bowedBarbo_2026-06-04/n.jpg' },
    ]),
    '02_records/deployments.ndjson': nd([{ deploymentID: 'bowedBarbo_2026-06-04', crew: 'AQ' }]),
    '02_records/camera-days.ndjson': nd([{ cameraDayID: 'bowedBarbo_2026-06-04__2026-06-04', deploymentID: 'bowedBarbo_2026-06-04', nightDate: '2026-06-04' }]),
    '02_records/sessions.ndjson': nd([{ sessionID: 'Cactus__2026-08-11', deploymentID: 'bowedBarbo_2026-06-04', captureWindows: [{ captureWindowID: 'Cactus__2026-08-11__w1' }] }]),
    '03_classifications/aq.ndjson': '{"patchID":"n1","identifierID":"aq","identifierType":"human","label":"Noctuidae"}\n',
  },
}

const rows = (text: string | undefined) => (text ?? '').split('\n').filter(Boolean).map((line) => JSON.parse(line))

describe('combineProjectRecords', () => {
  const combined = combineProjectRecords({ projectName: 'Tucson', subPackages: [desertHouse, night1] })

  it('keeps every identification line exactly', () => {
    expect(combined.files['03_classifications/aq.ndjson']).toBe(
      desertHouse.files['03_classifications/aq.ndjson'] + night1.files['03_classifications/aq.ndjson'],
    )
    expect(combined.files['02_records/current-classifications.ndjson']).toBe(
      desertHouse.files['02_records/current-classifications.ndjson'],
    )
    expect(combined.summary.classificationLines['03_classifications/aq.ndjson']).toBe(2)
  })

  it('puts the folder in front of every path and names deployments by where they sit', () => {
    const patches = rows(combined.files['02_records/patches.ndjson'])
    expect(patches.map((p) => [p.patchID, p.assetPath, p.deploymentID, p.cameraDayID, p.datasetID])).toEqual([
      ['c1', 'DesertHouse/Cactus/2026-08-11/c1.jpg', 'DesertHouse~Cactus', 'DesertHouse~Cactus__2026-08-11', 'Tucson'],
      ['d1', 'DesertHouse/Ditch/2026-08-13/d1.jpg', 'DesertHouse~Ditch', 'DesertHouse~Ditch__2026-08-13', 'Tucson'],
      ['n1', 'night1/bowedBarbo_2026-06-04/n1.jpg', 'night1', 'night1__2026-06-04', 'Tucson'],
    ])
    const sources = rows(combined.files['02_records/patch-sources.ndjson'])
    expect(sources[0].originalBotDetectionPath).toBe('DesertHouse/Cactus/2026-08-11/c_botdetection.json')
    expect(sources[2].sourcePhotoAssetPath).toBe('night1/bowedBarbo_2026-06-04/n.jpg')
  })

  it('carries deployment details and nights over to the new names', () => {
    const deployments = rows(combined.files['02_records/deployments.ndjson'])
    expect(deployments.map((d) => d.deploymentID)).toEqual(['DesertHouse~Cactus', 'DesertHouse~Ditch', 'night1'])
    expect(deployments[0].latitude).toBe(32.1)
    expect(deployments[0].siteID).toBe('Tucson/site/Cactus')
    expect(deployments[2].crew).toBe('AQ')
    const nights = rows(combined.files['02_records/camera-days.ndjson'])
    expect(nights.map((n) => [n.cameraDayID, n.deploymentID])).toEqual([
      ['DesertHouse~Cactus__2026-08-11', 'DesertHouse~Cactus'],
      ['DesertHouse~Ditch__2026-08-13', 'DesertHouse~Ditch'],
      ['night1__2026-06-04', 'night1'],
    ])
  })

  it('renames a session id that another folder already used', () => {
    const sessions = rows(combined.files['02_records/sessions.ndjson'])
    expect(sessions.map((s) => [s.sessionID, s.deploymentID])).toEqual([
      ['Cactus__2026-08-11', 'DesertHouse~Cactus'],
      ['night1~Cactus__2026-08-11', 'night1'],
    ])
    expect(sessions[1].captureWindows[0].captureWindowID).toBe('night1~Cactus__2026-08-11__w1')
    const n1 = rows(combined.files['02_records/patches.ndjson']).find((p) => p.patchID === 'n1')
    expect(n1.sessionID).toBe('night1~Cactus__2026-08-11')
  })

  it('names the project in dataset.json and lists every identification file', () => {
    const manifest = JSON.parse(combined.manifestText)
    expect(manifest.datasetID).toBe('Tucson')
    expect(manifest.classificationSources).toEqual(['03_classifications/_bot.ndjson', '03_classifications/aq.ndjson'])
  })

  it('stops, before writing anything, when a patch is in two folders', () => {
    const copy = { ...night1, folder: 'night1_copy' }
    expect(() => combineProjectRecords({ projectName: 'BikeBlitz', subPackages: [night1, copy] })).toThrow(
      /n1 is in both night1 and night1_copy/,
    )
  })
})
