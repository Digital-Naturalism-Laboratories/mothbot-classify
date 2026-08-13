import { describe, expect, it } from 'vitest'
import { parseTimestampFromText, resolveCaptureTimestamp } from '../detection-time'

function localEpoch(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) {
  return new Date(y, m - 1, d, hh, mm, ss).getTime()
}

describe('parseTimestampFromText', () => {
  it('parses the dashed Mothbox patch id (Tucson style)', () => {
    expect(parseTimestampFromText('superDorada_2026-08-12T03-37-06-07-00_0_Mothbot_MBD-1-0.pt')).toBe(
      localEpoch(2026, 8, 12, 3, 37, 6),
    )
  })

  it('parses the underscore photo name (BionicBlitz style)', () => {
    expect(parseTimestampFromText('utterCoyote_2026_06_01__22_16_06_HDR0.jpg')).toBe(
      localEpoch(2026, 6, 1, 22, 16, 6),
    )
  })

  it('falls back to a bare date when there is no time', () => {
    expect(parseTimestampFromText('Cactus/superDorada_2026-08-11/notes.txt')).toBe(localEpoch(2026, 8, 11))
  })

  it('returns null when nothing date-like is present', () => {
    expect(parseTimestampFromText('patch_0_Mothbot.pt.jpg')).toBeNull()
    expect(parseTimestampFromText('')).toBeNull()
    expect(parseTimestampFromText(undefined)).toBeNull()
  })

  it('orders times within a night correctly across the midnight rollover', () => {
    const late = parseTimestampFromText('superDorada_2026-08-11T23-50-00-07-00')!
    const early = parseTimestampFromText('superDorada_2026-08-12T03-37-06-07-00')!
    expect(late).toBeLessThan(early)
  })
})

describe('resolveCaptureTimestamp', () => {
  it('prefers an explicit ISO captured_at', () => {
    const result = resolveCaptureTimestamp({
      capturedAt: '2026-08-12T03:37:06.000Z',
      photoId: 'superDorada_2020-01-01T00-00-00.jpg',
    })
    expect(result).toBe(Date.parse('2026-08-12T03:37:06.000Z'))
  })

  it('falls back to the photo id when captured_at is absent', () => {
    const result = resolveCaptureTimestamp({ photoId: 'superDorada_2026-08-12T03-37-06-07-00.jpg' })
    expect(result).toBe(localEpoch(2026, 8, 12, 3, 37, 6))
  })

  it('falls back to the patch id when there is no photo id', () => {
    const result = resolveCaptureTimestamp({ patchId: 'utterCoyote_2026_06_01__22_16_06_HDR0_1_Mothbot.pt' })
    expect(result).toBe(localEpoch(2026, 6, 1, 22, 16, 6))
  })

  it('parses a non-ISO captured_at rather than giving up', () => {
    const result = resolveCaptureTimestamp({ capturedAt: '2026_06_01__22_16_06' })
    expect(result).toBe(localEpoch(2026, 6, 1, 22, 16, 6))
  })

  it('returns null when no source carries a timestamp', () => {
    expect(resolveCaptureTimestamp({ photoId: 'photo.jpg', patchId: 'patch.pt' })).toBeNull()
    expect(resolveCaptureTimestamp({})).toBeNull()
  })
})
