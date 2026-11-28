/**
 * Ordering detection runs by recency.
 *
 * Detector ids are the model filenames Mothbot Process writes into each
 * detection JSON (`Mothbot_MBD-1-1.pt`, `Mothbot_yolo11m_…_2024-01-18.pt`,
 * `HumanDetection`). They do NOT sort chronologically as strings — "MBD" sorts
 * before "yolo" — so "newest" needs a version-aware rank:
 *
 *   tier 3  Anybug-…-v<major>-<minor>  newest generation; ranked by version
 *   tier 2  MBD-<major>-<minor>  ranked numerically
 *   tier 1  legacy models carrying a YYYY-MM-DD date; ranked by that date
 *   tier 0  any other bot id (unknown scheme); tie-broken by name
 *   tier -1 HumanDetection — a human annotation pass, never a "newer model"
 */
import { atom } from 'nanostores'

export const HUMAN_DETECTOR_ID = 'HumanDetection'

/**
 * Each night's current detection run, as Mothbot Process left it: the detector named
 * in the night's `_botdetection.json` files (older runs are renamed
 * `_botdetection_<model>.json`). Read from disk when a project opens
 * (add-new-nights.ts); keyed by night (camera day) id. It is the best guide to which run
 * is newest: model names don't say when a model was used.
 */
export const currentDetectorRunByNightStore = atom<Record<string, string>>({})

type DetectorRunRank = { tier: number; major: number; minor: number; date: string; id: string }

export function rankDetectorRun(id: string): DetectorRunRank {
  if (id === HUMAN_DETECTOR_ID) return { tier: -1, major: 0, minor: 0, date: '', id }
  const anybug = /Anybug.*?-v(\d+)-(\d+)/i.exec(id)
  if (anybug) return { tier: 3, major: Number(anybug[1]), minor: Number(anybug[2]), date: '', id }
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

/** The run choice that shows each night's own newest run (nights can differ). */
export const NEWEST_RUN_PER_NIGHT = 'newest-run-per-night'

export function detectorRunLabel(id: string | undefined): string {
  if (!id) return '—'
  return id === NEWEST_RUN_PER_NIGHT ? 'Newest run of each night' : id
}

/**
 * Each night's run to show: the run Mothbot Process last made for it when known,
 * else its newest model by name.
 */
export function runByNight(
  items: Iterable<{ leafGroupId?: string; detectorId?: string }>,
  currentByNight: Record<string, string> = currentDetectorRunByNightStore.get(),
): Record<string, string> {
  const idsByNight = new Map<string, Set<string>>()
  for (const item of items) {
    if (!item.leafGroupId || !item.detectorId) continue
    let ids = idsByNight.get(item.leafGroupId)
    if (!ids) idsByNight.set(item.leafGroupId, (ids = new Set()))
    ids.add(item.detectorId)
  }
  const out: Record<string, string> = {}
  for (const [night, ids] of idsByNight) {
    const current = currentByNight[night]
    const run = current && ids.has(current) ? current : newestDetectorId([...ids])
    if (run) out[night] = run
  }
  return out
}

/**
 * The run to show by default for some nights: the run Mothbot Process last made for
 * most of them (see `currentDetectorRunByNightStore`), else the newest model by name.
 */
export function defaultDetectorId(
  ids: readonly string[],
  nightIds: readonly string[] = [],
  currentByNight: Record<string, string> = currentDetectorRunByNightStore.get(),
): string | undefined {
  const votes = new Map<string, number>()
  for (const nightId of nightIds) {
    const current = currentByNight[nightId]
    if (current && ids.includes(current)) votes.set(current, (votes.get(current) ?? 0) + 1)
  }
  let best: string | undefined
  for (const [id, count] of votes) if (!best || count > (votes.get(best) ?? 0)) best = id
  return best ?? newestDetectorId(ids)
}

/**
 * One night's items from a single detection run: *preferred* when the night has
 * it, otherwise its current run (or newest by name). Re-running Detect keeps the older run beside the
 * new one, so counting or drawing every run would show the night's insects twice.
 * Pass one night at a time — runs are chosen per night.
 */
export function itemsOfOneRun<T extends { detectorId?: string }>(items: T[], preferred?: string, nightId?: string): T[] {
  const ids = new Set<string>()
  for (const item of items) if (item.detectorId) ids.add(item.detectorId)
  if (ids.size <= 1) return items
  const run = preferred && ids.has(preferred) ? preferred : defaultDetectorId([...ids], nightId ? [nightId] : [])
  return items.filter((item) => item.detectorId === run)
}
