/**
 * Bakes the Visualizer's current selection into a level pack for Mothball, the
 * 2D katamari-style browser game (github.com/…/mothball): one zip holding
 * `level.json` plus texture-atlas pages of the insects' transparent silhouettes.
 *
 * The game builds the terrain itself, so a pack is only the insects: each one's
 * sprite, real size (from Process's pixel-mass calibration), collision hull,
 * name and capture time. The format is documented in the game's README.
 */
import { strToU8, zipSync, type Zippable } from 'fflate'
import type { DetectionEntity } from '~/models/detection.types'
import { resolveCaptureTimestamp } from '~/models/detection-time'
import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { loadTerminalFolderPaths } from '~/features/data-flow/1.ingest/terminal-paths.storage'
import { patchesStore } from '~/stores/entities/5.patches'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { fsaaResolveAvailableFileName, fsaaWriteBytes, type FileSystemDirectoryHandleLike } from '~/utils/fsaa'
import { idbGet } from '~/utils/index-db'
import { formatTodayYyyyMm_Dd, sanitizeForFileName } from '../export-utils'
import { buildVizDetections } from './viz-data'
import { resolveExportFolderPath } from './viz-export'
import { loadPatchImages } from './viz-images'
import { ALPHA_THRESHOLD } from './viz-pack'
import { ShelfPacker, alphaBounds, alphaMask, countSet, minutesAfterNoon, silhouetteHull } from './viz-game-geometry'
import type { VizConfig } from './viz-types'

export const GAME_LEVEL_FORMAT = 'mothball-level'
export const GAME_LEVEL_VERSION = 1

/** Mothbox camera scale (mm per patch pixel) used when a night has no calibration. */
const DEFAULT_MM_PER_PX = 0.0385
/** Longest side of one insect sprite in the atlas. */
const MAX_SPRITE_PX = 128
const ATLAS_PAGE_PX = 2048
const ATLAS_PAD_PX = 2
/** Patches decoded at once; full-size patches can be 8 MP, so never load a whole night. */
const LOAD_BATCH = 64

export type GameLevelBug = {
  id: string
  /** Deepest name known: morphospecies, species … order, or the bot label. */
  label: string
  /** Rank of `label` ('species', 'order', 'morphospecies', 'none', …). */
  rank: string
  order?: string
  /** A person identified it in Classify. */
  human?: boolean
  /** Capture time, minutes after 12:00 noon on the wall clock (21:30 → 570). */
  t?: number
  /** Silhouette area in mm². */
  areaMm2: number
  /** Millimetres per atlas pixel for this sprite. */
  mmPerPx: number
  atlas: number
  x: number
  y: number
  w: number
  h: number
  /** Convex collision hull, flat [x, y, …] in sprite pixels around the sprite centre (y down). */
  hull: number[]
  cluster?: number
}

export type GameLevel = {
  format: typeof GAME_LEVEL_FORMAT
  version: typeof GAME_LEVEL_VERSION
  title: string
  createdAt: string
  source: { app: string; nights: string[]; detections: number }
  /** Every insect's size came from its night's calibration (otherwise some use a default camera scale). */
  calibrated: boolean
  atlases: Array<{ file: string; width: number; height: number }>
  bugs: GameLevelBug[]
}

export type GameLevelStats = {
  /** Detections chosen by the Visualizer's scope and filters. */
  selected: number
  blurDropped: number
  baked: number
  /** No `_nobg.png` silhouette — a game sprite needs one. */
  noNobg: number
  /** No patch image, or it couldn't be read. */
  unreadable: number
  /** Silhouette nearly fully transparent. */
  tooTransparent: number
  atlasPages: number
  bytes: number
}

export type GameLevelProgress = (frac: number, message: string) => void

/** Builds the level-pack zip for the config's scope and filters. Null when nothing is in scope. */
export async function buildGameLevelZip(
  config: VizConfig,
  onProgress?: GameLevelProgress,
): Promise<{ bytes: Uint8Array; level: GameLevel; stats: GameLevelStats } | null> {
  const { detections, blurDropped } = buildVizDetections({ ...config, preferNobg: true, requireNobg: true })
  if (!detections.length) return null

  // Roughly tallest-first, so the shelf packer fills pages densely.
  const dets = [...detections].sort((a, b) => (b.pixelMassPixels ?? 0) - (a.pixelMassPixels ?? 0))
  const fallbackMmPerPx = medianCalibration(dets) ?? DEFAULT_MM_PER_PX
  const patches = patchesStore.get() ?? {}

  const files: Zippable = {}
  const atlases: GameLevel['atlases'] = []
  const bugs: GameLevelBug[] = []
  const stats: GameLevelStats = {
    selected: detections.length, blurDropped, baked: 0, noNobg: 0, unreadable: 0, tooTransparent: 0, atlasPages: 0, bytes: 0,
  }
  let calibrated = true

  const packer = new ShelfPacker(ATLAS_PAGE_PX, ATLAS_PAD_PX)
  let page = newPage()
  let pageIndex = 0

  for (let start = 0; start < dets.length; start += LOAD_BATCH) {
    const batch = dets.slice(start, start + LOAD_BATCH)
    onProgress?.(start / dets.length, `Baking insects ${start.toLocaleString()} / ${dets.length.toLocaleString()}`)
    const { images, misses } = await loadPatchImages(batch, { preferNobg: true, requireNobg: true })
    stats.noNobg += misses.noNobg
    stats.unreadable += misses.noImageFile + misses.readFailed

    for (const det of batch) {
      const bitmap = images.get(det.patchId)
      if (!bitmap) continue
      const sprite = makeSprite(bitmap)
      bitmap.close()
      if (!sprite) { stats.tooTransparent++; continue }

      const at = packer.place(sprite.canvas.width, sprite.canvas.height)
      if (at.page !== pageIndex) {
        atlases.push(await finishPage(page, pageIndex, packer.pageHeights[pageIndex]!, files))
        page = newPage()
        pageIndex = at.page
      }
      page.ctx.drawImage(sprite.canvas, at.x, at.y)

      const hasCalibration = det.pixelMassMm2 != null && det.pixelMassMm2 > 0 && (det.pixelMassPixels ?? 0) > 0
      if (!hasCalibration) calibrated = false
      const mmPerPatchPx = hasCalibration ? Math.sqrt(det.pixelMassMm2! / det.pixelMassPixels!) : fallbackMmPerPx
      const patchPixels = hasCalibration ? det.pixelMassPixels! : (det.pixelMassPixels ?? sprite.solidPixels / sprite.scale ** 2)
      const name = bugLabel(det)
      const patch = patches[det.patchId]
      const time = resolveCaptureTimestamp({
        capturedAt: patch?.capturedAt, photoId: det.photoId, patchId: det.patchId, fileName: patch?.imageFile?.name,
      })

      bugs.push({
        id: det.patchId,
        label: name.label,
        rank: name.rank,
        ...(name.order ? { order: name.order } : {}),
        ...(det.identifiedAt ? { human: true } : {}),
        ...(time != null ? { t: minutesAfterNoon(time) } : {}),
        areaMm2: round(patchPixels * mmPerPatchPx ** 2, 4),
        mmPerPx: round(mmPerPatchPx / sprite.scale, 6),
        atlas: at.page,
        x: at.x, y: at.y, w: sprite.canvas.width, h: sprite.canvas.height,
        hull: sprite.hull,
        ...(det.clusterId != null && det.clusterId >= 0 ? { cluster: det.clusterId } : {}),
      })
      stats.baked++
    }
  }
  if (!bugs.length) return null
  atlases.push(await finishPage(page, pageIndex, packer.pageHeights[pageIndex]!, files))
  stats.atlasPages = atlases.length

  const level: GameLevel = {
    format: GAME_LEVEL_FORMAT,
    version: GAME_LEVEL_VERSION,
    title: levelTitle(config),
    createdAt: new Date().toISOString(),
    source: { app: 'Mothbot Classify', nights: config.scope === 'selection' ? [] : nightNames(config), detections: bugs.length },
    calibrated,
    atlases,
    bugs,
  }
  files['level.json'] = [strToU8(JSON.stringify(level)), { level: 6 }]
  onProgress?.(1, 'Zipping')
  const bytes = zipSync(files)
  stats.bytes = bytes.length
  return { bytes, level, stats }
}

export type GameLevelExportResult = GameLevelStats & { fullPath: string }

/** Bakes the level pack and saves it next to the other exports (`04_exports` in a package). */
export async function exportGameLevel(config: VizConfig, onProgress?: GameLevelProgress): Promise<GameLevelExportResult | null> {
  const root = (await idbGet(persistenceConstants.IDB_NAME, persistenceConstants.IDB_STORE, 'projectsRoot')) as FileSystemDirectoryHandleLike | null
  if (!root) return null
  if (!(await ensureReadWritePermission(root as any))) return null

  const built = await buildGameLevelZip(config, onProgress)
  if (!built) return null

  const folder = resolveExportFolderPath(config).split('/').filter(Boolean)
  const fileName = `${sanitizeForFileName(levelFileStem(config))}_${formatTodayYyyyMm_Dd()}.mothball.zip`
  const writePath = await fsaaResolveAvailableFileName(root, [...folder, fileName])
  await fsaaWriteBytes(root, writePath, built.bytes)

  const filePath = writePath.join('/')
  const diskRoot = loadTerminalFolderPaths().datasetsRootPath.trim().replace(/[/\\]+$/, '')
  return { ...built.stats, fullPath: diskRoot ? `${diskRoot}/${filePath}` : filePath }
}

// ─── canvas helpers ─────────────────────────────────────────────────────────

type Page = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D }

function newPage(): Page {
  const canvas = new OffscreenCanvas(ATLAS_PAGE_PX, ATLAS_PAGE_PX)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('Could not create an atlas canvas')
  return { canvas, ctx }
}

/** Crops the page to its used height, encodes it (WebP where the browser can) and adds it to the zip. */
async function finishPage(page: Page, index: number, usedHeight: number, files: Zippable): Promise<GameLevel['atlases'][number]> {
  const height = Math.max(1, Math.min(ATLAS_PAGE_PX, usedHeight))
  const out = new OffscreenCanvas(ATLAS_PAGE_PX, height)
  const ctx = out.getContext('2d') as OffscreenCanvasRenderingContext2D
  ctx.drawImage(page.canvas, 0, 0)
  const blob = await out.convertToBlob({ type: 'image/webp', quality: 0.88 })
  const ext = blob.type === 'image/webp' ? 'webp' : 'png' // Safari can't encode WebP
  const file = `atlas-${index}.${ext}`
  files[file] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }] // already compressed
  return { file, width: ATLAS_PAGE_PX, height }
}

type Sprite = { canvas: OffscreenCanvas; hull: number[]; scale: number; solidPixels: number }

/** Trims a silhouette to its opaque box, scales it to at most MAX_SPRITE_PX, and outlines it. */
function makeSprite(bitmap: ImageBitmap): Sprite | null {
  // Find the opaque box on a reduced probe, so an 8 MP patch isn't read in full.
  const longest = Math.max(bitmap.width, bitmap.height)
  const probeScale = Math.min(1, (2 * MAX_SPRITE_PX) / longest)
  const pw = Math.max(1, Math.round(bitmap.width * probeScale)), ph = Math.max(1, Math.round(bitmap.height * probeScale))
  const probe = new OffscreenCanvas(pw, ph)
  const pctx = probe.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null
  if (!pctx) return null
  pctx.drawImage(bitmap, 0, 0, pw, ph)
  const box = alphaBounds(pctx.getImageData(0, 0, pw, ph), ALPHA_THRESHOLD)
  if (!box) return null

  // Probe box back to patch pixels, one probe pixel of margin.
  const sx = Math.max(0, Math.floor((box.x0 - 1) / probeScale))
  const sy = Math.max(0, Math.floor((box.y0 - 1) / probeScale))
  const sw = Math.min(bitmap.width, Math.ceil((box.x1 + 1) / probeScale)) - sx
  const sh = Math.min(bitmap.height, Math.ceil((box.y1 + 1) / probeScale)) - sy
  const scale = Math.min(1, MAX_SPRITE_PX / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale))

  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null
  if (!ctx) return null
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h)
  const mask = alphaMask(ctx.getImageData(0, 0, w, h), ALPHA_THRESHOLD)
  const solidPixels = countSet(mask)
  if (solidPixels === 0) return null
  return { canvas, hull: silhouetteHull(mask, w, h, 10), scale: w / sw, solidPixels }
}

// ─── metadata helpers ───────────────────────────────────────────────────────

function medianCalibration(dets: DetectionEntity[]): number | null {
  const values: number[] = []
  for (const d of dets) {
    if (d.pixelMassMm2 != null && d.pixelMassMm2 > 0 && (d.pixelMassPixels ?? 0) > 0) values.push(Math.sqrt(d.pixelMassMm2 / d.pixelMassPixels!))
  }
  if (!values.length) return null
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)]!
}

const LABEL_RANKS = ['species', 'genus', 'family', 'order', 'class'] as const

/** Display name for the game's collection screen. */
export function bugLabel(det: Pick<DetectionEntity, 'morphospecies' | 'taxon' | 'label'>): { label: string; rank: string; order?: string } {
  const taxon = det.taxon
  const order = taxon?.order || orderFromLabel(det.label)
  const withOrder = (label: string, rank: string) => (order ? { label, rank, order } : { label, rank })
  if (det.morphospecies) return withOrder(det.morphospecies, 'morphospecies')
  if (taxon) {
    for (const rank of LABEL_RANKS) {
      const value = taxon[rank]
      if (value) return withOrder(value, rank)
    }
    if (taxon.scientificName) return withOrder(taxon.scientificName, taxon.taxonRank ?? 'unknown')
  }
  const raw = (det.label ?? '').trim()
  const prefixed = raw.match(/^([A-Z]+)_(.+)$/)
  if (prefixed) return withOrder(prefixed[2]!.replace(/_/g, ' '), prefixed[1]!.toLowerCase())
  if (raw && raw.toLowerCase() !== 'creature') return withOrder(raw, 'unknown')
  return withOrder('Unidentified insect', 'none')
}

function orderFromLabel(label?: string): string | undefined {
  const m = (label ?? '').match(/^ORDER_(.+)$/)
  return m ? m[1] : undefined
}

function nightNames(config: VizConfig): string[] {
  const groups = leafGroupsStore.get() ?? {}
  return config.selectedLeafGroupIds.map((id) => groups[id]?.name ?? id.split('/').pop() ?? id)
}

function levelTitle(config: VizConfig): string {
  if (config.scope === 'selection') return 'Selected insects'
  const names = nightNames(config)
  if (names.length <= 2) return names.join(' + ')
  return `${names[0]} + ${names.length - 1} more nights`
}

function levelFileStem(config: VizConfig): string {
  if (config.scope === 'selection') return 'selection'
  const names = nightNames(config)
  return names.length === 1 ? names[0]! : `${names.length}-nights`
}

function round(v: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(v * f) / f
}
