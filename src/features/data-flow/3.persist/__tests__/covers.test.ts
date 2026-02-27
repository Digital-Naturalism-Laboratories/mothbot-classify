import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    idbGetMock: vi.fn(),
    idbPutMock: vi.fn(),
  }
})

vi.mock('~/utils/index-db', async () => {
  const actual = await vi.importActual<typeof import('~/utils/index-db')>('~/utils/index-db')
  return {
    ...actual,
    idbGet: mocks.idbGetMock,
    idbPut: mocks.idbPutMock,
  }
})

import { loadMorphoCovers, morphoCoversStore, setMorphoCover } from '../covers'

describe('morpho covers legacy nightId normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    morphoCoversStore.set({})
  })

  it('normalizes legacy nightId values on load', async () => {
    mocks.idbGetMock.mockResolvedValue({
      m1: {
        nightId: 'Dinacon2025/Les/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
        patchId: 'patch-a.jpg',
      },
    })

    await loadMorphoCovers()

    expect(morphoCoversStore.get()).toEqual({
      m1: {
        nightId: 'Dinacon2025/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21',
        patchId: 'patch-a.jpg',
      },
    })
  })

  it('normalizes nightId before persisting overrides', async () => {
    await setMorphoCover({
      morphoKey: 'Morpho A',
      nightId: 'Hoya/168m/Hoya_168m_doubleParina_2025-01-26/2025-01-26',
      patchId: 'patch-b.jpg',
    })

    const next = morphoCoversStore.get()
    expect(next['morpho a']).toEqual({
      nightId: 'Hoya/Hoya_168m_doubleParina_2025-01-26/2025-01-26',
      patchId: 'patch-b.jpg',
    })
    expect(mocks.idbPutMock).toHaveBeenCalled()
  })
})
