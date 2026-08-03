import { detectionsStore } from '~/stores/entities/detections'
import { patchesStore, type PatchEntity } from '~/stores/entities/5.patches'
import { photosStore, type IndexedFile, type PhotoEntity } from '~/stores/entities/photos'
import type { DetectionEntity } from '~/models/detection.types'

/**
 * Overlays human-drawn detections (from x-anylabeling) as a separate
 * `HumanDetection` "detector", so they appear in parallel with the bot
 * detections and drive the detector switcher.
 *
 * x-anylabeling saves annotations as a JSON with the **same name as the source
 * photo** (`<photo>.json`, LabelMe format: `shapes` of rotated boxes). The
 * pipeline crops each box to `<photo-stem>_<index>_HumanDetection.jpg`.
 *
 * Neither the JSON nor the crops live in the package records OR the flat file
 * index: for large packages the night/image folders are deliberately NOT scanned
 * (Chrome pre-fetches every handle and crashes). Crop images are instead resolved
 * lazily via each patch's `imageFile.parentDir.getFileHandle(name)` navigator.
 *
 * So we can't scan a file list for `<photo>.json`. Two passes:
 *  1. Bot-anchored — reuse the bot patches already in the store: each carries a
 *     `parentDir` that navigates into its night folder. For every source photo we
 *     probe that folder for `<stem>.json` (+ crops) by name — no directory scan.
 *  2. Human-only fallback — for photos with a human JSON but NO bot detection
 *     (rare) there is no bot patch to anchor to, so we enumerate the (moderate)
 *     night folders by name only, skipping any night too large to be safe.
 *
 * This must run after BOTH a fresh ingest and a cache restore, because human
 * patches are never persisted in the package records.
 */

export const HUMAN_DETECTOR_ID = 'HumanDetection'

// Skip the human-only fallback scan for a night whose bot-patch count exceeds
// this — a proxy for a folder too big to enumerate without risking the crash
// that made packages skip these folders in the first place.
const FALLBACK_MAX_NIGHT_PATCHES = 15000
const FALLBACK_MAX_ENTRIES = 30000

type FileHandleLike = { getFile: () => Promise<File> }
type DirLike = {
  getFileHandle: (name: string) => Promise<FileHandleLike>
  getDirectoryHandle?: (name: string) => Promise<DirLike>
  keys?: () => AsyncIterable<string>
}

function dirOf(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx >= 0 ? norm.slice(0, idx) : ''
}

/** True for `.json` files that are records/config, not x-anylabeling annotations. */
function isNonHumanJsonName(lowerName: string): boolean {
  if (!lowerName.endsWith('.json')) return true
  if (
    lowerName.endsWith('_botdetection.json') ||
    lowerName.endsWith('_humandetection.json') ||
    lowerName.endsWith('_identified.json')
  ) {
    return true
  }
  if (lowerName.includes('_botdetection_')) return true // archived detector runs
  return ['manifest.json', 'calibration.json', 'cluster_cache.json', 'dataset.json', 'package.json'].includes(lowerName)
}

/**
 * Recover the source-photo stem from a bot crop filename.
 * Crops are named `<stem>_<index>_<detectorId>.jpg`, so stripping the known
 * detector suffix and the trailing `_<index>` leaves the stem — robust even
 * when the stem itself contains digits/underscores (timestamps).
 */
function stemFromCropName(cropName: string, detectorId: string): string | null {
  let base = cropName.replace(/\.(jpe?g|png)$/i, '')
  const suffix = `_${detectorId}`
  if (base.toLowerCase().endsWith(suffix.toLowerCase())) {
    base = base.slice(0, base.length - suffix.length)
  }
  // base is now `<stem>_<index>`; strip the trailing index.
  const m = /^(.*)_\d+$/.exec(base)
  if (m) return m[1] || null
  // Fallback for an unexpected `<stem>_<index>_<detector>` we couldn't strip.
  const m2 = /^(.*)_\d+_.+$/.exec(base)
  return m2 ? m2[1] || null : null
}

type NightRef = {
  nightPath: string
  dir?: DirLike
  parentDir?: DirLike
  rootDir?: DirLike
  leafGroupId: string
}

type PhotoRep = NightRef & {
  stem: string
  photoId: string
}

type Sink = {
  patches: Record<string, PatchEntity>
  detections: Record<string, DetectionEntity>
  existingPatches: Record<string, PatchEntity>
}

/** A LabelMe/x-anylabeling annotation shape. */
type LabelMeShape = {
  points?: unknown
  direction?: unknown
  shape_type?: unknown
  label?: unknown
  score?: unknown
}

async function readJsonHandle(getFileHandle: (name: string) => Promise<FileHandleLike>, name: string): Promise<{
  shapes?: unknown
  imagePath?: unknown
  imageHeight?: unknown
} | null> {
  try {
    const fh = await getFileHandle(name)
    const file = await fh.getFile()
    return JSON.parse(await file.text())
  } catch {
    return null
  }
}

/**
 * Turn each shape of a parsed x-anylabeling doc into a HumanDetection patch +
 * detection (verifying the crop image exists). Returns the count added.
 */
async function addHumanShapes(params: {
  parsed: { shapes?: unknown; imagePath?: unknown; imageHeight?: unknown }
  stem: string
  night: NightRef
  photoId: string
  getFileHandle: (name: string) => Promise<FileHandleLike>
  cropParentDir: DirLike
  sink: Sink
}): Promise<number> {
  const { parsed, stem, night, photoId, getFileHandle, cropParentDir, sink } = params
  const shapes = parsed?.shapes
  if (!Array.isArray(shapes) || shapes.length === 0) return 0
  // Verify it's a LabelMe/x-anylabeling doc, not some other stray JSON.
  if (typeof parsed.imagePath !== 'string' && parsed.imageHeight == null) return 0

  let added = 0
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i] as LabelMeShape
    if (!shape || !Array.isArray(shape.points) || shape.points.length === 0) continue
    const patchId = `${stem}_${i}_HumanDetection`
    if (sink.existingPatches[patchId] || sink.patches[patchId]) continue // already loaded (e.g. from records)

    const cropName = `${stem}_${i}_HumanDetection.jpg`
    try {
      await getFileHandle(cropName) // confirm the crop exists
    } catch {
      continue
    }

    const imageFile: IndexedFile = {
      name: cropName,
      path: night.nightPath ? `${night.nightPath}/${cropName}` : cropName,
      size: 0,
      file: undefined,
      handle: undefined,
      parentDir: cropParentDir,
      rootDir: night.rootDir,
    } as IndexedFile

    sink.patches[patchId] = {
      id: patchId,
      name: patchId,
      leafGroupId: night.leafGroupId,
      photoId,
      imageFile,
      detectorId: HUMAN_DETECTOR_ID,
    }
    sink.detections[patchId] = {
      id: patchId,
      patchId,
      photoId,
      leafGroupId: night.leafGroupId,
      detectorId: HUMAN_DETECTOR_ID,
      detectedBy: 'auto',
      points: shape.points as DetectionEntity['points'],
      ...(typeof shape.direction === 'number' ? { direction: shape.direction } : {}),
      ...(typeof shape.shape_type === 'string' ? { shapeType: shape.shape_type } : {}),
      ...(typeof shape.label === 'string' ? { label: shape.label } : {}),
      ...(typeof shape.score === 'number' ? { score: shape.score } : {}),
    } as DetectionEntity
    added++
  }
  return added
}

/**
 * Add HumanDetection patches/detections for any x-anylabeling `<photo>.json`
 * sitting beside the bot crops. Returns the number of human detections added.
 */
export async function overlayHumanDetections(): Promise<number> {
  const patches = patchesStore.get() || {}

  // Group the loaded bot patches by source-photo stem, keeping one representative
  // per photo (it carries the night-folder navigator + the photo/night anchor).
  const byStem = new Map<string, PhotoRep>()
  for (const patch of Object.values(patches)) {
    const detectorId = patch.detectorId
    if (!detectorId || detectorId === HUMAN_DETECTOR_ID) continue // only bot patches anchor
    const imageFile = patch.imageFile as (IndexedFile & { parentDir?: DirLike; rootDir?: DirLike }) | undefined
    const cropName = imageFile?.name
    if (!cropName || !patch.leafGroupId || !patch.photoId) continue
    const stem = stemFromCropName(cropName, detectorId)
    if (!stem || byStem.has(stem)) continue
    byStem.set(stem, {
      stem,
      nightPath: dirOf(imageFile?.path || ''),
      parentDir: imageFile?.parentDir,
      rootDir: imageFile?.rootDir,
      leafGroupId: patch.leafGroupId,
      photoId: patch.photoId,
    })
  }
  if (byStem.size === 0) return 0

  // Navigate rootDir → night folder once per night and reuse the handle for all
  // photos in that night (avoids re-walking the tree for every getFileHandle).
  const nightDirCache = new Map<string, DirLike | null>()
  async function resolveNightDir(rep: PhotoRep): Promise<DirLike | null> {
    if (nightDirCache.has(rep.nightPath)) return nightDirCache.get(rep.nightPath) ?? null
    let dir: DirLike | null = null
    const root = rep.rootDir
    if (root?.getDirectoryHandle && rep.nightPath) {
      try {
        let cur: DirLike = root
        for (const seg of rep.nightPath.split('/').filter(Boolean)) {
          cur = await cur.getDirectoryHandle!(seg)
        }
        dir = cur
      } catch {
        dir = null
      }
    }
    nightDirCache.set(rep.nightPath, dir)
    return dir
  }

  const sink: Sink = { patches: {}, detections: {}, existingPatches: patches }

  // Resolve each night folder's handle once up front (a handful of nights),
  // so the per-photo probes below are pure getFileHandle calls we can fan out.
  for (const nightPath of new Set([...byStem.values()].map((r) => r.nightPath))) {
    const rep = [...byStem.values()].find((r) => r.nightPath === nightPath)
    if (rep) await resolveNightDir(rep)
  }

  // ---- Pass 1: bot-anchored human detections ----
  async function probePhoto(rep: PhotoRep): Promise<void> {
    const nightDir = nightDirCache.get(rep.nightPath) ?? null
    const getFileHandle: ((name: string) => Promise<FileHandleLike>) | undefined = nightDir
      ? (name) => nightDir.getFileHandle(name)
      : rep.parentDir
        ? (name) => rep.parentDir!.getFileHandle(name)
        : undefined
    const cropParentDir = nightDir ?? rep.parentDir
    if (!getFileHandle || !cropParentDir) return

    const parsed = await readJsonHandle(getFileHandle, `${rep.stem}.json`)
    if (!parsed) return
    await addHumanShapes({ parsed, stem: rep.stem, night: rep, photoId: rep.photoId, getFileHandle, cropParentDir, sink })
  }

  // Fan out the per-photo probes with bounded concurrency: on a big night there
  // are thousands of photos, most WITHOUT a human JSON, so a serial await loop
  // would add seconds to every open.
  const reps = [...byStem.values()]
  const CONCURRENCY = 24
  for (let i = 0; i < reps.length; i += CONCURRENCY) {
    await Promise.all(reps.slice(i, i + CONCURRENCY).map(probePhoto))
  }

  // ---- Pass 2: human-only photos (a `<photo>.json` with no bot detection) ----
  await scanHumanOnlyPhotos({ patches, byStem, nightDirCache, sink })

  const added = Object.keys(sink.patches).length
  if (added > 0) {
    patchesStore.set({ ...patchesStore.get(), ...sink.patches })
    detectionsStore.set({ ...detectionsStore.get(), ...sink.detections })
  }
  return added
}

/**
 * Rare fallback: enumerate the (moderate) night folders by NAME ONLY to find
 * `<photo>.json` files that have no bot detection, and synthesize a photo entity
 * + HumanDetection patches for them. Skips nights too large to enumerate safely.
 */
async function scanHumanOnlyPhotos(params: {
  patches: Record<string, PatchEntity>
  byStem: Map<string, PhotoRep>
  nightDirCache: Map<string, DirLike | null>
  sink: Sink
}): Promise<void> {
  const { patches, byStem, nightDirCache, sink } = params

  // Bot-patch count per night → proxy for folder size (skip huge nights).
  const perNightPatches = new Map<string, number>()
  for (const patch of Object.values(patches)) {
    if (!patch.detectorId || patch.detectorId === HUMAN_DETECTOR_ID) continue
    const p = dirOf((patch.imageFile as IndexedFile | undefined)?.path || '')
    perNightPatches.set(p, (perNightPatches.get(p) || 0) + 1)
  }

  const nights = new Map<string, NightRef>()
  for (const rep of byStem.values()) {
    if (nights.has(rep.nightPath)) continue
    const dir = nightDirCache.get(rep.nightPath) ?? undefined
    nights.set(rep.nightPath, { nightPath: rep.nightPath, dir, parentDir: rep.parentDir, rootDir: rep.rootDir, leafGroupId: rep.leafGroupId })
  }

  const coveredStems = new Set(byStem.keys())
  const newPhotos: Record<string, PhotoEntity> = {}

  for (const night of nights.values()) {
    const dir = night.dir
    if (!dir || typeof dir.keys !== 'function') continue // can't enumerate → skip
    if ((perNightPatches.get(night.nightPath) || 0) > FALLBACK_MAX_NIGHT_PATCHES) continue

    const candidateStems: string[] = []
    try {
      let count = 0
      for await (const name of dir.keys()) {
        if (++count > FALLBACK_MAX_ENTRIES) {
          candidateStems.length = 0
          break
        }
        if (typeof name !== 'string') continue
        const lower = name.toLowerCase()
        if (isNonHumanJsonName(lower)) continue
        const stem = name.slice(0, name.length - 5) // strip ".json"
        if (coveredStems.has(stem)) continue
        candidateStems.push(stem)
      }
    } catch {
      continue // enumeration failed → skip this night
    }

    for (const stem of candidateStems) {
      const getFileHandle = (name: string) => dir.getFileHandle(name)
      const parsed = await readJsonHandle(getFileHandle, `${stem}.json`)
      if (!parsed) continue

      const photoId = `${stem}.jpg`
      if (!sink.existingPatches[photoId] && !newPhotos[photoId] && !(photosStore.get() || {})[photoId]) {
        const sourceName =
          typeof parsed.imagePath === 'string' ? parsed.imagePath.replace(/\\/g, '/').split('/').pop() || `${stem}.jpg` : `${stem}.jpg`
        newPhotos[photoId] = {
          id: photoId,
          name: photoId,
          leafGroupId: night.leafGroupId,
          imageFile: {
            name: sourceName,
            path: night.nightPath ? `${night.nightPath}/${sourceName}` : sourceName,
            size: 0,
            file: undefined,
            handle: undefined,
            parentDir: dir,
            rootDir: night.rootDir,
          } as IndexedFile,
        }
      }

      await addHumanShapes({ parsed, stem, night, photoId, getFileHandle, cropParentDir: dir, sink })
    }
  }

  if (Object.keys(newPhotos).length > 0) {
    photosStore.set({ ...photosStore.get(), ...newPhotos })
  }
}
