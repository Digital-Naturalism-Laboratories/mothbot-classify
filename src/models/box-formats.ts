/**
 * Box formats (ontology: Box Formats). Every stored box says what format it is in.
 *
 * - `obb-corners-rel`: the Mothbox format — four corners `[x1, y1, …, x4, y4]`, each a
 *   fraction (0–1) of the image's width or height, in order around the box.
 * - `xyxy-rel` / `xyxy-px`: an upright box, top-left and bottom-right corners.
 * - `xanylabeling-rotation-px`: X-AnyLabeling's rotation shape — four pixel corners
 *   (`points`) plus a `direction` angle. What detection JSONs hold; a box with no label
 *   is read as this.
 * - `xyxyr`: Antenna's proposed oriented box — two opposite corners of an upright
 *   rectangle plus a rotation of that rectangle around its centre.
 *
 * Keep in sync with Mothbot Process's `core/boxes.py`.
 */

export type BoxFormat = 'obb-corners-rel' | 'xyxy-rel' | 'xyxy-px' | 'xanylabeling-rotation-px' | 'xyxyr'

export type LabelledBox = {
  format: BoxFormat
  coordinates: number[]
}

export const OBB_CORNERS_REL: BoxFormat = 'obb-corners-rel'
export const XANYLABELING_ROTATION_PX: BoxFormat = 'xanylabeling-rotation-px'

const BOX_FORMATS = new Set<BoxFormat>(['obb-corners-rel', 'xyxy-rel', 'xyxy-px', 'xanylabeling-rotation-px', 'xyxyr'])

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** A stored box, if it is a labelled box this app understands. */
export function parseLabelledBox(value: unknown): LabelledBox | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as { format?: unknown; coordinates?: unknown }
  if (typeof v.format !== 'string' || !BOX_FORMATS.has(v.format as BoxFormat)) return undefined
  if (!Array.isArray(v.coordinates) || !v.coordinates.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined
  return { format: v.format as BoxFormat, coordinates: v.coordinates as number[] }
}

/** Four pixel corners → `obb-corners-rel`, or undefined when the size or corners are unusable. */
export function cornersRelFromPx(params: { points?: number[][]; imageWidth?: number; imageHeight?: number }): LabelledBox | undefined {
  const { points, imageWidth, imageHeight } = params
  if (!Array.isArray(points) || points.length !== 4) return undefined
  if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) return undefined
  const coordinates: number[] = []
  for (const point of points) {
    const [x, y] = point ?? []
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
    coordinates.push(round6(x! / imageWidth), round6(y! / imageHeight))
  }
  return { format: OBB_CORNERS_REL, coordinates }
}

/** Any labelled box → four pixel corners in an image of the given size. */
export function cornersPxFromBox(params: { box: LabelledBox; imageWidth?: number; imageHeight?: number }): number[][] | undefined {
  const { box, imageWidth = 0, imageHeight = 0 } = params
  const c = box.coordinates
  const pairs = (values: number[]) => [0, 2, 4, 6].map((i) => [values[i]!, values[i + 1]!])
  const upright = (x1: number, y1: number, x2: number, y2: number) => [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ]

  switch (box.format) {
    case 'obb-corners-rel':
      if (c.length !== 8 || !imageWidth || !imageHeight) return undefined
      return pairs(c).map(([x, y]) => [x! * imageWidth, y! * imageHeight])
    case 'xanylabeling-rotation-px':
      return c.length === 8 ? pairs(c) : undefined
    case 'xyxy-px':
      return c.length === 4 ? upright(c[0]!, c[1]!, c[2]!, c[3]!) : undefined
    case 'xyxy-rel':
      if (c.length !== 4 || !imageWidth || !imageHeight) return undefined
      return upright(c[0]! * imageWidth, c[1]! * imageHeight, c[2]! * imageWidth, c[3]! * imageHeight)
    case 'xyxyr':
      return c.length === 5 ? cornersFromXyxyr({ x1: c[0]!, y1: c[1]!, x2: c[2]!, y2: c[3]!, rotation: c[4]! }) : undefined
  }
}

/**
 * Antenna's proposed box: an upright rectangle (two opposite corners) turned by
 * `rotation` radians around its centre. Antenna hasn't fixed the units yet; radians
 * are assumed here, turning clockwise on screen (image y points down).
 */
export function cornersFromXyxyr(params: { x1: number; y1: number; x2: number; y2: number; rotation: number }): number[][] {
  const { x1, y1, x2, y2, rotation } = params
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ].map(([x, y]) => {
    const dx = x! - cx
    const dy = y! - cy
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
  })
}

/** The upright box around four corners: `[left, top, right, bottom]`. */
export function uprightBoxOfCorners(points: number[][]): [number, number, number, number] {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [x, y] of points) {
    left = Math.min(left, x!)
    right = Math.max(right, x!)
    top = Math.min(top, y!)
    bottom = Math.max(bottom, y!)
  }
  return [left, top, right, bottom]
}

/**
 * X-AnyLabeling's `direction` for four corners: the angle of the first edge (corner 0 →
 * corner 1) in radians, from 0 up to 2π, measured in image coordinates (y down).
 * X-AnyLabeling starts a drawn rectangle at 0 with that edge pointing right and adds
 * each rotation to it.
 */
export function directionFromCorners(points: number[][]): number {
  const [p0, p1] = points
  if (!p0 || !p1) return 0
  const angle = Math.atan2(p1[1]! - p0[1]!, p1[0]! - p0[0]!)
  const twoPi = Math.PI * 2
  return ((angle % twoPi) + twoPi) % twoPi
}
