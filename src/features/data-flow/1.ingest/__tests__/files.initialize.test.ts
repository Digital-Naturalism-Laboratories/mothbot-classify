import { beforeEach, describe, expect, it } from 'vitest'
import { preloadNightSummariesFromIndexed } from '../files.initialize'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'

describe('preloadNightSummariesFromIndexed', () => {
  beforeEach(() => {
    leafGroupSummariesStore.set({})
  })

  it('prefers canonical source when legacy and canonical ids collide without updatedAt', async () => {
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/night_summary.json',
        summary: {
          leafGroupId: 'Dinacon2025/Les/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
          totalDetections: 11,
          totalIdentified: 3,
        },
      }),
    ])
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/night_summary.json',
        summary: {
          leafGroupId: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
          totalDetections: 22,
          totalIdentified: 7,
        },
      }),
    ])

    await waitForAsyncReads()

    const summary = leafGroupSummariesStore.get()['Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21']
    expect(summary?.totalDetections).toBe(22)
    expect(summary?.totalIdentified).toBe(7)
  })

  it('keeps canonical source when legacy result arrives later', async () => {
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26/night_summary.json',
        summary: {
          leafGroupId: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26',
          totalDetections: 9,
          totalIdentified: 9,
        },
      }),
    ])
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26/night_summary.json',
        summary: {
          leafGroupId: 'Hoya/168m/Hoya_168m_doubleParina_2025-01-26/2025-01-26',
          totalDetections: 2,
          totalIdentified: 1,
        },
      }),
    ])

    await waitForAsyncReads()

    const summary = leafGroupSummariesStore.get()['Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26']
    expect(summary?.totalDetections).toBe(9)
    expect(summary?.totalIdentified).toBe(9)
  })

  it('loads legacy-only summaries without leaving placeholder zeros', async () => {
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/night_summary.json',
        summary: {
          leafGroupId: 'Dinacon2025/Les/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
          totalDetections: 15,
          totalIdentified: 6,
        },
      }),
    ])

    await waitForAsyncReads()

    const summary = leafGroupSummariesStore.get()['Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21']
    expect(summary?.totalDetections).toBe(15)
    expect(summary?.totalIdentified).toBe(6)
  })

  it('prefers the summary file path when embedded leafGroupId is mismatched', async () => {
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Cerro_Hoya_Expedition/Hoya_1004m_accionSauro_2025-01-28/2025-01-27/night_summary.json',
        summary: {
          leafGroupId: 'Projects/Cerro_Hoya_Expedition/Hoya_1004m_accionSauro_2025-01-26/2025-01-26',
          totalDetections: 1100,
          totalIdentified: 1100,
          morphoCounts: { forcipomyia1: 264 },
        },
      }),
    ])

    await waitForAsyncReads()

    const correctSummary =
      leafGroupSummariesStore.get()['Cerro_Hoya_Expedition/Hoya_1004m_accionSauro_2025-01-28/2025-01-27']
    const wrongSummary =
      leafGroupSummariesStore.get()['Projects/Cerro_Hoya_Expedition/Hoya_1004m_accionSauro_2025-01-26/2025-01-26']

    expect(correctSummary?.totalDetections).toBe(1100)
    expect(correctSummary?.morphoCounts).toEqual({ forcipomyia1: 264 })
    expect(wrongSummary).toBeUndefined()
  })

  it('backfills morpho taxonomy from identified json when older summaries do not include it', async () => {
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26/night_summary.json',
        summary: {
          leafGroupId: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26',
          totalDetections: 12,
          totalIdentified: 2,
        },
      }),
      makeIdentifiedEntry({
        path: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26/photo_identified.json',
        shapes: [
          {
            patch_path: 'patches/netelia_patch.jpg',
            label: 'netelia1',
            morphospecies: 'netelia1',
            class: 'Insecta',
            order: 'Hymenoptera',
            family: 'Ichneumonidae',
            genus: 'Netelia',
            identifier_human: 'BR',
            timestamp_ID_human: 123,
          },
        ],
      }),
    ])

    await waitForAsyncReads()

    const summary = leafGroupSummariesStore.get()['Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26']
    expect(summary?.morphoCounts).toEqual({ netelia1: 1 })
    expect(summary?.morphoPreviewPatchIds).toEqual({ netelia1: 'netelia_patch.jpg' })
    expect(summary?.morphoTaxonomyByKey?.netelia1).toMatchObject({
      class: 'Insecta',
      order: 'Hymenoptera',
      family: 'Ichneumonidae',
      genus: 'Netelia',
      morphospecies: 'netelia1',
    })
  })

  it('backfills species taxonomy from identified json when older summaries do not include it', async () => {
    preloadNightSummariesFromIndexed([
      makeSummaryEntry({
        path: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26/night_summary.json',
        summary: {
          leafGroupId: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26',
          totalDetections: 12,
          totalIdentified: 2,
        },
      }),
      makeIdentifiedEntry({
        path: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26/photo_identified.json',
        shapes: [
          {
            patch_path: 'patches/culex_patch.jpg',
            label: 'culex pipiens',
            class: 'Insecta',
            order: 'Diptera',
            family: 'Culicidae',
            genus: 'Culex',
            species: 'pipiens',
            identifier_human: 'BR',
            timestamp_ID_human: 123,
          },
        ],
      }),
    ])

    await waitForAsyncReads()

    const summary = leafGroupSummariesStore.get()['Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26']
    expect(summary?.speciesCounts).toEqual({ pipiens: 1 })
    expect(summary?.speciesPreviewPatchIds).toEqual({ pipiens: 'culex_patch.jpg' })
    expect(summary?.speciesTaxonomyByName?.pipiens).toMatchObject({
      class: 'Insecta',
      order: 'Diptera',
      family: 'Culicidae',
      genus: 'Culex',
      species: 'pipiens',
    })
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

function makeIdentifiedEntry(params: { path: string; shapes: Record<string, unknown>[] }) {
  const { path, shapes } = params
  return {
    path,
    name: 'photo_identified.json',
    size: 1,
    file: {
      text: async () => JSON.stringify({ version: '1', photoBase: 'photo', shapes }),
    } as any,
  }
}

async function waitForAsyncReads() {
  await new Promise((resolve) => setTimeout(resolve, 30))
}
