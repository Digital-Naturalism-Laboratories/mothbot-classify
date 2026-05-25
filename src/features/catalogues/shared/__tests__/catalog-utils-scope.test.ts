import { describe, expect, it } from 'vitest'
import { buildCatalogScopeCounts, computeAllowedNightIds } from '../catalog-utils'

describe('computeAllowedNightIds', () => {
  it('includes nights from the nights store when summaries are empty', () => {
    const allowed = computeAllowedNightIds({
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
    const allowed = computeAllowedNightIds({
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
    const allowed = computeAllowedNightIds({
      usageScope: 'all',
      summaries: { 'hoya/a/n1': {} },
      nights: { n1: { id: 'hoya/a/n1' } },
      projectId: 'hoya',
    })

    expect(allowed).toBeUndefined()
  })

  it('matches mothbox-next camera_day_id nights via entity projectId', () => {
    const packageNightId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23__2025-06-22'
    const allowed = computeAllowedNightIds({
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
})

describe('buildCatalogScopeCounts', () => {
  it('counts distinct keys per scope without mixing scopes', () => {
    const scopeCounts = buildCatalogScopeCounts({
      summaries: {
        'hoya/deploy-a/night-1': { morphoCounts: { alpha: 1 } },
        'other/deploy-a/night-1': { morphoCounts: { beta: 1 } },
      },
      scopeIds: { projectId: 'hoya' },
      countForScope: (allowedNightIds) => {
        const keys = new Set<string>()
        for (const [nightId, summary] of Object.entries({
          'hoya/deploy-a/night-1': { morphoCounts: { alpha: 1 } },
          'other/deploy-a/night-1': { morphoCounts: { beta: 1 } },
        })) {
          if (allowedNightIds && !allowedNightIds.has(nightId)) continue
          for (const key of Object.keys(summary.morphoCounts ?? {})) keys.add(key)
        }
        return keys.size
      },
    })

    expect(scopeCounts.project).toBe(1)
    expect(scopeCounts.all).toBe(2)
  })
})
