import { describe, expect, it } from 'vitest'
import { buildCatalogScopeCounts, computeAllowedLeafGroupIds } from '../catalog-utils'

describe('computeAllowedLeafGroupIds', () => {
  it('includes nights from the nights store when summaries are empty', () => {
    const allowed = computeAllowedLeafGroupIds({
      usageScope: 'project',
      summaries: {},
      nights: {
        a: { id: 'hoya/deploy-a/night-1' },
        b: { id: 'hoya/deploy-b/night-2' },
      },
      projectId: 'hoya',
    })

    expect(allowed).toEqual(new Set(['hoya/deploy-a/night-1', 'hoya/deploy-b/night-2']))
  })

  it('excludes nights from other datasets in project scope', () => {
    const allowed = computeAllowedLeafGroupIds({
      usageScope: 'project',
      summaries: {},
      nights: {
        hoya: { id: 'hoya/deploy-a/night-1' },
        other: { id: 'dinacon/deploy-a/night-1' },
      },
      projectId: 'hoya',
    })

    expect(allowed).toEqual(new Set(['hoya/deploy-a/night-1']))
  })

  it('returns undefined for all-datasets scope', () => {
    const allowed = computeAllowedLeafGroupIds({
      usageScope: 'all',
      summaries: { 'hoya/a/n1': {} },
      nights: { n1: { id: 'hoya/a/n1' } },
      projectId: 'hoya',
    })

    expect(allowed).toBeUndefined()
  })

  it('matches mothbox-next camera_day_id nights via entity projectId', () => {
    const packageNightId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23__2025-06-22'
    const allowed = computeAllowedLeafGroupIds({
      usageScope: 'project',
      summaries: {},
      nights: {
        [packageNightId]: {
          id: packageNightId,
          projectId: 'dinacon2025_lightweight_substrate',
          siteId: 'Les_BeachPalm',
          deploymentId: 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23',
        },
      },
      projectId: 'dinacon2025_lightweight_substrate',
    })

    expect(allowed).toEqual(new Set([packageNightId]))
  })

  it('matches mothbox-next package nights via datasetId only at project scope', () => {
    const packageNightId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23__2025-06-22'
    const datasetId = 'dinacon2025_lightweight_substrate'
    const allowed = computeAllowedLeafGroupIds({
      usageScope: 'project',
      summaries: {},
      nights: {
        [packageNightId]: {
          id: packageNightId,
          datasetId,
          siteId: 'Les_BeachPalm',
          deploymentId: 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23',
        },
      },
      projectId: datasetId,
    })

    expect(allowed).toEqual(new Set([packageNightId]))
  })

  it('includes package nights at site scope when entity has datasetId only', () => {
    const packageNightId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23__2025-06-22'
    const datasetId = 'dinacon2025_lightweight_substrate'
    const siteId = 'Les_BeachPalm'
    const allowed = computeAllowedLeafGroupIds({
      usageScope: 'site',
      summaries: {},
      nights: {
        [packageNightId]: {
          id: packageNightId,
          datasetId,
          siteId,
          deploymentId: 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23',
        },
      },
      projectId: datasetId,
      siteId,
    })

    expect(allowed).toEqual(new Set([packageNightId]))
  })

  it('includes package nights at deployment scope when entity has datasetId only', () => {
    const packageNightId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23__2025-06-22'
    const datasetId = 'dinacon2025_lightweight_substrate'
    const deploymentId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23'
    const allowed = computeAllowedLeafGroupIds({
      usageScope: 'deployment',
      summaries: {},
      nights: {
        [packageNightId]: {
          id: packageNightId,
          datasetId,
          siteId: 'Les_BeachPalm',
          deploymentId,
        },
      },
      projectId: datasetId,
      deploymentId,
    })

    expect(allowed).toEqual(new Set([packageNightId]))
  })

  it('includes package nights at night scope when entity has datasetId only', () => {
    const packageNightId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23__2025-06-22'
    const datasetId = 'dinacon2025_lightweight_substrate'
    const deploymentId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23'
    const allowed = computeAllowedLeafGroupIds({
      usageScope: 'night',
      summaries: {},
      nights: {
        [packageNightId]: {
          id: packageNightId,
          datasetId,
          siteId: 'Les_BeachPalm',
          deploymentId,
        },
      },
      projectId: datasetId,
      deploymentId,
      leafGroupId: packageNightId,
    })

    expect(allowed).toEqual(new Set([packageNightId]))
  })
})

describe('buildCatalogScopeCounts', () => {
  it('counts distinct keys per scope without mixing scopes', () => {
    const scopeCounts = buildCatalogScopeCounts({
      summaries: {
        'hoya/deploy-a/night-1': { morphoCounts: { alpha: 1 } },
        'other/deploy-a/night-1': { morphoCounts: { beta: 1 } },
      },
      scopeIds: { projectId: 'hoya' },
      countForScope: (allowedLeafGroupIds) => {
        const keys = new Set<string>()
        for (const [leafGroupId, summary] of Object.entries({
          'hoya/deploy-a/night-1': { morphoCounts: { alpha: 1 } },
          'other/deploy-a/night-1': { morphoCounts: { beta: 1 } },
        })) {
          if (allowedLeafGroupIds && !allowedLeafGroupIds.has(leafGroupId)) continue
          for (const key of Object.keys(summary.morphoCounts ?? {})) keys.add(key)
        }
        return keys.size
      },
    })

    expect(scopeCounts.project).toBe(1)
    expect(scopeCounts.all).toBe(2)
  })
})
