import { describe, expect, it } from 'vitest'
import { buildProgressIndex, parseProcessTimestamp } from '../projects-progress'

describe('buildProgressIndex', () => {
  it('counts only the newest detection run of a night', () => {
    const leafGroupId = 'D/dep/2026-08-14'
    const det = (id: string, detectorId: string, user = false) =>
      ({ id, leafGroupId, patchId: id, photoId: 'p.jpg', detectorId, detectedBy: user ? 'user' : 'auto' }) as any
    const index = buildProgressIndex({
      nights: { [leafGroupId]: { id: leafGroupId, name: '2026-08-14', projectId: 'D', siteId: 'D/s', deploymentId: 'D/dep' } },
      nightSummaries: {},
      detections: {
        o1: det('o1', 'Mothbot_MBD-1-0.pt', true),
        o2: det('o2', 'Mothbot_MBD-1-0.pt', true),
        o3: det('o3', 'Mothbot_MBD-1-0.pt'),
        n1: det('n1', 'Mothbot_MBD-1-1.pt', true),
        n2: det('n2', 'Mothbot_MBD-1-1.pt'),
      },
    })
    expect(index.byLeafGroup[leafGroupId]).toMatchObject({ total: 2, identified: 1, newestDetector: 'Mothbot_MBD-1-1.pt' })
    expect(index.byLeafGroup[leafGroupId].detectorIds?.sort()).toEqual(['Mothbot_MBD-1-0.pt', 'Mothbot_MBD-1-1.pt'])
    expect(index.byDeployment['D/dep']).toMatchObject({ total: 2, identified: 1 })
  })

  it('rolls up night progress to deployment, site, and project using entity ids', () => {
    const projectId = 'Dinacon2025-no-raw-img'
    const siteId = `${projectId}/Les_BeachPalm`
    const deploymentId = `${projectId}/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20`
    const leafGroupId = `${deploymentId}/2025-06-22`

    const index = buildProgressIndex({
      nights: {
        [leafGroupId]: {
          id: leafGroupId,
          name: '2025-06-22',
          projectId,
          siteId,
          deploymentId,
        },
      },
      nightSummaries: {
        [leafGroupId]: { leafGroupId, totalDetections: 0, totalIdentified: 0 },
      },
      detections: {
        d1: { id: 'd1', leafGroupId, patchId: 'p1', photoId: 'photo.jpg', detectedBy: 'user' } as any,
        d2: { id: 'd2', leafGroupId, patchId: 'p2', photoId: 'photo.jpg', detectedBy: 'user' } as any,
      },
    })

    expect(index.byLeafGroup[leafGroupId]).toEqual({ total: 2, identified: 2 })
    expect(index.byDeployment[deploymentId]).toEqual({ total: 2, identified: 2 })
    expect(index.bySite[siteId]).toEqual({ total: 2, identified: 2 })
    expect(index.byProject[projectId]).toEqual({ total: 2, identified: 2 })
  })

  it('rolls up camera_day_id nights without slash-separated night ids', () => {
    const projectId = 'Dinacon2025'
    const siteId = `${projectId}/Les_BeachPalm`
    const deploymentId = `${projectId}/Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23`
    const leafGroupId = `${deploymentId}__2025-06-23`

    const index = buildProgressIndex({
      nights: {
        [leafGroupId]: {
          id: leafGroupId,
          name: '2025-06-23',
          projectId,
          siteId,
          deploymentId,
        },
      },
      nightSummaries: {
        [leafGroupId]: { leafGroupId, totalDetections: 2, totalIdentified: 2 },
      },
      detections: {},
    })

    expect(index.byLeafGroup[leafGroupId]).toEqual({ total: 2, identified: 2 })
    expect(index.byDeployment[deploymentId]).toEqual({ total: 2, identified: 2 })
    expect(index.bySite[siteId]).toEqual({ total: 2, identified: 2 })
    expect(index.byProject[projectId]).toEqual({ total: 2, identified: 2 })
  })
})

describe('night details (detector, dates)', () => {
  it('parses Mothbot Process timestamps, with or without a UTC offset', () => {
    expect(parseProcessTimestamp('2026-07-05__21_02_22_(+0200)')).toBe(Date.parse('2026-07-05T21:02:22+02:00'))
    expect(parseProcessTimestamp('2026-07-05__21_02_22')).toBe(Date.parse('2026-07-05T21:02:22'))
    expect(parseProcessTimestamp('not a date')).toBeUndefined()
    expect(parseProcessTimestamp(undefined)).toBeUndefined()
  })

  it('reports the newest detector run and latest dates per night, and rolls them up', () => {
    const deploymentId = 'P/dep'
    const night = (id: string) => ({ id, name: id, projectId: 'P', siteId: 'P/site', deploymentId })
    const det = (id: string, leafGroupId: string, extra: object) =>
      ({ id, leafGroupId, patchId: id, photoId: 'x.jpg', detectedBy: 'auto', ...extra }) as any
    const index = buildProgressIndex({
      nights: { n1: night('n1'), n2: night('n2') },
      nightSummaries: {},
      detections: {
        a: det('a', 'n1', { detectorId: 'Mothbot_MBD-0-2.pt', clusteredAt: '2026-07-05__21_02_22_(+0200)' }),
        b: det('b', 'n1', { detectorId: 'Mothbot_MBD-1-1.pt', clusteredAt: '2026-07-06__08_00_00_(+0200)' }),
        c: det('c', 'n2', { detectorId: 'Mothbot_yolo11m_4500_imgsz1600_b1_2024-01-18.pt', detectedBy: 'user', identifiedAt: 1790000000000 }),
      },
    })
    expect(index.byLeafGroup.n1.newestDetector).toBe('Mothbot_MBD-1-1.pt')
    expect(index.byLeafGroup.n1.clusteredAt).toBe(Date.parse('2026-07-06T08:00:00+02:00'))
    expect(index.byLeafGroup.n1.lastIdentifiedAt).toBeUndefined()
    expect(index.byLeafGroup.n2.lastIdentifiedAt).toBe(1790000000000)
    expect(index.byDeployment[deploymentId].newestDetector).toBe('Mothbot_MBD-1-1.pt')
    expect(index.byDeployment[deploymentId].detectorIds).toHaveLength(3)
    expect(index.byDeployment[deploymentId].lastIdentifiedAt).toBe(1790000000000)
  })
})
