/**
 * "Sort by color": each insect's base color, measured from the patch image the
 * mosaic already loads, so it needs no extra files and works on old datasets.
 *
 * The base color is the average of the insect's pixels in OKLab (a perceptual
 * color space), read as lightness / chroma / hue. Chromatic insects sort by hue
 * around the color wheel; near-grey ones can't be placed by hue, so they
 * follow, dark to light.
 *
 * Where the wheel is cut differs per set: Mothbox UV lighting tints a whole
 * night purple, so a fixed start (say, red) would split the biggest group across
 * both ends. The cut goes in the widest empty stretch of hues instead.
 */

export type InsectColor = {
  /** OKLab lightness, 0 black .. 1 white. */
  l: number
  /** OKLab chroma; ~0 grey, ~0.1+ vivid. */
  c: number
  /** Hue angle in degrees, 0..360. */
  h: number
}

/** Below this chroma the hue is too faint to sort by; sorted by lightness instead. */
export const GREY_CHROMA = 0.02

/** Longest side the image is shrunk to before measuring. */
const SAMPLE_SIDE = 32

/** Pixels at or below this alpha are background / soft edge in a `_nobg.png`. */
const MIN_ALPHA = 128

const srgbToLinear = new Float32Array(256).map((_, i) => {
  const c = i / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

/**
 * Base color of an RGBA buffer. Transparent images (`_nobg.png` silhouettes)
 * average their opaque pixels; fully opaque ones (plain jpg patches, background
 * included) weight toward the centre, where the insect is.
 */
export function measureInsectColor(rgba: Uint8ClampedArray, w: number, h: number): InsectColor | null {
  let hasTransparency = false
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! < 250) { hasTransparency = true; break }
  }

  const cx = (w - 1) / 2, cy = (h - 1) / 2
  const sigma2 = 2 * (0.3 * Math.max(w, h)) ** 2
  let sumW = 0, sumL = 0, sumA = 0, sumB = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let weight: number
      if (hasTransparency) {
        const a = rgba[i + 3]!
        if (a <= MIN_ALPHA) continue
        weight = a / 255
      } else {
        weight = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / sigma2)
      }
      const [L, A, B] = linearRgbToOklab(srgbToLinear[rgba[i]!]!, srgbToLinear[rgba[i + 1]!]!, srgbToLinear[rgba[i + 2]!]!)
      sumW += weight
      sumL += weight * L
      sumA += weight * A
      sumB += weight * B
    }
  }
  if (sumW === 0) return null
  const a = sumA / sumW, b = sumB / sumW
  const hue = (Math.atan2(b, a) * 180) / Math.PI
  return { l: sumL / sumW, c: Math.hypot(a, b), h: hue < 0 ? hue + 360 : hue }
}

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** One number per color: chromatic insects 0..360 by hue from `hueStart`, then greys 1000+ dark to light; unmeasured last. */
export function colorSortKey(color: InsectColor | null | undefined, hueStart = 0): number {
  if (!color) return Number.POSITIVE_INFINITY
  if (color.c < GREY_CHROMA) return 1000 + color.l
  return (color.h - hueStart + 360) % 360
}

/** Middle of the widest gap between the chromatic hues, so no color group is split by the cut. */
export function emptiestHue(colors: Array<InsectColor | null>): number {
  const hues = colors.filter((c): c is InsectColor => !!c && c.c >= GREY_CHROMA).map((c) => c.h).sort((a, b) => a - b)
  if (hues.length === 0) return 0
  // Gap from the last hue around through 360 to the first.
  let bestGap = hues[0]! + 360 - hues[hues.length - 1]!
  let bestStart = hues[hues.length - 1]!
  for (let i = 1; i < hues.length; i++) {
    const gap = hues[i]! - hues[i - 1]!
    if (gap > bestGap) { bestGap = gap; bestStart = hues[i - 1]! }
  }
  return (bestStart + bestGap / 2) % 360
}

// Measured colors per patch image, kept for the session: the preview re-renders
// on every setting change and would otherwise re-measure the same bitmaps.
const cache = new Map<string, InsectColor | null>()

/** Base color of a loaded patch bitmap, shrunk to SAMPLE_SIDE px first (cached under `key`). */
export function bitmapColor(key: string, bitmap: ImageBitmap): InsectColor | null {
  if (cache.has(key)) return cache.get(key)!
  const scale = Math.min(1, SAMPLE_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, w, h)
  const color = measureInsectColor(ctx.getImageData(0, 0, w, h).data, w, h)
  cache.set(key, color)
  return color
}

/** Order items by color (see colorSortKey); `colorOf` returns null for unmeasured items. */
export function sortByColor<T>(items: T[], colorOf: (item: T) => InsectColor | null, reversed: boolean): T[] {
  const colors = items.map(colorOf)
  const hueStart = emptiestHue(colors)
  const keyed = items.map((item, i) => ({ item, key: colorSortKey(colors[i], hueStart) }))
  keyed.sort((a, b) => a.key - b.key)
  const out = keyed.map((k) => k.item)
  return reversed ? out.reverse() : out
}
