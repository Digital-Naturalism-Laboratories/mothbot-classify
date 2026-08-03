import { describe, expect, it } from 'vitest'
import { disambiguatePatchId, patchIdFromImageFileName } from '../adapter-patch-assets'

describe('patchIdFromImageFileName', () => {
  it('replaces image extension with .pt', () => {
    expect(patchIdFromImageFileName('hopeCobo_2025_06_22__04_58_06_HDR0_0_Mothbot.pt.jpg')).toBe(
      'hopeCobo_2025_06_22__04_58_06_HDR0_0_Mothbot.pt',
    )
  })

  it('does not double .pt when the model suffix is already in the filename', () => {
    expect(patchIdFromImageFileName('grupoKite_2025_06_23__04_56_19_HDR0_0_Mothbot_last.pt.jpg')).toBe(
      'grupoKite_2025_06_23__04_56_19_HDR0_0_Mothbot_last.pt',
    )
  })
})

describe('disambiguatePatchId', () => {
  it('scopes later collisions with the camera day id', () => {
    const usedPatchIds = new Set<string>()
    const base = 'grupoKite_2025_06_23__04_56_19_HDR0_0_Mothbot_last.pt'

    expect(
      disambiguatePatchId({
        basePatchId: base,
        cameraDayId: 'Hoya_408m_calmoBarbo_2025-01-26__2025-01-26',
        usedPatchIds,
      }),
    ).toBe(base)

    expect(
      disambiguatePatchId({
        basePatchId: base,
        cameraDayId: 'Hoya_408m_calmoBarbo_2025-01-26__2025-01-27',
        usedPatchIds,
      }),
    ).toBe(`${base}@Hoya_408m_calmoBarbo_2025-01-26__2025-01-27`)
  })
})
