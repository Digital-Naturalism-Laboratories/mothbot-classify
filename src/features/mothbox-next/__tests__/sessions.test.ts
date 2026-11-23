import { describe, expect, it } from 'vitest'
import {
  defaultNightlySession,
  findSessionForTime,
  parseSessionRecords,
  parseSessionsFile,
  serializeSessionRecords,
  wallClockEpoch,
} from '../sessions'
import { parseTimestampFromText } from '~/models/detection-time'

const file = JSON.stringify({
  format: 'mothbox-sessions',
  formatVersion: 1,
  deploymentID: 'DepA',
  sessions: [
    {
      sessionID: 'DepA__2026-07-27',
      start: '2026-07-27T12:00:00-05:00',
      end: '2026-07-28T11:59:59-05:00',
      definedBy: 'nightly-noon-to-noon',
      captureWindows: [{ captureWindowID: 'DepA__2026-07-27__w1', start: '2026-07-27T19:00:00-05:00', end: '2026-07-27T19:59:00-05:00' }],
    },
    { sessionID: 'broken' },
  ],
})

describe('sessions', () => {
  it('reads a Process sessions file, skipping broken entries', () => {
    const sessions = parseSessionsFile(file)
    expect(sessions.map((s) => s.sessionID)).toEqual(['DepA__2026-07-27'])
    expect(sessions[0]?.deploymentID).toBe('DepA')
    expect(parseSessionsFile('not json')).toEqual([])
  })

  it('matches captures by local clock time, ignoring the offset', () => {
    const sessions = parseSessionsFile(file)
    const inWindow = parseTimestampFromText('cam_2026-07-27T19-30-00-05-00_HDR0.jpg')!
    expect(findSessionForTime(sessions, inWindow)).toMatchObject({
      session: { sessionID: 'DepA__2026-07-27' },
      window: { captureWindowID: 'DepA__2026-07-27__w1' },
    })
    // After midnight: same night, no capture window listed.
    const late = parseTimestampFromText('cam_2026_07_28__02_00_00_HDR0.jpg')!
    const match = findSessionForTime(sessions, late)
    expect(match?.session.sessionID).toBe('DepA__2026-07-27')
    expect(match?.window).toBeUndefined()
    expect(findSessionForTime(sessions, wallClockEpoch('2026-07-28T13:00:00')!)).toBeNull()
  })

  it('makes the default noon-to-noon session for a night', () => {
    expect(defaultNightlySession({ deploymentID: 'DepA', nightDate: '2026-12-31' })).toEqual({
      sessionID: 'DepA__2026-12-31',
      deploymentID: 'DepA',
      start: '2026-12-31T12:00:00',
      end: '2027-01-01T11:59:59',
      definedBy: 'nightly-noon-to-noon',
    })
    expect(defaultNightlySession({ deploymentID: 'DepA', nightDate: 'unknown-night' })).toBeNull()
  })

  it('round-trips the package sessions file', () => {
    const sessions = parseSessionsFile(file)
    expect(parseSessionRecords(serializeSessionRecords(sessions) + 'garbage\n')).toEqual(sessions)
  })
})
