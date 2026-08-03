import { describe, expect, it } from 'vitest'
import {
  isDetectionInDataset,
  isLeafGroupInDataset,
  normalizeLeafGroupFromCache,
  resolveDatasetIdForLeafGroup,
} from '../dataset-scope'

describe('isLeafGroupInDataset', () => {
  it('allows all leaf groups when datasetId is omitted', () => {
    expect(isLeafGroupInDataset({ leafGroupId: 'any-id' })).toBe(true)
  })

  it('matches legacy path-shaped leaf ids via prefix when entity is missing', () => {
    expect(
      isLeafGroupInDataset({
        leafGroupId: 'project-1/site-1/deployment-1/night-1',
        datasetId: 'project-1',
      }),
    ).toBe(true)
    expect(
      isLeafGroupInDataset({
        leafGroupId: 'project-2/site-1/deployment-1/night-1',
        datasetId: 'project-1',
      }),
    ).toBe(false)
  })

  it('matches mothbox-next camera_day_id via entity projectId', () => {
    const packageNightId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23__2025-06-22'
    const datasetId = 'dinacon2025_lightweight_substrate'
    const leafGroups = {
      [packageNightId]: {
        id: packageNightId,
        datasetId,
      },
    }

    expect(isLeafGroupInDataset({ leafGroupId: packageNightId, datasetId, leafGroups })).toBe(true)
    expect(
      isLeafGroupInDataset({
        leafGroupId: packageNightId,
        datasetId: 'other-dataset',
        leafGroups,
      }),
    ).toBe(false)
  })
})

describe('resolveDatasetIdForLeafGroup', () => {
  it('prefers entity datasetId over path prefix', () => {
    const packageNightId = 'opaque-camera-day-id'
    const datasetId = 'dinacon2025_lightweight_substrate'
    expect(
      resolveDatasetIdForLeafGroup({
        leafGroupId: packageNightId,
        leafGroups: { [packageNightId]: { datasetId } },
      }),
    ).toBe(datasetId)
  })
})

describe('normalizeLeafGroupFromCache', () => {
  it('copies legacy projectId to datasetId', () => {
    const normalized = normalizeLeafGroupFromCache({
      id: 'night-1',
      name: 'Night 1',
      projectId: 'Hoya',
      siteId: 's',
      deploymentId: 'd',
    })

    expect(normalized.datasetId).toBe('Hoya')
    expect(normalized).not.toHaveProperty('projectId')
  })
})

describe('isDetectionInDataset', () => {
  it('delegates to leaf group id on detection', () => {
    expect(
      isDetectionInDataset({
        detection: { leafGroupId: 'hoya/deploy-a/night-1' },
        datasetId: 'hoya',
        leafGroups: { 'hoya/deploy-a/night-1': { datasetId: 'hoya' } },
      }),
    ).toBe(true)
  })
})
