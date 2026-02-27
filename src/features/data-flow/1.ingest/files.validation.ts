import { isLikelyNightFolderName } from './ingest-paths'

export function validateProjectRootSelection(params: {
  files: Array<{ file?: File; path: string; name: string; size: number }>
}): { ok: true } | { ok: false; message: string } {
  const { files } = params
  if (!files?.length) return { ok: false, message: 'No files found in the selected folder.' }

  const entries = files.map((f) => {
    const normalized = (f?.path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
    const segments = normalized.split('/').filter(Boolean)
    const lowerName = (f?.name ?? '').toLowerCase()
    const isJpg = lowerName.endsWith('.jpg')
    const hasPatches = normalized.toLowerCase().includes('/patches/')
    return { path: normalized, segments, isJpg, hasPatches }
  })

  const hasNightDepth = entries.some((e) => e.segments.length >= 4)
  if (!hasNightDepth) {
    return {
      ok: false,
      message: "Invalid folder. Expected structure: dataset/deployment/night/(patches/)?file. Please pick the parent datasets folder.",
    }
  }

  const patchJpgs = entries.filter((e) => e.hasPatches && e.isJpg)
  if (patchJpgs.length === 0) {
    return {
      ok: false,
      message: "No 'patches' folders with .jpg files were found. Expected: dataset/deployment/night/patches/*.jpg.",
    }
  }

  const badDepth = patchJpgs.find((e) => {
    const idx = e.segments.findIndex((s) => s.toLowerCase() === 'patches')
    if (idx < 3) return true
    return e.segments.length <= idx + 1
  })
  if (badDepth) {
    const sample = badDepth.path
    const idx = badDepth.segments.findIndex((s) => s.toLowerCase() === 'patches')
    const pre = badDepth.segments.slice(0, idx)
    const nightCandidate = pre[pre.length - 1] ?? ''
    const looksLikeNight = isLikelyNightFolderName(nightCandidate)
    if (looksLikeNight && idx < 4) {
      const missingCount = 3 - pre.length
      const missingHint = missingCount >= 1 ? 'datasets/deployments' : 'datasets/deployments (one level is missing)'
      return {
        ok: false,
        message: `Detected night and patches are valid, but ${missingHint} structure before the night is incorrect. Example: dataset/deployment/night/patches/<file>. Offending path: ${sample}`,
      }
    }
    if (badDepth.segments.length <= idx + 1) {
      return {
        ok: false,
        message: `The 'patches' folder does not contain a file at the expected level. Expected: dataset/deployment/night/patches/<file>. Offending path: ${sample}`,
      }
    }
    return {
      ok: false,
      message: `Found a 'patches' folder at an unexpected location: ${sample}. Expected: dataset/deployment/night/patches/<file>.`,
    }
  }

  return { ok: true }
}
