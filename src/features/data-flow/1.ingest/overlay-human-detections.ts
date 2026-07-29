import { detectionsStore } from '~/stores/entities/detections'
import { patchesStore, type PatchEntity } from '~/stores/entities/5.patches'
import type { IndexedFile } from '~/stores/entities/photos'
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
 * So we can't scan a file list for `<photo>.json`. Instead we reuse the bot
 * patches already in the store: each one carries a `parentDir` that navigates
 * into its night folder on demand. For every source photo we probe that folder
 * for `<stem>.json` (and the matching `_HumanDetection.jpg` crops) by name — no
 * directory iteration, so no crash. This must run after BOTH a fresh ingest and
 * a cache restore, because human patches are never persisted in the records.
 */

export const HUMAN_DETECTOR_ID = 'HumanDetection'

type FileHandleLike = { getFile: () => Promise<File> }
type DirLike = {
  getFileHandle: (name: string) => Promise<FileHandleLike>
  getDirectoryHandle?: (name: string) => Promise<DirLike>
}

function dirOf(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx >= 0 ? norm.slice(0, idx) : ''
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

type PhotoRep = {
  stem: string
  nightPath: string
  parentDir?: DirLike
  rootDir?: DirLike
  leafGroupId: string
  photoId: string
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

  const newPatches: Record<string, PatchEntity> = {}
  const newDetections: Record<string, DetectionEntity> = {}

  // Resolve each night folder's handle once up front (a handful of nights),
  // so the per-photo probes below are pure getFileHandle calls we can fan out.
  for (const nightPath of new Set([...byStem.values()].map((r) => r.nightPath))) {
    const rep = [...byStem.values()].find((r) => r.nightPath === nightPath)
    if (rep) await resolveNightDir(rep)
  }

  async function probePhoto(rep: PhotoRep): Promise<void> {
    const nightDir = nightDirCache.get(rep.nightPath) ?? null
    // A getFileHandle(name) bound to this photo's night folder. Prefer the cached
    // night handle; fall back to the patch's own parentDir navigator.
    const getFileHandle: ((name: string) => Promise<FileHandleLike>) | undefined = nightDir
      ? (name) => nightDir.getFileHandle(name)
      : rep.parentDir
        ? (name) => rep.parentDir!.getFileHandle(name)
        : undefined
    const cropParentDir = nightDir ?? rep.parentDir
    if (!getFileHandle || !cropParentDir) return

    // Probe for the x-anylabeling annotation `<stem>.json`.
    let parsed: { shapes?: unknown; imagePath?: unknown; imageHeight?: unknown } | null = null
    try {
      const fh = await getFileHandle(`${rep.stem}.json`)
      const file = await fh.getFile()
      parsed = JSON.parse(await file.text())
    } catch {
      return // no human-detection JSON for this photo (or unreadable)
    }
    const shapes = (parsed as { shapes?: unknown })?.shapes
    if (!parsed || !Array.isArray(shapes) || shapes.length === 0) return
    // Verify it's a LabelMe/x-anylabeling doc, not some other stray JSON.
    if (typeof parsed.imagePath !== 'string' && parsed.imageHeight == null) return

    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i] as {
        points?: unknown
        direction?: unknown
        shape_type?: unknown
        label?: unknown
        score?: unknown
      }
      if (!shape || !Array.isArray(shape.points) || shape.points.length === 0) continue
      const patchId = `${rep.stem}_${i}_HumanDetection`
      if (patches[patchId] || newPatches[patchId]) continue // already loaded (e.g. from records)

      const cropName = `${rep.stem}_${i}_HumanDetection.jpg`
      // Confirm the crop exists so we don't create a patch with no image.
      try {
        await getFileHandle(cropName)
      } catch {
        continue
      }

      const imageFile: IndexedFile = {
        name: cropName,
        path: rep.nightPath ? `${rep.nightPath}/${cropName}` : cropName,
        size: 0,
        file: undefined,
        handle: undefined,
        parentDir: cropParentDir,
        rootDir: rep.rootDir,
      } as IndexedFile

      newPatches[patchId] = {
        id: patchId,
        name: patchId,
        leafGroupId: rep.leafGroupId,
        photoId: rep.photoId,
        imageFile,
        detectorId: HUMAN_DETECTOR_ID,
      }
      newDetections[patchId] = {
        id: patchId,
        patchId,
        photoId: rep.photoId,
        leafGroupId: rep.leafGroupId,
        detectorId: HUMAN_DETECTOR_ID,
        detectedBy: 'auto',
        points: shape.points as DetectionEntity['points'],
        ...(typeof shape.direction === 'number' ? { direction: shape.direction } : {}),
        ...(typeof shape.shape_type === 'string' ? { shapeType: shape.shape_type } : {}),
        ...(typeof shape.label === 'string' ? { label: shape.label } : {}),
        ...(typeof shape.score === 'number' ? { score: shape.score } : {}),
      } as DetectionEntity
    }
  }

  // Fan out the per-photo probes with bounded concurrency: on a big night there
  // are thousands of photos, most WITHOUT a human JSON, so a serial await loop
  // would add seconds to every open.
  const reps = [...byStem.values()]
  const CONCURRENCY = 24
  for (let i = 0; i < reps.length; i += CONCURRENCY) {
    await Promise.all(reps.slice(i, i + CONCURRENCY).map(probePhoto))
  }

  const added = Object.keys(newPatches).length
  if (added > 0) {
    patchesStore.set({ ...patchesStore.get(), ...newPatches })
    detectionsStore.set({ ...detectionsStore.get(), ...newDetections })
  }
  return added
}
