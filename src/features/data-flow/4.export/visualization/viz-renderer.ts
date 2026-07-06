import type { VizData, VizGroup } from './viz-data'
import type { VizConfig } from './viz-types'

const BG_COLOR = '#0f0f1a'
const TEXT_COLOR = '#e8e8f0'
const ACCENT_COLOR = '#7b8cde'
const GRID_COLOR = '#1e1e3a'
const CELL_GAP = 2

// ─── public entry points ──────────────────────────────────────────────────────

export async function renderVisualization(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  data: VizData,
  config: VizConfig,
  imageMap: Map<string, ImageBitmap>,
): Promise<void> {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  if (!ctx) return

  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (data.groups.length === 0) {
    drawEmptyState(ctx, canvas.width, canvas.height)
    return
  }

  if (config.chartType === 'bar') {
    await renderBarChart(ctx, canvas.width, canvas.height, data, config, imageMap)
  } else if (config.chartType === 'radial') {
    await renderRadialChart(ctx, canvas.width, canvas.height, data, config, imageMap)
  } else {
    await renderPackChart(ctx, canvas.width, canvas.height, data, config, imageMap)
  }
}

// ─── bar chart ────────────────────────────────────────────────────────────────

async function renderBarChart(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  data: VizData,
  config: VizConfig,
  imageMap: Map<string, ImageBitmap>,
): Promise<void> {
  const paddingTop = Math.round(height * 0.08)
  const paddingBottom = Math.round(height * 0.13)
  const paddingLeft = Math.round(width * 0.03)
  const paddingRight = Math.round(width * 0.03)

  const chartWidth = width - paddingLeft - paddingRight
  const chartHeight = height - paddingTop - paddingBottom

  const groups = data.groups
  const colWidth = Math.floor(chartWidth / groups.length)
  const maxCount = groups[0]?.count ?? 1

  // Grid lines
  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1
  const gridLines = 5
  for (let i = 0; i <= gridLines; i++) {
    const y = paddingTop + (chartHeight * i) / gridLines
    ctx.beginPath()
    ctx.moveTo(paddingLeft, y)
    ctx.lineTo(paddingLeft + chartWidth, y)
    ctx.stroke()
  }

  // Title
  const titleSize = Math.round(height * 0.035)
  ctx.fillStyle = TEXT_COLOR
  ctx.font = `600 ${titleSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(buildTitle(data, config), width / 2, Math.round(paddingTop * 0.55))

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!
    const x = paddingLeft + i * colWidth
    const colFillHeight = Math.round((group.count / maxCount) * chartHeight)
    const colTop = paddingTop + chartHeight - colFillHeight

    drawImageColumn(ctx, imageMap, group, config, x + CELL_GAP, colTop, colWidth - CELL_GAP * 2, colFillHeight)

    // Label
    const labelSize = Math.max(Math.round(width * 0.008), 10)
    ctx.fillStyle = TEXT_COLOR
    ctx.font = `${labelSize}px sans-serif`
    ctx.textAlign = 'center'
    const maxLabelWidth = colWidth - 8
    const label = truncateLabel(group.label, ctx, maxLabelWidth)
    ctx.fillText(label, x + colWidth / 2, height - paddingBottom / 2)

    // Count badge
    const countSize = Math.max(Math.round(width * 0.007), 9)
    ctx.font = `bold ${countSize}px monospace`
    ctx.fillStyle = ACCENT_COLOR
    ctx.fillText(String(group.count), x + colWidth / 2, colTop - 6)
  }
}

function drawImageColumn(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  imageMap: Map<string, ImageBitmap>,
  group: VizGroup,
  config: VizConfig,
  x: number,
  y: number,
  colWidth: number,
  colHeight: number,
): void {
  if (colWidth <= 0 || colHeight <= 0) return

  if (config.representativeMode === 'first') {
    const bmp = imageMap.get(group.representative.patchId)
    if (bmp) {
      ctx.drawImage(bmp, x, y, colWidth, colHeight)
    } else {
      ctx.fillStyle = ACCENT_COLOR + '44'
      ctx.fillRect(x, y, colWidth, colHeight)
    }
    return
  }

  // Tile all detections in the column
  const cellSize = Math.max(Math.floor(Math.sqrt((colWidth * colHeight) / group.count)), 4)
  const cols = Math.max(Math.floor(colWidth / (cellSize + CELL_GAP)), 1)
  const rows = Math.max(Math.ceil(group.count / cols), 1)

  let idx = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (idx >= group.detections.length) break
      const det = group.detections[idx++]!
      const cx = x + col * (cellSize + CELL_GAP)
      const cy = y + colHeight - (row + 1) * (cellSize + CELL_GAP)
      if (cy < y) continue

      const bmp = imageMap.get(det.patchId)
      if (bmp) {
        ctx.drawImage(bmp, cx, cy, cellSize, cellSize)
      } else {
        ctx.fillStyle = ACCENT_COLOR + '33'
        ctx.fillRect(cx, cy, cellSize, cellSize)
      }
    }
  }
}

// ─── radial chart ─────────────────────────────────────────────────────────────

async function renderRadialChart(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  data: VizData,
  config: VizConfig,
  imageMap: Map<string, ImageBitmap>,
): Promise<void> {
  const cx = width / 2
  const cy = height / 2
  const outerRadius = Math.min(width, height) * 0.36
  const innerRadius = outerRadius * 0.28
  const labelRadius = outerRadius * 1.08
  const total = data.totalDetections || 1
  const TAU = Math.PI * 2
  const startOffset = -Math.PI / 2

  // Title
  const titleSize = Math.round(height * 0.03)
  ctx.fillStyle = TEXT_COLOR
  ctx.font = `600 ${titleSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(buildTitle(data, config), cx, Math.round(height * 0.05))

  // Total count in centre
  const centreSize = Math.round(outerRadius * 0.18)
  ctx.fillStyle = TEXT_COLOR
  ctx.font = `bold ${centreSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(data.totalDetections), cx, cy)
  ctx.textBaseline = 'alphabetic'

  let angle = startOffset

  for (const group of data.groups) {
    const sweep = (group.count / total) * TAU
    const endAngle = angle + sweep
    const midAngle = angle + sweep / 2

    // Clip arc region and fill with images
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, outerRadius, angle, endAngle)
    ctx.closePath()
    ctx.clip()

    if (config.representativeMode === 'first') {
      const bmp = imageMap.get(group.representative.patchId)
      if (bmp) {
        // Fill bounding box of the sector, clipping handles the shape
        ctx.drawImage(bmp, cx - outerRadius, cy - outerRadius, outerRadius * 2, outerRadius * 2)
      } else {
        ctx.fillStyle = ACCENT_COLOR + '55'
        ctx.fill()
      }
    } else {
      fillSectorWithTiles(ctx, imageMap, group, cx, cy, innerRadius, outerRadius, angle, endAngle)
    }

    ctx.restore()

    // Inner donut cutout
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, innerRadius, 0, TAU)
    ctx.fillStyle = BG_COLOR
    ctx.fill()
    ctx.restore()

    // Sector border
    ctx.strokeStyle = BG_COLOR
    ctx.lineWidth = Math.max(2, outerRadius * 0.01)
    ctx.beginPath()
    ctx.moveTo(cx + innerRadius * Math.cos(angle), cy + innerRadius * Math.sin(angle))
    ctx.arc(cx, cy, outerRadius, angle, endAngle)
    ctx.lineTo(cx + innerRadius * Math.cos(endAngle), cy + innerRadius * Math.sin(endAngle))
    ctx.arc(cx, cy, innerRadius, endAngle, angle, true)
    ctx.closePath()
    ctx.stroke()

    // Label
    const lx = cx + labelRadius * Math.cos(midAngle)
    const ly = cy + labelRadius * Math.sin(midAngle)
    const labelSize = Math.max(Math.round(outerRadius * 0.065), 10)
    ctx.fillStyle = TEXT_COLOR
    ctx.font = `${labelSize}px sans-serif`
    ctx.textAlign = midAngle > Math.PI / 2 || midAngle < -Math.PI / 2 ? 'right' : 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${group.label} (${group.count})`, lx, ly)
    ctx.textBaseline = 'alphabetic'

    angle = endAngle
  }
}

function fillSectorWithTiles(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  imageMap: Map<string, ImageBitmap>,
  group: VizGroup,
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
): void {
  const cellSize = Math.max(Math.floor(outerR * 0.12), 6)
  const step = cellSize + CELL_GAP
  const bound = outerR * 2
  const ox = cx - outerR
  const oy = cy - outerR

  let detIdx = 0
  const cols = Math.ceil(bound / step)
  const rows = Math.ceil(bound / step)

  for (let row = 0; row < rows && detIdx < group.detections.length; row++) {
    for (let col = 0; col < cols && detIdx < group.detections.length; col++) {
      const px = ox + col * step + step / 2
      const py = oy + row * step + step / 2
      const dx = px - cx
      const dy = py - cy
      const r = Math.sqrt(dx * dx + dy * dy)
      if (r < innerR || r > outerR) continue

      const cellAngle = Math.atan2(dy, dx)
      const normalised = normalizeAngle(cellAngle - startAngle)
      const sweep = normalizeAngle(endAngle - startAngle)
      if (normalised > sweep) continue

      const det = group.detections[detIdx++]!
      const bmp = imageMap.get(det.patchId)
      if (bmp) {
        ctx.drawImage(bmp, px - cellSize / 2, py - cellSize / 2, cellSize, cellSize)
      } else {
        ctx.fillStyle = ACCENT_COLOR + '33'
        ctx.fillRect(px - cellSize / 2, py - cellSize / 2, cellSize, cellSize)
      }
    }
  }
}

// ─── image pack (phyllotaxis radial mosaic) ───────────────────────────────────

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ≈ 2.399 radians

// A palette of distinct hues used to tint group-specific sector regions
const GROUP_HUES = [
  '#5c87d6', '#e06c75', '#98c379', '#e5c07b',
  '#c678dd', '#56b6c2', '#d19a66', '#61afef',
  '#be5046', '#3d8b37', '#9b59b6', '#1abc9c',
]

async function renderPackChart(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  data: VizData,
  config: VizConfig,
  imageMap: Map<string, ImageBitmap>,
): Promise<void> {
  const cx = width / 2
  const cy = height / 2

  // Usable radius leaves room for outer labels
  const maxRadius = Math.min(width, height) * 0.42
  const labelMargin = Math.min(width, height) * 0.08

  // Flatten all detections in group order, tracking which group each belongs to
  type PlacedDet = { patchId: string; groupIdx: number }
  const flat: PlacedDet[] = []
  for (let gi = 0; gi < data.groups.length; gi++) {
    const group = data.groups[gi]!
    const dets = config.representativeMode === 'first' ? [group.representative] : group.detections
    for (const det of dets) flat.push({ patchId: det.patchId, groupIdx: gi })
  }

  if (flat.length === 0) {
    drawEmptyState(ctx, width, height)
    return
  }

  // Cell size: fit all items into the usable circle area
  // Area of circle = π r²; divide by n items to get cell area, then sqrt for side
  const circleArea = Math.PI * maxRadius * maxRadius
  const rawCell = Math.sqrt(circleArea / flat.length) * 0.85
  const cellSize = Math.max(Math.min(rawCell, maxRadius * 0.3), 8)
  const spacing = cellSize * 1.08

  // Compute phyllotaxis positions
  type Position = { x: number; y: number; patchId: string; groupIdx: number; r: number }
  const positions: Position[] = []

  for (let i = 0; i < flat.length; i++) {
    const r = spacing * Math.sqrt(i + 0.5)
    const angle = i * GOLDEN_ANGLE
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    positions.push({ x, y, patchId: flat[i]!.patchId, groupIdx: flat[i]!.groupIdx, r })
  }

  // Clamp to canvas — items beyond the circle edge are skipped (they'd fall outside maxRadius)
  const visiblePositions = positions.filter((p) => {
    const dx = p.x - cx, dy = p.y - cy
    return Math.sqrt(dx * dx + dy * dy) <= maxRadius - cellSize / 2
  })

  // Draw images
  for (const pos of visiblePositions) {
    const half = cellSize / 2
    const bmp = imageMap.get(pos.patchId)
    if (bmp) {
      ctx.drawImage(bmp, pos.x - half, pos.y - half, cellSize, cellSize)
    }
    // Subtle group-tinted frame (very low opacity)
    const hue = GROUP_HUES[pos.groupIdx % GROUP_HUES.length]!
    ctx.strokeStyle = hue + '66'
    ctx.lineWidth = 1
    ctx.strokeRect(pos.x - half, pos.y - half, cellSize, cellSize)
  }

  // Draw group legend in a ring just outside maxRadius
  const labelR = maxRadius + labelMargin * 0.5
  const fontSize = Math.max(Math.round(Math.min(width, height) * 0.018), 11)
  ctx.font = `${fontSize}px sans-serif`
  ctx.textBaseline = 'middle'

  // Distribute labels evenly around the ring
  for (let gi = 0; gi < data.groups.length; gi++) {
    const group = data.groups[gi]!
    const labelAngle = (gi / data.groups.length) * Math.PI * 2 - Math.PI / 2
    const lx = cx + labelR * Math.cos(labelAngle)
    const ly = cy + labelR * Math.sin(labelAngle)

    const hue = GROUP_HUES[gi % GROUP_HUES.length]!

    // Small colored dot
    ctx.beginPath()
    ctx.arc(lx, ly, fontSize * 0.45, 0, Math.PI * 2)
    ctx.fillStyle = hue
    ctx.fill()

    // Text
    const isRightHalf = Math.cos(labelAngle) >= 0
    ctx.textAlign = isRightHalf ? 'left' : 'right'
    ctx.fillStyle = TEXT_COLOR
    const textX = lx + (isRightHalf ? fontSize * 0.8 : -fontSize * 0.8)
    const maxLabelW = width * 0.18
    ctx.fillText(
      truncateLabel(`${group.label} (${group.count})`, ctx, maxLabelW),
      textX,
      ly,
    )
  }

  ctx.textBaseline = 'alphabetic'

  // Title at top
  const titleSize = Math.round(Math.min(width, height) * 0.025)
  ctx.fillStyle = TEXT_COLOR + 'cc'
  ctx.font = `${titleSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(buildTitle(data, config), cx, Math.round(height * 0.03))
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalizeAngle(a: number): number {
  const TAU = Math.PI * 2
  return ((a % TAU) + TAU) % TAU
}

function truncateLabel(label: string, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, maxWidth: number): string {
  if (ctx.measureText(label).width <= maxWidth) return label
  let truncated = label
  while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '…'
}

function buildTitle(data: VizData, config: VizConfig): string {
  const scope = data.leafGroupIds.length === 1
    ? data.leafGroupIds[0]!.split('/').pop() ?? ''
    : `${data.leafGroupIds.length} nights`
  const groupLabel = config.groupBy === 'cluster' ? 'clusters' : config.taxaRank
  return `${data.totalDetections} detections · by ${groupLabel} · ${scope}`
}

function drawEmptyState(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = TEXT_COLOR + '88'
  ctx.font = `${Math.round(height * 0.03)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('No detections to visualize', width / 2, height / 2)
  ctx.textBaseline = 'alphabetic'
}
