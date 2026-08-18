/**
 * Silhouette packing for insect-patch mosaics — a TypeScript port of the
 * standalone `mothviz` Python tool. Packs transparent patch silhouettes into a
 * vertical **bar** (fills bottom-up), a dense **radial** disc (centre-outward),
 * or a **shape** (into a base-mask silhouette), interlocking along their real
 * edges via a pixel-occupancy grid.
 *
 * The geometry is deliberately split from the canvas work:
 *   - `prepareItem` / `drawMosaic` touch the canvas (OffscreenCanvas).
 *   - `computePlacements` is pure (masks in, positions out) so it is unit-tested
 *     without any DOM/canvas.
 */

export const ALPHA_THRESHOLD = 50

export type PackLayout = 'bar' | 'radial' | 'shape'

/** A tight silhouette mask plus the metadata needed to place and draw it. */
export type PreparedItem = {
  id: string
  /** scaled draw size of the whole patch */
  sw: number
  sh: number
  /** tight (dilated) mask bounding box size */
  mw: number
  mh: number
  /** set-pixel coordinates within the mask (parallel arrays) */
  maskR: Uint16Array
  maskC: Uint16Array
  /** offset of the mask's top-left within the scaled patch */
  offR: number
  offC: number
  /** quality metrics */
  focus: number
  opaque: number
}

export type Placement = { index: number; dx: number; dy: number }

export type PackGeomOptions = {
  layout: PackLayout
  width: number
  /** shape layout only: boolean fill mask + its dimensions */
  baseMask?: { data: Uint8Array; w: number; h: number } | null
  seed?: number
}

export type PackStats = { placed: number; noFit: number; skipped: number; total: number }

export type PackGeomResult = {
  placements: Placement[]
  width: number
  height: number
  stats: PackStats
  /** radial/shape: farthest silhouette extent from `center` (px). 0 for bar. */
  contentRadius: number
  center: { x: number; y: number }
}

// Radial/shape candidate-spiral knobs (mirror the Python tool).
//
// Candidate spacing (`step`) is what sets packing density: it should track the
// silhouette size, so a wider canvas simply holds proportionally more items.
// Capping the candidate *count* instead makes `step` grow with the canvas —
// which is why a 16000px export placed exactly as many insects as a 6000px one
// and merely spread them further apart. The cap exists solely to bound memory,
// so it must be loose enough never to bind at realistic sizes.
const CAND_CAP_MAX = 8_000_000
const CAND_WINDOW = 1500
/**
 * Failed placement attempts before an item is given up on.
 *
 * At 6000 this was the real ceiling on a big night: once the disc got dense,
 * every remaining item burned its whole budget and was dropped, so placement
 * plateaued at the same count no matter how wide the canvas was. Raising it is
 * also *faster* overall — items succeed instead of exhausting the budget first.
 */
const CAND_MAX_PROBE = 40_000

/**
 * Candidate points the spiral will actually retain — those landing inside the
 * canvas, roughly one per `step²` of area.
 *
 * The old estimate used `π·(diagonal/step)²`, which counts the circumscribed
 * disc and overstates the real count by ~6×, forcing a far coarser step than
 * the memory budget required.
 */
function estimateCandidates(W: number, H: number, step: number): number {
  return (W * H) / (step * step)
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic RNG (mulberry32) so renders are reproducible per seed.
// ─────────────────────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure geometry: compute placements from prepared masks.
// ─────────────────────────────────────────────────────────────────────────────

export function computePlacements(items: PreparedItem[], opts: PackGeomOptions): PackGeomResult {
  if (opts.layout === 'bar') return packBar(items, opts)
  return packCanvas(items, opts)
}

/** Bottom-up shelf packing; width fixed, height grows (then cropped). */
function packBar(items: PreparedItem[], opts: PackGeomOptions): PackGeomResult {
  const W = Math.max(1, Math.floor(opts.width))

  // Estimate a generous height from average scaled sizes, then crop to used.
  let avgH = 0, avgW = 0
  for (const it of items) { avgH += it.mh; avgW += it.mw }
  avgH = items.length ? avgH / items.length : 100
  avgW = items.length ? Math.max(1, avgW / items.length) : 100
  const perRow = Math.max(1, Math.floor(W / avgW))
  const H = Math.max(2000, Math.ceil((avgH * (items.length / perRow + 1)) * 2.2))

  const occ = new Uint8Array(W * H)
  const placements: Placement[] = []
  let shelfTop = H          // bottom edge of the current shelf (exclusive)
  let shelfX = 0
  let shelfH = 0
  let highest = H
  let placed = 0, noFit = 0

  const fitsRow = (it: PreparedItem, row: number, startX: number): number => {
    let x = startX
    while (x + it.mw <= W) {
      if (!overlaps(occ, W, it, row, x)) return x
      x++
    }
    return -1
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!
    if (it.mw > W) { noFit++; continue }
    let row = shelfTop - it.mh
    if (row < 0) { noFit++; continue }
    let x = fitsRow(it, row, shelfX)
    if (x < 0) {
      // open a new shelf above
      shelfTop -= Math.max(shelfH, 1)
      shelfX = 0; shelfH = 0
      row = shelfTop - it.mh
      if (row < 0) { noFit++; continue }
      x = fitsRow(it, row, 0)
      if (x < 0) { noFit++; continue }
    }
    stamp(occ, W, it, row, x)
    placements.push({ index: i, dx: x - it.offC, dy: row - it.offR })
    shelfX = x + it.mw
    shelfH = Math.max(shelfH, it.mh)
    highest = Math.min(highest, row)
    placed++
  }

  const cropTop = Math.max(0, highest)
  // Shift placements so the used region starts at y=0.
  for (const p of placements) p.dy -= cropTop
  const finalH = Math.max(1, H - cropTop)
  return {
    placements,
    width: W,
    height: finalH,
    stats: { placed, noFit, skipped: 0, total: items.length },
    contentRadius: 0, // not meaningful for a bar
    center: { x: W / 2, y: finalH / 2 },
  }
}

/** Dense centre-outward packing on a fixed canvas; optional base-mask (shape). */
function packCanvas(items: PreparedItem[], opts: PackGeomOptions): PackGeomResult {
  const W = Math.max(1, Math.floor(opts.width))
  let H = W
  let base: Uint8Array | null = null
  if (opts.layout === 'shape' && opts.baseMask) {
    base = opts.baseMask.data
    H = opts.baseMask.h
  }

  const occ = new Uint8Array(W * H)
  let cx = W >> 1, cy = H >> 1
  if (base) {
    let sx = 0, sy = 0, n = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (base[y * W + x]) { sx += x; sy += y; n++ }
    if (n) { cx = Math.round(sx / n); cy = Math.round(sy / n) }
  }

  // Candidate spiral step ~ half the median silhouette, bounded so the list stays small.
  // Density comes from the silhouette size and stays fixed regardless of canvas
  // size; `step` only grows if the candidate arrays would get too big to hold.
  const med = medianMinDim(items)
  let step = Math.max(3, Math.floor(med / 2))
  const maxR = Math.hypot(W, H)
  while (estimateCandidates(W, H, step) > CAND_CAP_MAX) step++
  const { ys, xs } = spiralPoints(cx, cy, maxR, step, W, H, base)
  const nCand = ys.length
  const dead = new Uint8Array(nCand)

  const placements: Placement[] = []
  let placed = 0, noFit = 0
  let cursor = 0

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!
    const ro = it.mh >> 1, co = it.mw >> 1
    let probes = 0
    let done = false
    // forward from cursor, then wrap to the gaps behind it
    for (let pass = 0; pass < 2 && !done; pass++) {
      const start = pass === 0 ? cursor : 0
      const end = pass === 0 ? nCand : cursor
      for (let k = start; k < end; k++) {
        if (dead[k]) continue
        const sy = ys[k]!, sx = xs[k]!
        if (occ[sy * W + sx]) { dead[k] = 1; continue }
        const row = sy - ro, col = sx - co
        if (canPlace(occ, W, H, base, it, row, col)) {
          stamp(occ, W, it, row, col)
          placements.push({ index: i, dx: col - it.offC, dy: row - it.offR })
          cursor = Math.max(0, k - CAND_WINDOW)
          placed++
          done = true
          break
        }
        if (++probes >= CAND_MAX_PROBE) break
      }
    }
    if (!done) noFit++
  }

  // Farthest silhouette corner from the centre → the packed disc radius.
  let contentRadius = 0
  for (const p of placements) {
    const it = items[p.index]!
    const top = p.dy + it.offR, left = p.dx + it.offC
    for (const [yy, xx] of [[top, left], [top, left + it.mw], [top + it.mh, left], [top + it.mh, left + it.mw]] as const) {
      const d = Math.hypot(yy - cy, xx - cx)
      if (d > contentRadius) contentRadius = d
    }
  }

  return {
    placements, width: W, height: H,
    stats: { placed, noFit, skipped: 0, total: items.length },
    contentRadius, center: { x: cx, y: cy },
  }
}

// ── occupancy + placement helpers ────────────────────────────────────────────

function overlaps(occ: Uint8Array, W: number, it: PreparedItem, row: number, col: number): boolean {
  const { maskR, maskC } = it
  for (let k = 0; k < maskR.length; k++) {
    if (occ[(row + maskR[k]!) * W + (col + maskC[k]!)]) return true
  }
  return false
}

function stamp(occ: Uint8Array, W: number, it: PreparedItem, row: number, col: number): void {
  const { maskR, maskC } = it
  for (let k = 0; k < maskR.length; k++) occ[(row + maskR[k]!) * W + (col + maskC[k]!)] = 1
}

function canPlace(
  occ: Uint8Array, W: number, H: number, base: Uint8Array | null,
  it: PreparedItem, row: number, col: number,
): boolean {
  if (row < 0 || col < 0 || row + it.mh > H || col + it.mw > W) return false
  const { maskR, maskC } = it
  for (let k = 0; k < maskR.length; k++) {
    const idx = (row + maskR[k]!) * W + (col + maskC[k]!)
    if (occ[idx]) return false
    if (base && !base[idx]) return false
  }
  return true
}

function medianMinDim(items: PreparedItem[]): number {
  if (!items.length) return 40
  const dims: number[] = []
  const stepN = Math.max(1, Math.floor(items.length / 80))
  for (let i = 0; i < items.length; i += stepN) dims.push(Math.min(items[i]!.mw, items[i]!.mh))
  dims.sort((a, b) => a - b)
  return dims[dims.length >> 1] || 40
}

/**
 * Centre-outward Archimedean spiral of in-bounds (and optionally in-mask) points.
 *
 * Dedupes through a W×H visited bitmap rather than a Set — at the candidate
 * counts a large night needs (~1M+), a Set of boxed keys costs far more memory
 * and time than one byte per pixel. Results grow into typed arrays for the same
 * reason.
 */
function spiralPoints(
  cx: number, cy: number, maxR: number, step: number,
  W: number, H: number, base: Uint8Array | null,
): { ys: Int32Array; xs: Int32Array } {
  const visited = new Uint8Array(W * H)
  let capacity = 1 << 16
  let ys = new Int32Array(capacity)
  let xs = new Int32Array(capacity)
  let n = 0

  let r = 0, theta = 0
  while (r <= maxR) {
    const y = Math.round(cy + r * Math.sin(theta))
    const x = Math.round(cx + r * Math.cos(theta))
    if (y >= 0 && y < H && x >= 0 && x < W) {
      const key = y * W + x
      if (!visited[key] && (!base || base[key])) {
        visited[key] = 1
        if (n === capacity) {
          capacity *= 2
          const nextYs = new Int32Array(capacity)
          const nextXs = new Int32Array(capacity)
          nextYs.set(ys)
          nextXs.set(xs)
          ys = nextYs
          xs = nextXs
        }
        ys[n] = y
        xs[n] = x
        n++
      }
    }
    theta += step / Math.max(r, step)
    r = (step * theta) / (2 * Math.PI)
  }

  return { ys: ys.subarray(0, n), xs: xs.subarray(0, n) }
}
