/**
 * Sessions and capture windows (ontology: Session, Capture Window).
 *
 * Mothbot Process writes each deployment's sessions to `_processed/<deployment>/sessions.json`
 * (see Mothbot_Process `pipeline/sessions.py`). The adapter reads that file, keeps the
 * sessions in the package (`02_records/sessions.ndjson`), and gives every patch the
 * session and capture window its capture time falls in. A deployment without a file gets
 * the default: one session per night, noon to 11:59:59 the next morning, with the same
 * id as the night (`<deployment>__<YYYY-MM-DD>`).
 *
 * Times are compared as local wall-clock time, like the photo file names they come from;
 * a trailing UTC offset is kept in the record but ignored when matching.
 * Field names are camelCase, as decided for new files (ontology: Field Names).
 */

export const PACKAGE_SESSIONS_RECORD = '02_records/sessions.ndjson'
export const SESSIONS_FILE_NAME = 'sessions.json'
export const DEFAULT_SESSION_RULE = 'nightly-noon-to-noon'

export type CaptureWindowRecord = {
  captureWindowID: string
  start: string
  end: string
  captureIntervalSeconds?: number
  captureCount?: number
}

export type SessionRecord = {
  sessionID: string
  deploymentID?: string
  start: string
  end: string
  /** How the session was defined: `nightly-noon-to-noon` by default, or `manual`. */
  definedBy?: string
  captureWindows?: CaptureWindowRecord[]
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/

/** Local wall-clock time of an ISO string as epoch ms (offset ignored), or null. */
export function wallClockEpoch(iso?: string | null): number | null {
  const m = WALL_CLOCK.exec((iso ?? '').trim())
  if (!m) return null
  const time = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)).getTime()
  return Number.isNaN(time) ? null : time
}

function isSession(value: unknown): value is SessionRecord {
  const v = value as SessionRecord
  return !!v && typeof v === 'object' && typeof v.sessionID === 'string' && !!v.sessionID && typeof v.start === 'string' && typeof v.end === 'string'
}

/** Sessions from a Process `sessions.json`, or [] when it can't be read. */
export function parseSessionsFile(text: string, deploymentID?: string): SessionRecord[] {
  try {
    const data = JSON.parse(text) as { sessions?: unknown; deploymentID?: unknown }
    if (!Array.isArray(data?.sessions)) return []
    const fileDeployment = typeof data.deploymentID === 'string' ? data.deploymentID : undefined
    return data.sessions.filter(isSession).map((s) => ({ ...s, deploymentID: deploymentID ?? s.deploymentID ?? fileDeployment }))
  } catch {
    return []
  }
}

/** Sessions from the package's `02_records/sessions.ndjson`; damaged lines are skipped. */
export function parseSessionRecords(text: string): SessionRecord[] {
  const out: SessionRecord[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const value = JSON.parse(trimmed)
      if (isSession(value)) out.push(value)
    } catch {
      // skip a damaged line rather than lose the rest
    }
  }
  return out
}

/** The session (and capture window, if any) a capture time falls in. */
export function findSessionForTime(
  sessions: readonly SessionRecord[],
  capturedAt: number,
): { session: SessionRecord; window?: CaptureWindowRecord } | null {
  for (const session of sessions) {
    const start = wallClockEpoch(session.start)
    const end = wallClockEpoch(session.end)
    if (start == null || end == null || capturedAt < start || capturedAt > end) continue
    const window = session.captureWindows?.find((w) => {
      const ws = wallClockEpoch(w.start)
      const we = wallClockEpoch(w.end)
      return ws != null && we != null && capturedAt >= ws && capturedAt <= we
    })
    return { session, ...(window ? { window } : {}) }
  }
  return null
}

/** The default session for a night: noon to 11:59:59 the next morning, named like the night. */
export function defaultNightlySession(params: { deploymentID: string; nightDate: string; sessionID?: string }): SessionRecord | null {
  const { deploymentID, nightDate } = params
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nightDate)
  if (!m) return null
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
  const nextDate = next.toISOString().slice(0, 10)
  return {
    sessionID: params.sessionID ?? `${deploymentID}__${nightDate}`,
    deploymentID,
    start: `${nightDate}T12:00:00`,
    end: `${nextDate}T11:59:59`,
    definedBy: DEFAULT_SESSION_RULE,
  }
}

export function serializeSessionRecords(sessions: readonly SessionRecord[]): string {
  return sessions.map((s) => JSON.stringify(s)).join('\n') + (sessions.length ? '\n' : '')
}
