import type { DetectionEntity } from '~/models/detection.types'
import { buildBaseMask, renderMosaic, type MosaicItem, type MosaicResult } from './viz-mosaic'
import { resolveBackground, type VizConfig } from './viz-types'

/** Build ordered mosaic items and pack them into a natural-size OffscreenCanvas. */
export async function renderMosaicFromDetections(
  detections: DetectionEntity[],
  config: VizConfig,
  images: Map<string, ImageBitmap>,
  baseMask: ImageBitmap | null,
  onProgress?: (frac: number, msg: string) => void,
): Promise<MosaicResult> {
  const items: MosaicItem[] = []
  for (const det of detections) {
    const bmp = images.get(det.patchId)
    if (bmp) items.push({ id: det.patchId, bitmap: bmp })
  }
  return renderMosaic(items, {
    layout: config.layout,
    width: config.outputWidth,
    scale: config.scale,
    padding: config.padding,
    background: resolveBackground(config),
    baseMask: config.layout === 'shape' && baseMask ? buildBaseMask(baseMask, config.outputWidth) : null,
    blurDropPct: config.blurDropPct,
    opacityDropPct: config.opacityDropPct,
    seed: config.seed,
    onProgress,
  })
}

/** Dashed circle showing the estimated full-export disc (radial only). Radius &
 * center are in mosaic-canvas coordinates. */
export type PreviewOverlay = { center: { x: number; y: number }; estRadius: number } | null

/** Draw a natural-size mosaic into a fixed preview canvas (letterboxed). */
export function drawMosaicToPreview(
  target: HTMLCanvasElement,
  mosaic: OffscreenCanvas,
  background: [number, number, number] | null,
  overlay: PreviewOverlay = null,
): void {
  const ctx = target.getContext('2d')
  if (!ctx) return
  const W = target.width, H = target.height
  ctx.clearRect(0, 0, W, H)
  if (background) {
    ctx.fillStyle = `rgb(${background[0]},${background[1]},${background[2]})`
    ctx.fillRect(0, 0, W, H)
  } else {
    drawChecker(ctx, W, H) // show transparency
  }
  if (!mosaic.width || !mosaic.height) return
  const scale = Math.min(W / mosaic.width, H / mosaic.height)
  const dw = mosaic.width * scale, dh = mosaic.height * scale
  const offX = (W - dw) / 2, offY = (H - dh) / 2
  ctx.drawImage(mosaic, offX, offY, dw, dh)

  if (overlay && overlay.estRadius > 0) {
    // Green if the projected full disc fits the export canvas, amber if it would
    // spill past the width (i.e. scale down or widen the canvas).
    const fits = overlay.estRadius <= mosaic.width / 2
    ctx.save()
    ctx.setLineDash([7, 6])
    ctx.lineWidth = 2
    ctx.strokeStyle = fits ? 'rgba(110,200,120,0.95)' : 'rgba(240,140,80,0.98)'
    ctx.beginPath()
    ctx.arc(offX + overlay.center.x * scale, offY + overlay.center.y * scale, overlay.estRadius * scale, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

function drawChecker(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const s = 12
  for (let y = 0; y < H; y += s) {
    for (let x = 0; x < W; x += s) {
      ctx.fillStyle = ((x / s + y / s) & 1) ? '#2a2a38' : '#20202c'
      ctx.fillRect(x, y, s, s)
    }
  }
}
