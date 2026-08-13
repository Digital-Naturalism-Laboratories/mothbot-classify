import { describe, expect, it } from 'vitest'
import {
  appendNdjsonRows,
  appendNdjsonRowsByKey,
  dirnameOf,
  findUningestedNightFolders,
  isPathInFolders,
  parseNdjson,
} from '../incremental-nights'

describe('findUningestedNightFolders', () => {
  it('finds the night that has detections on disk but no patches in records', () => {
    // Mirrors the real Tucson/DesertHouse case: 08-11 ingested, 08-12 not.
    const result = findUningestedNightFolders({
      botDetectionPaths: [
        'Cactus/superDorada_2026-08-11/superDorada_2026-08-11T20-01-22_botdetection.json',
        'Cactus/superDorada_2026-08-12/superDorada_2026-08-12T20-22-06_botdetection.json',
        'Cactus/superDorada_2026-08-12/superDorada_2026-08-12T20-23-21_botdetection.json',
      ],
      existingAssetPaths: [
        'Cactus/superDorada_2026-08-11/superDorada_2026-08-12T03-37-06_0_Mothbot.pt.jpg',
        'Cactus/superDorada_2026-08-11/superDorada_2026-08-11T20-01-22_0_Mothbot.pt.jpg',
      ],
    })
    expect(result).toEqual(['Cactus/superDorada_2026-08-12'])
  })

  it('is not fooled by patch filenames dated past midnight', () => {
    // A night folder dated 08-11 legitimately holds 08-12 timestamps (noon
    // split). Matching on folder path, not date, keeps that night "ingested".
    const result = findUningestedNightFolders({
      botDetectionPaths: ['Cactus/superDorada_2026-08-11/x_botdetection.json'],
      existingAssetPaths: ['Cactus/superDorada_2026-08-11/superDorada_2026-08-12T03-37-06_0.jpg'],
    })
    expect(result).toEqual([])
  })

  it('returns nothing when every night is already ingested', () => {
    expect(
      findUningestedNightFolders({
        botDetectionPaths: ['A/night1/x_botdetection.json'],
        existingAssetPaths: ['A/night1/p.jpg'],
      }),
    ).toEqual([])
  })

  it('reports multiple new nights, sorted and deduped', () => {
    const result = findUningestedNightFolders({
      botDetectionPaths: [
        'B/night3/a_botdetection.json',
        'B/night3/b_botdetection.json',
        'A/night2/c_botdetection.json',
      ],
      existingAssetPaths: [],
    })
    expect(result).toEqual(['A/night2', 'B/night3'])
  })
})

describe('appendNdjsonRowsByKey', () => {
  it('preserves existing lines byte-for-byte and appends only new keys', () => {
    const existing = '{"patch_id":"p1","classifier_id":"aq"}\n{"patch_id":"p2","classifier_id":"aq"}\n'
    const result = appendNdjsonRowsByKey({
      existingText: existing,
      additions: [{ patch_id: 'p2', classifier_id: 'bot' }, { patch_id: 'p3', classifier_id: 'bot' }],
      key: 'patch_id',
    })

    expect(result.addedCount).toBe(1)
    expect(result.text.startsWith(existing)).toBe(true)
    // p2 was already identified by a human — it must NOT be overwritten.
    expect(result.text).toContain('{"patch_id":"p2","classifier_id":"aq"}')
    expect(result.text).toContain('{"patch_id":"p3","classifier_id":"bot"}')
    expect(parseNdjson(result.text)).toHaveLength(3)
  })

  it('makes no change when every addition already exists', () => {
    const existing = '{"patch_id":"p1"}\n'
    const result = appendNdjsonRowsByKey({
      existingText: existing,
      additions: [{ patch_id: 'p1' }],
      key: 'patch_id',
    })
    expect(result.addedCount).toBe(0)
    expect(result.text).toBe(existing)
  })

  it('adds a missing trailing newline before appending', () => {
    const result = appendNdjsonRowsByKey({
      existingText: '{"patch_id":"p1"}',
      additions: [{ patch_id: 'p2' }],
      key: 'patch_id',
    })
    expect(result.text).toBe('{"patch_id":"p1"}\n{"patch_id":"p2"}\n')
  })

  it('works from an empty file', () => {
    const result = appendNdjsonRowsByKey({
      existingText: '',
      additions: [{ camera_day_id: 'Cactus__2026-08-12' }],
      key: 'camera_day_id',
    })
    expect(result.addedCount).toBe(1)
    expect(result.text).toBe('{"camera_day_id":"Cactus__2026-08-12"}\n')
  })

  it('dedupes within the additions themselves', () => {
    const result = appendNdjsonRowsByKey({
      existingText: '',
      additions: [{ deployment_id: 'Cactus' }, { deployment_id: 'Cactus' }],
      key: 'deployment_id',
    })
    expect(result.addedCount).toBe(1)
  })

  it('survives a malformed existing line without dropping the file', () => {
    const existing = '{"patch_id":"p1"}\nnot json\n'
    const result = appendNdjsonRowsByKey({
      existingText: existing,
      additions: [{ patch_id: 'p1' }, { patch_id: 'p2' }],
      key: 'patch_id',
    })
    // p1 still recognised as present; the bad line is left untouched.
    expect(result.addedCount).toBe(1)
    expect(result.text).toContain('not json')
  })
})

describe('appendNdjsonRows', () => {
  it('appends unconditionally', () => {
    const result = appendNdjsonRows({ existingText: '{"a":1}\n', additions: [{ a: 1 }, { a: 2 }] })
    expect(result.addedCount).toBe(2)
    expect(parseNdjson(result.text)).toHaveLength(3)
  })

  it('leaves the file alone when there is nothing to add', () => {
    const result = appendNdjsonRows({ existingText: '{"a":1}\n', additions: [] })
    expect(result.addedCount).toBe(0)
    expect(result.text).toBe('{"a":1}\n')
  })
})

describe('path helpers', () => {
  it('extracts the folder from a relative path', () => {
    expect(dirnameOf('Cactus/night/file.jpg')).toBe('Cactus/night')
    expect(dirnameOf('file.jpg')).toBe('')
    expect(dirnameOf('Cactus\\night\\file.jpg')).toBe('Cactus/night')
  })

  it('matches paths inside a folder without matching a similar prefix', () => {
    const folders = new Set(['Cactus/night2'])
    expect(isPathInFolders('Cactus/night2/a.jpg', folders)).toBe(true)
    expect(isPathInFolders('Cactus/night2', folders)).toBe(true)
    expect(isPathInFolders('Cactus/night20/a.jpg', folders)).toBe(false)
    expect(isPathInFolders('Cactus/night1/a.jpg', folders)).toBe(false)
  })
})
