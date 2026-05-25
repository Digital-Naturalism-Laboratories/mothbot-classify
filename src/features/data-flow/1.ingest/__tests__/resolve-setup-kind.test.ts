import { describe, expect, it } from 'vitest'
import { isPatchImagesOnlyKind } from '../resolve-setup-kind'

describe('resolve-setup-kind', () => {
  it('identifies patch-images-only kind', () => {
    expect(isPatchImagesOnlyKind('patch-images-only')).toBe(true)
    expect(isPatchImagesOnlyKind('legacy-root')).toBe(false)
  })
})
