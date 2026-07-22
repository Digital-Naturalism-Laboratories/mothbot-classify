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

/** Draw a natural-size mosaic into a fixed preview canvas (letterboxed). */
export function drawMosaicToPreview(
  target: HTMLCanvasElement,
  mosaic: OffscreenCanvas,
  background: [number, number, number] | null,
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
  ctx.drawImage(mosaic, (W - dw) / 2, (H - dh) / 2, dw, dh)
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
