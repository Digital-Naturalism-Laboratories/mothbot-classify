import { describe, expect, it } from 'vitest'
import { toPackageRelativeAssetPath } from '../resolve-package-source-layout'

describe('toPackageRelativeAssetPath', () => {
  it('joins prefix and source-relative path', () => {
    expect(
      toPackageRelativeAssetPath({
        sourcePrefix: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
        pathRelativeToSource: 'night/patches/foo.jpg',
      }),
    ).toBe('Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/night/patches/foo.jpg')
  })

  it('uses 00_source prefix for archive layout', () => {
    expect(
      toPackageRelativeAssetPath({
        sourcePrefix: '00_source',
        pathRelativeToSource: 'night/patches/foo.jpg',
      }),
    ).toBe('00_source/night/patches/foo.jpg')
  })

  it('returns path as-is when prefix is empty', () => {
    expect(
      toPackageRelativeAssetPath({
        sourcePrefix: '',
        pathRelativeToSource: 'deployment/night/patches/foo.jpg',
      }),
    ).toBe('deployment/night/patches/foo.jpg')
  })
})
