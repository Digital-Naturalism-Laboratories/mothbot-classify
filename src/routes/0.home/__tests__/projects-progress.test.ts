import { describe, expect, it } from 'vitest'
import { buildProgressIndex } from '../projects-progress'

describe('buildProgressIndex', () => {
  it('rolls up night progress to deployment, site, and project using entity ids', () => {
    const projectId = 'Dinacon2025-no-raw-img'
    const siteId = `${projectId}/Les_BeachPalm`
    const deploymentId = `${projectId}/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20`
    const nightId = `${deploymentId}/2025-06-22`

    const index = buildProgressIndex({
      nights: {
        [nightId]: {
          id: nightId,
          name: '2025-06-22',
          projectId,
          siteId,
          deploymentId,
        },
      },
      nightSummaries: {
        [nightId]: { nightId, totalDetections: 0, totalIdentified: 0 },
      },
      detections: {
        d1: { id: 'd1', nightId, patchId: 'p1', photoId: 'photo.jpg', detectedBy: 'user' } as any,
        d2: { id: 'd2', nightId, patchId: 'p2', photoId: 'photo.jpg', detectedBy: 'user' } as any,
      },
    })

    expect(index.byNight[nightId]).toEqual({ total: 2, identified: 2 })
    expect(index.byDeployment[deploymentId]).toEqual({ total: 2, identified: 2 })
    expect(index.bySite[siteId]).toEqual({ total: 2, identified: 2 })
    expect(index.byProject[projectId]).toEqual({ total: 2, identified: 2 })
  })

  it('rolls up camera_day_id nights without slash-separated night ids', () => {
    const projectId = 'Dinacon2025'
    const siteId = `${projectId}/Les_BeachPalm`
    const deploymentId = `${projectId}/Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23`
    const nightId = `${deploymentId}__2025-06-23`

    const index = buildProgressIndex({
      nights: {
        [nightId]: {
          id: nightId,
          name: '2025-06-23',
          projectId,
          siteId,
          deploymentId,
        },
      },
      nightSummaries: {
        [nightId]: { nightId, totalDetections: 2, totalIdentified: 2 },
      },
      detections: {},
    })

    expect(index.byNight[nightId]).toEqual({ total: 2, identified: 2 })
    expect(index.byDeployment[deploymentId]).toEqual({ total: 2, identified: 2 })
    expect(index.bySite[siteId]).toEqual({ total: 2, identified: 2 })
    expect(index.byProject[projectId]).toEqual({ total: 2, identified: 2 })
  })
})
