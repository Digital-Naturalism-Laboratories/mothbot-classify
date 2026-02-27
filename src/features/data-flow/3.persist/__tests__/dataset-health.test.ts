import { describe, expect, it, vi } from 'vitest'
import type { IndexedFile } from '~/features/data-flow/1.ingest/files.state'

const mocks = vi.hoisted(() => {
  return {
    idbGetMock: vi.fn(),
  }
})

vi.mock('~/utils/index-db', async () => {
  const actual = await vi.importActual<typeof import('~/utils/index-db')>('~/utils/index-db')
  return {
    ...actual,
    idbGet: mocks.idbGetMock,
  }
})

import { healNightSummaryNightIds, runDatasetHealthAudit } from '../dataset-health'

describe('dataset-health', () => {
  it('audits legacy summary ids, invalid identified files, and collisions', async () => {
    const entries: IndexedFile[] = [
      makeIndexedFile({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/night_summary.json',
        name: 'night_summary.json',
        text: JSON.stringify({
          nightId: 'Dinacon2025/Les/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
          totalDetections: 10,
          totalIdentified: 5,
        }),
      }),
      makeIndexedFile({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/foo_identified.json',
        name: 'foo_identified.json',
        text: '{"shapes":"oops"}',
      }),
      makeIndexedFile({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/foo.jpg',
        name: 'foo.jpg',
      }),
      makeIndexedFile({
        path: 'Dinacon2025/Dinacon2025_Les_WilanTopTree_HopeCobo_2025-06-25/2025-06-26/foo.jpg',
        name: 'foo.jpg',
      }),
      makeIndexedFile({
        path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/patches/foo_0_model.jpg',
        name: 'foo_0_model.jpg',
      }),
      makeIndexedFile({
        path: 'Dinacon2025/Dinacon2025_Les_WilanTopTree_HopeCobo_2025-06-25/2025-06-26/patches/foo_0_model.jpg',
        name: 'foo_0_model.jpg',
      }),
    ]

    const report = await runDatasetHealthAudit({ entries })

    expect(report.nightSummaryFiles).toBe(1)
    expect(report.identifiedFiles).toBe(1)
    expect(report.summaryIssues.some((issue) => issue.type === 'legacy-night-id')).toBe(true)
    expect(report.invalidIdentifiedJsonCount).toBe(1)
    expect(report.photoCollisionCount).toBe(1)
    expect(report.patchCollisionCount).toBe(1)
  })

  it('heals legacy summary nightId values', async () => {
    const root = {
      queryPermission: async () => 'granted',
    }
    mocks.idbGetMock.mockResolvedValue(root)

    let writtenText = ''
    const entry = makeIndexedFileWithWritableHandle({
      path: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/night_summary.json',
      name: 'night_summary.json',
      text: JSON.stringify({
        nightId: 'Dinacon2025/Les/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
        totalDetections: 10,
        totalIdentified: 5,
      }),
      onWrite: (text) => {
        writtenText = text
      },
    })

    const report = await healNightSummaryNightIds({ entries: [entry] })
    const healedJson = JSON.parse(writtenText)

    expect(report.scanned).toBe(1)
    expect(report.healed).toBe(1)
    expect(healedJson.nightId).toBe('Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21')
  })
})

function makeIndexedFile(params: { path: string; name: string; text?: string }): IndexedFile {
  const { path, name, text } = params
  return {
    path,
    name,
    size: 1,
    file:
      typeof text === 'string'
        ? ({
            text: async () => text,
          } as File)
        : undefined,
    handle: undefined,
  }
}

function makeIndexedFileWithWritableHandle(params: {
  path: string
  name: string
  text: string
  onWrite: (text: string) => void
}): IndexedFile {
  const { path, name, text, onWrite } = params
  return {
    path,
    name,
    size: 1,
    handle: {
      getFile: async () =>
        ({
          text: async () => text,
        } as File),
      createWritable: async () => ({
        write: async (nextText: string) => {
          onWrite(nextText)
        },
        close: async () => {},
      }),
    },
    file: undefined,
  }
}
