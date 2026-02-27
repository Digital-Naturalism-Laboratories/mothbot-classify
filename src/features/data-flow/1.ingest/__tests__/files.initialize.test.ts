import { beforeEach, describe, expect, it } from 'vitest'
import { preloadNightSummariesFromIndexed } from '../files.initialize'
import { nightSummariesStore } from '~/stores/entities/night-summaries'

describe('preloadNightSummariesFromIndexed', () => {
  beforeEach(() => {
    nightSummariesStore.set({})
  })

  it('prefers canonical source when legacy and canonical ids collide without updatedAt', async () => {
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/night_summary.json',
        summary: {
          nightId: 'Dinacon2025/Les/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
          totalDetections: 11,
          totalIdentified: 3,
        },
      }),
    ])
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/night_summary.json',
        summary: {
          nightId: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
          totalDetections: 22,
          totalIdentified: 7,
        },
      }),
    ])

    await waitForAsyncReads()

    const summary = nightSummariesStore.get()['Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21']
    expect(summary?.totalDetections).toBe(22)
    expect(summary?.totalIdentified).toBe(7)
  })

  it('keeps canonical source when legacy result arrives later', async () => {
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26/night_summary.json',
        summary: {
          nightId: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26',
          totalDetections: 9,
          totalIdentified: 9,
        },
      }),
    ])
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26/night_summary.json',
        summary: {
          nightId: 'Hoya/168m/Hoya_168m_doubleParina_2025-01-26/2025-01-26',
          totalDetections: 2,
          totalIdentified: 1,
        },
      }),
    ])

    await waitForAsyncReads()

    const summary = nightSummariesStore.get()['Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26']
    expect(summary?.totalDetections).toBe(9)
    expect(summary?.totalIdentified).toBe(9)
  })

  it('loads legacy-only summaries without leaving placeholder zeros', async () => {
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/night_summary.json',
        summary: {
          nightId: 'Dinacon2025/Les/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
          totalDetections: 15,
          totalIdentified: 6,
        },
      }),
    ])

    await waitForAsyncReads()

    const summary = nightSummariesStore.get()['Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21']
    expect(summary?.totalDetections).toBe(15)
    expect(summary?.totalIdentified).toBe(6)
  })
})

function makeSummaryEntry(params: { path: string; summary: Record<string, unknown> }) {
  const { path, summary } = params
  const name = 'night_summary.json'
  return {
    path,
    name,
    size: 1,
    file: {
      text: async () => JSON.stringify(summary),
    } as any,
  }
}

async function waitForAsyncReads() {
  await new Promise((resolve) => setTimeout(resolve, 30))
}
