import { describe, expect, it } from 'vitest'
import { buildNightUrl, computeAllowedNightIds, extractRouteIds, parseNightIdParts } from '../catalog-utils'

describe('catalog-utils', () => {
  it('extracts route ids from canonical night route', () => {
    const ids = extractRouteIds('/projects/Dinacon2025/deployments/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/nights/2025-06-21')
    expect(ids).toMatchObject({
      projectId: 'Dinacon2025',
      deploymentId: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
      nightId: '2025-06-21',
      siteId: 'Les',
    })
  })

  it('builds canonical night URLs', () => {
    const url = buildNightUrl({
      projectId: 'Dinacon2025',
      deploymentId: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
      nightId: '2025-06-21',
    })
    expect(url).toBe('/projects/Dinacon2025/deployments/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/nights/2025-06-21')
  })

  it('parses canonical night IDs', () => {
    const parts = parseNightIdParts('Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21')
    expect(parts).toMatchObject({
      projectId: 'Dinacon2025',
      deploymentId: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
      nightId: '2025-06-21',
      siteId: 'Les',
    })
  })

  it('filters deployment scope with canonical night ids', () => {
    const summaries = {
      'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21': {},
      'Dinacon2025/Dinacon2025_Les_WilanTopTree_HopeCobo_2025-06-25/2025-06-25': {},
      'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26': {},
    }
    const allowed = computeAllowedNightIds({
      usageScope: 'deployment',
      summaries,
      projectId: 'Dinacon2025',
      deploymentId: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
    })

    expect(allowed).toEqual(new Set(['Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21']))
  })
})
