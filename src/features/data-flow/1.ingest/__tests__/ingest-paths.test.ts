import { describe, expect, it } from 'vitest'
import { normalizeLegacyNightId, parsePathParts } from '../ingest-paths'

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
})
