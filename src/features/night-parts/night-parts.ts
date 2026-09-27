import { resolveCaptureTimestamp } from '~/models/detection-time'
import type { PatchEntity } from '~/stores/entities/5.patches'

/**
 * Nights with more patches than this in view are shown one part at a time.
 *
 * Almost every Classify interaction (accept, identify, cluster edits) re-derives
 * the night view from scratch — sorting the grid, rebuilding the taxonomy
 * trees, recounting buckets — so its cost grows with the number of patches on
 * screen. Measured in Chrome on an M-series Mac, accepting one detection took
 * ~1.3 s with 161k patches in view; typical nights (1–10k) stay well under
 * 100 ms. Splitting keeps swarm nights (50k–160k+) responsive without changing
 * anything for ordinary ones.
 */
export const LARGE_NIGHT_PATCH_THRESHOLD = 25_000

/** Parts aim for about this many patches, balanced evenly across the night. */
export const NIGHT_PART_TARGET_SIZE = 15_000

export type NightPart = {
  /** 0-based position in capture-time order. */
  index: number
  patchIds: Set<string>
  count: number
  /** Wall-clock capture time of the first/last photo in the part, when known. */
  startMs: number | null
  endMs: number | null
}

type PhotoGroup = { key: string; time: number | null; ids: string[] }

/**
 * Splits a night's patches into capture-time-ordered parts. Returns `[]` when
 * the night is small enough to show whole (the common case).
 *
 * Patches are grouped by source photo first, so one photo's detections — a
 * swarm frame can hold thousands — never straddle two parts. This is purely a
 * view split: patch/detection ids and leafGroupIds are untouched, so saves,
 * cluster overrides, and exports still see one night.
 */
export function buildNightParts(params: {
  patches: PatchEntity[]
  threshold?: number
  targetSize?: number
}): NightPart[] {
  const { patches, threshold = LARGE_NIGHT_PATCH_THRESHOLD, targetSize = NIGHT_PART_TARGET_SIZE } = params
  if (patches.length <= threshold) return []

  const byPhoto = new Map<string, PhotoGroup>()
  for (const patch of patches) {
    const key = patch.photoId || patch.id
    let group = byPhoto.get(key)
    if (!group) {
      // Resolve the time once per photo — every patch in a photo shares it.
      const time = resolveCaptureTimestamp({
        capturedAt: patch.capturedAt,
        photoId: patch.photoId,
        patchId: patch.id,
        fileName: patch.imageFile?.name,
      })
      group = { key, time, ids: [] }
      byPhoto.set(key, group)
    }
    group.ids.push(patch.id)
  }

  const photos = [...byPhoto.values()].sort(comparePhotoGroups)

  // Balance: pick the part count first, then fill each part to an even share.
  const partCount = Math.max(1, Math.ceil(patches.length / Math.max(1, targetSize)))
  const perPart = Math.ceil(patches.length / partCount)

  const parts: NightPart[] = []
  let current: NightPart | null = null
  for (const photo of photos) {
    if (!current || (current.count > 0 && current.count + photo.ids.length > perPart)) {
      if (current) parts.push(current)
      current = { index: parts.length, patchIds: new Set(), count: 0, startMs: photo.time, endMs: photo.time }
    }
    for (const id of photo.ids) current.patchIds.add(id)
    current.count += photo.ids.length
    if (photo.time != null) {
      if (current.startMs == null || photo.time < current.startMs) current.startMs = photo.time
      if (current.endMs == null || photo.time > current.endMs) current.endMs = photo.time
    }
  }
  if (current) parts.push(current)

  // Greedy packing can leave a sliver at the end; fold it into the previous part.
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  if (last && prev && last.count < perPart * 0.25) {
    for (const id of last.patchIds) prev.patchIds.add(id)
    prev.count += last.count
    if (last.endMs != null && (prev.endMs == null || last.endMs > prev.endMs)) prev.endMs = last.endMs
    if (prev.startMs == null) prev.startMs = last.startMs
    parts.pop()
  }

  return parts
}

function comparePhotoGroups(a: PhotoGroup, b: PhotoGroup): number {
  // Undated photos sort last rather than landing at the epoch.
  if (a.time != null && b.time != null && a.time !== b.time) return a.time - b.time
  if (a.time == null && b.time != null) return 1
  if (a.time != null && b.time == null) return -1
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

/**
 * "19:04–20:31" in the camera's wall-clock time, or "undated". `withDate`
 * prefixes "07-27 " for multi-night views, where a bare clock time is ambiguous.
 */
export function formatNightPartTimeRange(
  part: Pick<NightPart, 'startMs' | 'endMs'>,
  options?: { withDate?: boolean },
): string {
  if (part.startMs == null || part.endMs == null) return 'undated'
  const withDate = options?.withDate ?? false
  const start = formatClock(part.startMs, withDate)
  const end = formatClock(part.endMs, withDate)
  return start === end ? start : `${start}–${end}`
}

function formatClock(ms: number, withDate: boolean): string {
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return withDate ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clock}` : clock
}
