import { describe, expect, it } from 'vitest'
import { buildDarwinShapeFromDetection, type DarwinExportContext } from '../darwin-csv'
import type { DetectionEntity } from '~/stores/entities/detections'

const context: DarwinExportContext = {
  sessionsById: new Map([
    ['DepA__2026-07-27', { sessionID: 'DepA__2026-07-27', start: '2026-07-27T12:00:00', end: '2026-07-28T11:59:59' }],
  ]),
  deploymentByPatch: new Map([['p1', { deployment_id: 'DepA', device_name: 'SnappySloth', device_type: 'Mothbox Pro' }]]),
  determinationAlgorithm: 'mothbox-default/1',
}

const base: DetectionEntity = {
  id: 'p1',
  patchId: 'p1',
  photoId: 'cam_2026_07_27__19_30_00_HDR0.jpg',
  leafGroupId: 'Proj/DepA/2026-07-27',
  sessionId: 'DepA__2026-07-27',
  captureWindowId: 'DepA__2026-07-27__w1',
}

describe('Darwin CSV ontology columns', () => {
  it('writes events, device, keys and the identifier type', () => {
    const detection: DetectionEntity = {
      ...base,
      detectedBy: 'user',
      humanClassifierId: 'zz',
      label: 'Eulepidotis folium',
      taxon: {
        scientificName: 'Eulepidotis folium',
        order: 'Lepidoptera',
        genus: 'Eulepidotis',
        species: 'folium',
        taxonRank: 'species',
        taxonID: 'B6L67',
        taxonIDSource: 'col',
        taxonKeys: { bold: 'BOLD:AAC2117' },
      },
    }
    const row = buildDarwinShapeFromDetection({ detection, leafGroupId: base.leafGroupId, nightDiskPath: '', context })
    expect(row).toMatchObject({
      sessionID: 'DepA__2026-07-27',
      sessionStart: '2026-07-27T12:00:00',
      sessionEnd: '2026-07-28T11:59:59',
      captureWindowID: 'DepA__2026-07-27__w1',
      parentEventID: 'DepA__2026-07-27__w1',
      deviceID: 'SnappySloth',
      deviceType: 'Mothbox Pro',
      identifierType: 'human',
      identifiedBy: 'ZZ',
      determinationAlgorithm: 'mothbox-default/1',
      taxonID: 'B6L67',
      taxonIDSource: 'col',
      colTaxonKey: 'B6L67',
      boldBIN: 'BOLD:AAC2117',
      gbifTaxonKey: '',
      nonTarget: '',
      occurrenceID: 'p1',
    })
  })

  it('marks Non-Target detections with their category', () => {
    const detection: DetectionEntity = { ...base, detectedBy: 'user', isError: true, classificationType: 'error', label: 'ERROR_Blur' }
    const row = buildDarwinShapeFromDetection({ detection, leafGroupId: base.leafGroupId, nightDiskPath: '', context })
    expect(row).toMatchObject({ nonTarget: 'true', nonTargetCategory: 'Error/Blur', name: 'NON_TARGET/Error/Blur', scientificName: '' })
  })

  it('reads an older gbif-backbone key style as gbif', () => {
    const detection: DetectionEntity = {
      ...base,
      botClassifierId: 'BioCLIP',
      taxon: { scientificName: 'Diptera', order: 'Diptera', taxonRank: 'order', taxonID: 811, taxonIDSource: 'gbif-backbone' },
    }
    const row = buildDarwinShapeFromDetection({ detection, leafGroupId: base.leafGroupId, nightDiskPath: '', context })
    expect(row).toMatchObject({ taxonIDSource: 'gbif', gbifTaxonKey: '811', identifierType: 'machine' })
  })
})
