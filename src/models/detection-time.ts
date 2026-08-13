/**
 * Resolving a capture timestamp for a detection.
 *
 * `captured_at` is only present in some packages (AMI records set it; the
 * dinalab adapter generally doesn't), but Mothbox filenames always carry the
 * capture time. Two naming styles are in use across datasets:
 *
 *   superDorada_2026-08-12T03-37-06-07-00_0_Mothbot_MBD-1-0.pt   (dashes)
 *   utterCoyote_2026_06_01__22_16_06_HDR0.jpg                    (underscores)
 *
 * Values are read as local wall-clock time and any trailing UTC offset is
 * ignored. For ordering within a deployment that's both sufficient and more
 * useful than true UTC — "what visited at 3am" is a clock-time question.
 */

/** `2026-08-12T03-37-06` (optionally followed by a `-07-00` offset). */
const DASHED_DATETIME = /(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/
/** `2026_06_01__22_16_06` */
const UNDERSCORE_DATETIME = /(\d{4})_(\d{2})_(\d{2})__(\d{2})_(\d{2})_(\d{2})/
/** Bare `2026-08-12`, used as a last resort so at least the day orders right. */
const DATE_ONLY = /(\d{4})-(\d{2})-(\d{2})/

function toEpoch(parts: string[]): number | null {
  const [year, month, day, hour = '0', minute = '0', second = '0'] = parts
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  const time = date.getTime()
  return Number.isNaN(time) ? null : time
}

/** Extracts a capture time from any Mothbox-style filename or id. */
export function parseTimestampFromText(text?: string | null): number | null {
  const value = (text ?? '').trim()
  if (!value) return null

  const dashed = value.match(DASHED_DATETIME)
  if (dashed) return toEpoch(dashed.slice(1))

  const underscore = value.match(UNDERSCORE_DATETIME)
  if (underscore) return toEpoch(underscore.slice(1))

  const dateOnly = value.match(DATE_ONLY)
  if (dateOnly) return toEpoch(dateOnly.slice(1))

  return null
}

type TimestampSources = {
  /** ISO string from package records, when the adapter recorded one. */
  capturedAt?: string
  photoId?: string
  patchId?: string
  fileName?: string
}

/**
 * Best-available capture time in epoch ms, or null when nothing parses.
 *
 * Prefers an explicit `captured_at`, then falls back to the photo id (the
 * source photo's name, which is where the timestamp actually lives), then the
 * patch id and file name.
 */
export function resolveCaptureTimestamp(sources: TimestampSources): number | null {
  const { capturedAt, photoId, patchId, fileName } = sources

  if (capturedAt) {
    const parsed = Date.parse(capturedAt)
    if (!Number.isNaN(parsed)) return parsed
    const fromText = parseTimestampFromText(capturedAt)
    if (fromText != null) return fromText
  }

  for (const candidate of [photoId, fileName, patchId]) {
    const parsed = parseTimestampFromText(candidate)
    if (parsed != null) return parsed
  }

  return null
}
