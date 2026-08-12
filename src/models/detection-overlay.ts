/**
 * Geometry helpers for drawing a detection's bounding box over its source photo.
 *
 * Detection points come straight from the bot detection JSON (x-anylabeling
 * format) and are expressed in the source photo's own pixel coordinates, so an
 * SVG using the photo's natural size as its viewBox can render them directly.
 */

/**
 * Builds an SVG `points` string for a detection's bounding box.
 *
 * Handles both shapes the bot detection JSON produces:
 *  - `rotation` / polygon: 4+ points, already the box corners.
 *  - `rectangle`: exactly 2 points (opposite corners), expanded to 4 here.
 *
 * Returns null when there's nothing usable to draw.
 */
export function buildDetectionPolygonPoints(params: { points?: number[][] }): string | null {
  const { points } = params
  if (!Array.isArray(points) || points.length < 2) return null

  const valid = points.filter(
    (point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]),
  ) as Array<[number, number]>

  if (valid.length === 2) {
    const [[x1, y1], [x2, y2]] = valid
    const left = Math.min(x1, x2)
    const right = Math.max(x1, x2)
    const top = Math.min(y1, y2)
    const bottom = Math.max(y1, y2)
    if (right - left <= 0 || bottom - top <= 0) return null
    return `${left},${top} ${right},${top} ${right},${bottom} ${left},${bottom}`
  }

  if (valid.length < 3) return null
  return valid.map(([x, y]) => `${x},${y}`).join(' ')
}
