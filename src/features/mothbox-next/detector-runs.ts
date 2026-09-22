/**
 * Ordering detection runs by recency.
 *
 * Detector ids are the model filenames Mothbot Process writes into each
 * detection JSON (`Mothbot_MBD-1-1.pt`, `Mothbot_yolo11m_…_2024-01-18.pt`,
 * `HumanDetection`). They do NOT sort chronologically as strings — "MBD" sorts
 * before "yolo" — so "newest" needs a version-aware rank:
 *
 *   tier 2  MBD-<major>-<minor>  current generation; ranked numerically
 *   tier 1  legacy models carrying a YYYY-MM-DD date; ranked by that date
 *   tier 0  any other bot id (unknown scheme); tie-broken by name
 *   tier -1 HumanDetection — a human annotation pass, never a "newer model"
 */
export const HUMAN_DETECTOR_ID = 'HumanDetection'

type DetectorRunRank = { tier: number; major: number; minor: number; date: string; id: string }

export function rankDetectorRun(id: string): DetectorRunRank {
  if (id === HUMAN_DETECTOR_ID) return { tier: -1, major: 0, minor: 0, date: '', id }
  const mbd = /MBD-(\d+)-(\d+)/i.exec(id)
  if (mbd) return { tier: 2, major: Number(mbd[1]), minor: Number(mbd[2]), date: '', id }
  const dated = /(\d{4}-\d{2}-\d{2})/.exec(id)
  if (dated) return { tier: 1, major: 0, minor: 0, date: dated[1], id }
  return { tier: 0, major: 0, minor: 0, date: '', id }
}

/** Sort comparator: newest run first. */
export function compareDetectorRunsNewestFirst(a: string, b: string): number {
  const ra = rankDetectorRun(a)
  const rb = rankDetectorRun(b)
  if (ra.tier !== rb.tier) return rb.tier - ra.tier
  if (ra.major !== rb.major) return rb.major - ra.major
  if (ra.minor !== rb.minor) return rb.minor - ra.minor
  if (ra.date !== rb.date) return rb.date.localeCompare(ra.date)
  return rb.id.localeCompare(ra.id)
}

export function sortDetectorRunsNewestFirst(ids: readonly string[]): string[] {
  return [...ids].sort(compareDetectorRunsNewestFirst)
}

/**
 * The run to show by default: the newest bot model. Falls back to
 * HumanDetection only when it's the sole run available.
 */
export function newestDetectorId(ids: readonly string[]): string | undefined {
  const sorted = sortDetectorRunsNewestFirst(ids)
  return sorted.find((id) => id !== HUMAN_DETECTOR_ID) ?? sorted[0]
}
