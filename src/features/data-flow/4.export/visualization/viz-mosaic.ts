/**
 * Canvas layer for the silhouette mosaic: turns `ImageBitmap`s into tight masks,
 * applies the blur/opacity quality filters, runs the pure packing geometry from
 * `viz-pack.ts`, and composites the result onto an OffscreenCanvas at its natural
 * size (radial = square, bar = auto height, shape = mask aspect).
 */
import {
  ALPHA_THRESHOLD,
  computePlacements,
  type PackLayout,
  type PackStats,
  type PreparedItem,
} from './viz-pack'

/** Chrome/Safari cap canvas sides at 16384px; beyond it allocation silently fails. */
export const MAX_CANVAS_SIDE = 16384

export type MosaicItem = { id: string; bitmap: ImageBitmap }

export type MosaicOptions = {
  layout: PackLayout
  width: number
  scale: number
  padding: number
  background: [number, number, number] | null // null = transparent
  baseMask?: { data: Uint8Array; w: number; h: number } | null
  blurDropPct?: number
  opacityDropPct?: number
  seed?: number
  onProgress?: (frac: number, msg: string) => void
}

export type MosaicResult = {
  canvas: OffscreenCanvas
  stats: PackStats & {
    /** Dropped by the blur/opacity quality filters. */
    filtered: number
    /** Excluded as near-fully-transparent — blurry or empty crops. */
    tooTransparent: number
  }
  /** radial/shape: packed-disc radius (px in the mosaic canvas). 0 for bar. */
  contentRadius: number
  center: { x: number; y: number }
}

/** Build a tight, padding-dilated silhouette mask from one bitmap. */
function prepareItem(id: string, bitmap: ImageBitmap, scale: number, padding: number): PreparedItem | null {
  const sw = Math.max(1, Math.round(bitmap.width * scale))
  const sh = Math.max(1, Math.round(bitmap.height * scale))
  const off = new OffscreenCanvas(sw, sh)
  const ctx = off.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, sw, sh)
  const rgba = ctx.getImageData(0, 0, sw, sh).data

  // Tight bbox of non-transparent pixels.
  let r0 = sh, r1 = -1, c0 = sw, c1 = -1
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (rgba[(y * sw + x) * 4 + 3]! > ALPHA_THRESHOLD) {
        if (y < r0) r0 = y
        if (y > r1) r1 = y
        if (x < c0) c0 = x
        if (x > c1) c1 = x
      }
    }
  }
  // Nothing clears the alpha threshold — a near-empty or badly blurred crop.
  // Deliberately excluded: it would contribute nothing but haze to the mosaic.
  if (r1 < 0) return null

  const m = Math.max(0, Math.floor(padding))
  const er0 = Math.max(0, r0 - m), ec0 = Math.max(0, c0 - m)
  const er1 = Math.min(sh, r1 + 1 + m), ec1 = Math.min(sw, c1 + 1 + m)
  const mw = ec1 - ec0, mh = er1 - er0

  // Opaque mask over the expanded region.
  const solid = new Uint8Array(mw * mh)
  let opaque = 0
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (rgba[((y + er0) * sw + (x + ec0)) * 4 + 3]! > ALPHA_THRESHOLD) { solid[y * mw + x] = 1; opaque++ }
    }
  }

  // Dilate by padding so silhouettes never quite touch.
  const mask = m > 0 ? dilate(solid, mw, mh, m) : solid

  // Sparse representation of set pixels (fast overlap/stamp).
  const rs: number[] = [], cs: number[] = []
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (mask[y * mw + x]) { rs.push(y); cs.push(x) }

  return {
    id, sw, sh, mw, mh,
    maskR: Uint16Array.from(rs),
    maskC: Uint16Array.from(cs),
    offR: er0, offC: ec0,
    focus: focusScore(rgba, sw, sh),
    opaque,
  }
}

/** Box dilation of a boolean mask by radius `m` (Chebyshev). */
function dilate(src: Uint8Array, w: number, h: number, m: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!src[y * w + x]) continue
      const y0 = Math.max(0, y - m), y1 = Math.min(h - 1, y + m)
      const x0 = Math.max(0, x - m), x1 = Math.min(w - 1, x + m)
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) out[yy * w + xx] = 1
    }
  }
  return out
}

/** Variance of the Laplacian over opaque pixels — low ⇒ blurry/out-of-focus. */
function focusScore(rgba: Uint8ClampedArray, w: number, h: number): number {
  if (w < 3 || h < 3) return 0
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!
  }
  let sum = 0, sum2 = 0, n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (rgba[i * 4 + 3]! <= ALPHA_THRESHOLD) continue
      const lap = 4 * lum[i]! - lum[i - 1]! - lum[i + 1]! - lum[i - w]! - lum[i + w]!
      sum += lap; sum2 += lap * lap; n++
    }
  }
  if (n < 2) return 0
  const mean = sum / n
  return sum2 / n - mean * mean
}

/** Drop the blurriest / least-opaque percentiles (percentile of the current set). */
function applyQualityFilter(
  prepared: PreparedItem[], bitmaps: ImageBitmap[], blurDropPct: number, opacityDropPct: number,
): { prepared: PreparedItem[]; bitmaps: ImageBitmap[]; filtered: number } {
  if (blurDropPct <= 0 && opacityDropPct <= 0) return { prepared, bitmaps, filtered: 0 }
  const n0 = prepared.length
  let keepIdx = prepared.map((_, i) => i)
  const threshold = (vals: number[], pct: number): number => {
    const s = [...vals].sort((a, b) => a - b)
    const rank = Math.min(s.length - 1, Math.floor((pct / 100) * s.length))
    return s[rank] ?? -Infinity
  }
  if (blurDropPct > 0) {
    const thr = threshold(keepIdx.map((i) => prepared[i]!.focus), blurDropPct)
    keepIdx = keepIdx.filter((i) => prepared[i]!.focus >= thr)
  }
  if (opacityDropPct > 0) {
    const thr = threshold(keepIdx.map((i) => prepared[i]!.opaque), opacityDropPct)
    keepIdx = keepIdx.filter((i) => prepared[i]!.opaque >= thr)
  }
  return {
    prepared: keepIdx.map((i) => prepared[i]!),
    bitmaps: keepIdx.map((i) => bitmaps[i]!),
    filtered: n0 - keepIdx.length,
  }
}

/** Rasterize a base silhouette bitmap to a boolean fill mask sized to `width`. */
export function buildBaseMask(bitmap: ImageBitmap, width: number): { data: Uint8Array; w: number; h: number } {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.round(bitmap.height * (w / bitmap.width)))
  const off = new OffscreenCanvas(w, h)
  const ctx = off.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, w, h)
  const rgba = ctx.getImageData(0, 0, w, h).data
  const data = new Uint8Array(w * h)
  // Fill = opaque (transparent PNG) OR dark (black-on-white silhouette).
  let anyAlpha = false
  for (let i = 0; i < w * h; i++) if (rgba[i * 4 + 3]! < 250) { anyAlpha = true; break }
  for (let i = 0; i < w * h; i++) {
    if (anyAlpha) data[i] = rgba[i * 4 + 3]! > 0 ? 1 : 0
    else {
      const l = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!
      data[i] = l < 128 ? 1 : 0
    }
  }
  return { data, w, h }
}

/** Prepare, filter, pack, and composite a mosaic at its natural size. */
export async function renderMosaic(items: MosaicItem[], opts: MosaicOptions): Promise<MosaicResult> {
  const scale = opts.scale
  const padding = Math.max(0, Math.floor(opts.padding))
  const report = opts.onProgress

  const prepared: PreparedItem[] = []
  const bitmaps: ImageBitmap[] = []
  let tooTransparent = 0
  for (let i = 0; i < items.length; i++) {
    const p = prepareItem(items[i]!.id, items[i]!.bitmap, scale, padding)
    if (p) { prepared.push(p); bitmaps.push(items[i]!.bitmap) }
    else tooTransparent++
    if (report && (i % 50 === 0 || i === items.length - 1)) report((i + 1) / items.length, `preparing ${i + 1}/${items.length}`)
  }

  const q = applyQualityFilter(prepared, bitmaps, opts.blurDropPct ?? 0, opts.opacityDropPct ?? 0)

  const geom = computePlacements(q.prepared, {
    layout: opts.layout,
    width: opts.width,
    baseMask: opts.baseMask ?? null,
    seed: opts.seed ?? 42,
  })

  // Browsers cap canvas dimensions (Chrome: 16384px per side, plus a total-area
  // limit). Past it the canvas silently comes back zero-sized and only blows up
  // later in convertToBlob, so fail here with something actionable.
  if (geom.width > MAX_CANVAS_SIDE || geom.height > MAX_CANVAS_SIDE) {
    throw new Error(
      `Canvas ${geom.width}×${geom.height}px exceeds the ${MAX_CANVAS_SIDE}px browser limit. Lower the Width.`,
    )
  }

  const canvas = new OffscreenCanvas(geom.width, geom.height)
  const ctx = canvas.getContext('2d')
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    throw new Error(`Could not allocate a ${geom.width}×${geom.height}px canvas. Lower the Width.`)
  }
  if (opts.background) {
    ctx.fillStyle = `rgb(${opts.background[0]},${opts.background[1]},${opts.background[2]})`
    ctx.fillRect(0, 0, geom.width, geom.height)
  }
  for (const p of geom.placements) {
    const it = q.prepared[p.index]!
    ctx.drawImage(bitmaps[p.index]!, p.dx, p.dy, it.sw, it.sh)
  }

  return {
    canvas,
    stats: { ...geom.stats, filtered: q.filtered, tooTransparent },
    contentRadius: geom.contentRadius,
    center: geom.center,
  }
}
