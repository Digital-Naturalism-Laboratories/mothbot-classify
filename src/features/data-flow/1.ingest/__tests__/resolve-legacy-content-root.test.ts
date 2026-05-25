import { describe, expect, it } from 'vitest'
import { resolveLegacyWrapperDirName } from '../resolve-legacy-content-root'

describe('resolveLegacyWrapperDirName', () => {
  it('returns wrapper when all bot JSON is under one top-level folder', () => {
    const paths = [
      'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/night1/foo_botdetection.json',
      'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/night2/bar_botdetection.json',
    ]

    expect(resolveLegacyWrapperDirName(paths)).toBe('Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20')
  })

  it('returns null when bot JSON is at package root', () => {
    expect(resolveLegacyWrapperDirName(['foo_botdetection.json'])).toBeNull()
  })

  it('returns null when bot JSON spans multiple top-level folders', () => {
    const paths = ['dataset-a/night/foo_botdetection.json', 'dataset-b/night/bar_botdetection.json']
    expect(resolveLegacyWrapperDirName(paths)).toBeNull()
  })

  it('ignores paths already under 00_source', () => {
    const paths = ['00_source/night/foo_botdetection.json']
    expect(resolveLegacyWrapperDirName(paths)).toBeNull()
  })
})
