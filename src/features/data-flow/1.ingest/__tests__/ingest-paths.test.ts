import { describe, expect, it } from 'vitest'
import {
  buildNightRouteParams,
  normalizeLegacyNightId,
  parsePathParts,
  resolveNightEntityIdFromRoute,
} from '../ingest-paths'

describe('ingest-paths', () => {
  it('parses dataset/deployment/night patch paths', () => {
    const parsed = parsePathParts({
      path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/patches/file.jpg',
    })

    expect(parsed).toMatchObject({
      project: 'Dinacon2025',
      site: 'Les',
      deployment: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
      night: '2025-06-21',
      isPatch: true,
      fileName: 'file.jpg',
    })
  })

  it('parses non-patch botdetection file paths', () => {
    const parsed = parsePathParts({
      path: 'stress Dataset/OriaNursery_Nursery_prizecrab_2025-02-05/2025-02-05/file_botdetection.json',
    })

    expect(parsed).toMatchObject({
      project: 'stress Dataset',
      site: 'Nursery',
      deployment: 'OriaNursery_Nursery_prizecrab_2025-02-05',
      night: '2025-02-05',
      isBotJson: true,
      baseName: 'file',
    })
  })

  it('normalizes legacy 4-part night ids to canonical 3-part', () => {
    const normalized = normalizeLegacyNightId('Hoya/168m/Hoya_168m_doubleParina_2025-01-26/2025-01-26')
    expect(normalized).toBe('Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26')
  })

  it('keeps already canonical night ids unchanged', () => {
    const normalized = normalizeLegacyNightId('Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21')
    expect(normalized).toBe('Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21')
  })

  it('resolves mothbox-next camera_day_id from route params', () => {
    const cameraDayId = 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23__2025-06-23'
    const nights = {
      [cameraDayId]: { id: cameraDayId },
    }

    const resolved = resolveNightEntityIdFromRoute({
      nights,
      projectId: 'Dinacon2025',
      deploymentId: 'Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23',
      nightId: '2025-06-23',
    })

    expect(resolved).toBe(cameraDayId)
  })

  it('resolves mothbox-next when route night segment is full camera_day_id', () => {
    const cameraDayId = 'Hoya_168m_doubleParina_2025-01-26__2025-01-26'
    const nights = { [cameraDayId]: { id: cameraDayId } }

    const resolved = resolveNightEntityIdFromRoute({
      nights,
      projectId: 'Hoya',
      deploymentId: 'Hoya_168m_doubleParina_2025-01-26',
      nightId: cameraDayId,
    })

    expect(resolved).toBe(cameraDayId)
  })

  it('buildNightRouteParams uses night_date for camera_day_id entities', () => {
    expect(
      buildNightRouteParams({
        projectId: 'Hoya',
        deploymentId: 'Hoya_168m_doubleParina_2025-01-26',
        night: { id: 'Hoya_168m_doubleParina_2025-01-26__2025-01-26', name: '2025-01-26' },
      }),
    ).toEqual({
      projectId: 'Hoya',
      deploymentId: 'Hoya_168m_doubleParina_2025-01-26',
      nightId: '2025-01-26',
    })
  })

  it('resolves legacy project/deployment/night from route params', () => {
    const legacyId = 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21'
    const nights = {
      [legacyId]: { id: legacyId },
    }

    const resolved = resolveNightEntityIdFromRoute({
      nights,
      projectId: 'Dinacon2025',
      deploymentId: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
      nightId: '2025-06-21',
    })

    expect(resolved).toBe(legacyId)
  })

  it('ignores archived package source tree paths', () => {
    const parsed = parsePathParts({
      path: '00_source/Les/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/patches/file.jpg',
    })

    expect(parsed).toBeNull()
  })
})
