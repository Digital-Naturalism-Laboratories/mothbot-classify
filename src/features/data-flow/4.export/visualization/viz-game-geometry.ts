/**
 * Pure geometry for the Mothball game-level export (see `viz-game-level.ts`):
 * silhouette bounds, collision hulls and texture-atlas packing. No canvas here,
 * so all of it is unit-tested.
 *
 * Coordinates are image pixels, y down, matching the game's physics world.
 */

/** Width × height RGBA pixels, as `ImageData` provides them. */
export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray }

/** Half-open pixel box: x0 ≤ x < x1, y0 ≤ y < y1. */
export type PixelBox = { x0: number; y0: number; x1: number; y1: number }

/** Tight box around pixels whose alpha is above `threshold`, or null when none are. */
export function alphaBounds(img: RgbaImage, threshold: number): PixelBox | null {
  const { width: w, height: h, data } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > threshold) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 }
}

/** 1 where alpha is above `threshold`, else 0 (row-major, width × height). */
export function alphaMask(img: RgbaImage, threshold: number): Uint8Array {
  const n = img.width * img.height
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (img.data[i * 4 + 3]! > threshold) mask[i] = 1
  return mask
}

export function countSet(mask: Uint8Array): number {
  let n = 0
  for (let i = 0; i < mask.length; i++) n += mask[i]!
  return n
}

/**
 * Morphological opening (erode, then dilate) with a (2r+1)² square. Drops parts
 * thinner than about 2r — legs and antennae — so the collision hull follows the
 * body and wings instead of the antenna tips.
 */
export function openMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice()
  return dilateSquare(erodeSquare(mask, w, h, r), w, h, r)
}

function erodeSquare(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // Separable: a pixel survives when every pixel within r along x, then along y, is set.
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    let run = 0 // consecutive set pixels ending at x
    const row = y * w
    const runs = new Int32Array(w)
    for (let x = 0; x < w; x++) { run = src[row + x] ? run + 1 : 0; runs[x] = run }
    for (let x = 0; x < w; x++) {
      const right = Math.min(w - 1, x + r)
      if (x - r < 0 || x + r > w - 1) continue // the window leaves the image: off
      if (runs[right]! >= right - (x - r) + 1) tmp[row + x] = 1
    }
  }
  const out = new Uint8Array(w * h)
  for (let x = 0; x < w; x++) {
    let run = 0
    const runs = new Int32Array(h)
    for (let y = 0; y < h; y++) { run = tmp[y * w + x] ? run + 1 : 0; runs[y] = run }
    for (let y = 0; y < h; y++) {
      if (y - r < 0 || y + r > h - 1) continue
      if (runs[y + r]! >= 2 * r + 1) out[y * w + x] = 1
    }
  }
  return out
}

function dilateSquare(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let last = -Infinity // last set x seen
    for (let x = 0; x < w; x++) {
      if (src[row + x]) last = x
      if (x - last <= r) tmp[row + x] = 1
    }
    last = Infinity
    for (let x = w - 1; x >= 0; x--) {
      if (src[row + x]) last = x
      if (last - x <= r) tmp[row + x] = 1
    }
  }
  const out = new Uint8Array(w * h)
  for (let x = 0; x < w; x++) {
    let last = -Infinity
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) last = y
      if (y - last <= r) out[y * w + x] = 1
    }
    last = Infinity
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) last = y
      if (last - y <= r) out[y * w + x] = 1
    }
  }
  return out
}

/**
 * Corners of the leftmost and rightmost set pixel in each row, as a flat
 * [x, y, …] list. That is every point the convex hull of the mask can use.
 */
export function maskExtremePoints(mask: Uint8Array, w: number, h: number): number[] {
  const pts: number[] = []
  for (let y = 0; y < h; y++) {
    let lo = -1, hi = -1
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) { if (lo < 0) lo = x; hi = x }
    }
    if (lo < 0) continue
    pts.push(lo, y, lo, y + 1, hi + 1, y, hi + 1, y + 1)
  }
  return pts
}

/** Convex hull (Andrew's monotone chain) of flat [x, y, …] points; flat, no repeated end point. */
export function convexHull(flat: number[]): number[] {
  const n = flat.length / 2
  if (n < 3) return flat.slice()
  const idx = Array.from({ length: n }, (_, i) => i)
  idx.sort((a, b) => flat[a * 2]! - flat[b * 2]! || flat[a * 2 + 1]! - flat[b * 2 + 1]!)
  const cross = (o: number, a: number, b: number) =>
    (flat[a * 2]! - flat[o * 2]!) * (flat[b * 2 + 1]! - flat[o * 2 + 1]!) -
    (flat[a * 2 + 1]! - flat[o * 2 + 1]!) * (flat[b * 2]! - flat[o * 2]!)
  const lower: number[] = []
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, i) <= 0) lower.pop()
    lower.push(i)
  }
  const upper: number[] = []
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, i) <= 0) upper.pop()
    upper.push(i)
  }
  lower.pop(); upper.pop()
  const out: number[] = []
  for (const i of [...lower, ...upper]) out.push(flat[i * 2]!, flat[i * 2 + 1]!)
  return out
}

/**
 * Removes the vertex that adds the least area until `maxVerts` remain
 * (Visvalingam). The result stays convex and inside the original hull.
 */
export function simplifyHull(hull: number[], maxVerts: number): number[] {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < hull.length; i += 2) pts.push([hull[i]!, hull[i + 1]!])
  while (pts.length > Math.max(3, maxVerts)) {
    let best = 0, bestArea = Infinity
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]!, b = pts[i]!, c = pts[(i + 1) % pts.length]!
      const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
      if (area < bestArea) { bestArea = area; best = i }
    }
    pts.splice(best, 1)
  }
  return pts.flat()
}

/** Unsigned area of a flat polygon. */
export function polygonArea(flat: number[]): number {
  let s = 0
  const n = flat.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    s += flat[i * 2]! * flat[j * 2 + 1]! - flat[j * 2]! * flat[i * 2 + 1]!
  }
  return Math.abs(s) / 2
}

/** Longest distance between any two vertices (the hull's Feret diameter). */
export function maxExtent(flat: number[]): number {
  let best = 0
  for (let i = 0; i < flat.length; i += 2) {
    for (let j = i + 2; j < flat.length; j += 2) {
      const d = Math.hypot(flat[i]! - flat[j]!, flat[i + 1]! - flat[j + 1]!)
      if (d > best) best = d
    }
  }
  return best
}

/**
 * Collision hull for a silhouette mask: opened to drop legs and antennae (falls
 * back to the raw mask when opening erases a tiny insect), convex, at most
 * `maxVerts` vertices, centred on the sprite's middle.
 */
export function silhouetteHull(mask: Uint8Array, w: number, h: number, maxVerts = 10): number[] {
  const r = Math.max(1, Math.round(0.035 * Math.max(w, h)))
  let solid = openMask(mask, w, h, r)
  if (countSet(solid) < 0.25 * countSet(mask)) solid = mask
  let pts = maskExtremePoints(solid, w, h)
  if (pts.length < 6) pts = [0, 0, w, 0, w, h, 0, h]
  const hull = simplifyHull(convexHull(pts), maxVerts)
  const out: number[] = []
  for (let i = 0; i < hull.length; i += 2) out.push(round2(hull[i]! - w / 2), round2(hull[i + 1]! - h / 2))
  return out
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export type ShelfPlacement = { page: number; x: number; y: number }

/**
 * Online shelf packer. Feed sprites roughly tallest-first and pages fill
 * densely. Each sprite gets `pad` pixels of clear space so texture filtering
 * never bleeds a neighbour in.
 */
export class ShelfPacker {
  private page = 0
  private shelfY = 0
  private shelfH = 0
  private cursorX = 0
  /** Used height of each page so far (pages can be cropped to it). */
  readonly pageHeights: number[] = [0]
  readonly pageSize: number
  readonly pad: number

  constructor(pageSize: number, pad: number) {
    this.pageSize = pageSize
    this.pad = pad
  }

  get pageCount(): number { return this.page + 1 }

  place(w: number, h: number): ShelfPlacement {
    const S = this.pageSize, p = this.pad
    const W = Math.min(S, w + 2 * p), H = Math.min(S, h + 2 * p)
    if (this.cursorX + W > S) { // next shelf
      this.shelfY += this.shelfH
      this.cursorX = 0
      this.shelfH = 0
    }
    if (this.shelfY + H > S) { // next page
      this.page++
      this.pageHeights.push(0)
      this.shelfY = 0
      this.cursorX = 0
      this.shelfH = 0
    }
    const at = { page: this.page, x: this.cursorX + p, y: this.shelfY + p }
    this.cursorX += W
    this.shelfH = Math.max(this.shelfH, H)
    this.pageHeights[this.page] = Math.max(this.pageHeights[this.page]!, this.shelfY + H)
    return at
  }
}

/** Minutes after 12:00 noon on the wall clock, so one night sorts as a single run (21:30 → 570, 02:00 → 840). */
export function minutesAfterNoon(epochMs: number): number {
  const d = new Date(epochMs)
  const m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
  return Math.round(((m - 720 + 1440) % 1440) * 10) / 10
}
