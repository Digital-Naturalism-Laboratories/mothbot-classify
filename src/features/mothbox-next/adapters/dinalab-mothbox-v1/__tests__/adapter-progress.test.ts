import { describe, expect, it, vi } from 'vitest'
import { createThrottledProgressCallback, formatProgressFraction } from '../adapter-progress'

describe('adapter-progress', () => {
  it('formats progress fractions with percent', () => {
    expect(formatProgressFraction({ current: 50, total: 200 })).toBe('50 / 200 (25%)')
  })

  it('flushes immediately on phase change and on flush()', () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const report = createThrottledProgressCallback((p) => calls.push(p.phase), 500)

    report({ phase: 'scan', message: 'x' })
    expect(calls).toEqual(['scan'])

    report({ phase: 'scan', message: 'x', description: 'again' })
    expect(calls).toEqual(['scan'])

    vi.advanceTimersByTime(500)
    expect(calls).toEqual(['scan', 'scan'])

    report({ phase: 'archive', message: 'x' })
    expect(calls).toEqual(['scan', 'scan', 'archive'])

    report({ phase: 'archive', message: 'x', description: '50 / 100' })
    report.flush()
    expect(calls).toEqual(['scan', 'scan', 'archive', 'archive'])

    vi.useRealTimers()
  })
})
