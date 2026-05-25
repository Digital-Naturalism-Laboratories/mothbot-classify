import { describe, expect, it } from 'vitest'
import { formatInteger } from '../number'

describe('formatInteger', () => {
  it('adds grouping separators for thousands', () => {
    expect(formatInteger(7236)).toBe('7,236')
    expect(formatInteger(96)).toBe('96')
    expect(formatInteger(0)).toBe('0')
  })
})
