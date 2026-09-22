/**
 * One-shot dataset handoff from Mothbot Process.
 *
 * After a user picks a dataset folder in Process, it links to Classify as
 * `?dataset=<folder name>&root=<parent path>`. A browser cannot open a local
 * folder from a URL, but Classify remembers the user's datasets-root folder, so
 * the startup auto-open can jump straight to the named dataset. When it can't
 * (root not set yet, wrong root, or permission needs re-granting), the home
 * screen shows a prompt naming `root` — the exact folder to point the picker at.
 *
 * `root` is display-only text and is never used to touch the filesystem.
 *
 * Params are read once per page load (cached) and stripped from the address
 * bar, so a later refresh doesn't keep re-requesting the same dataset.
 */
export type RequestedDatasetHandoff = {
  /** Dataset folder name inside the datasets root (never a path). */
  folderName: string
  /** Parent folder the user should choose as Classify's datasets folder (display only). */
  rootPath: string | null
}

const DATASET_PARAM = 'dataset'
const ROOT_PARAM = 'root'
let cached: RequestedDatasetHandoff | null | undefined

function isSafeFolderName(raw: string): boolean {
  return raw.length > 0 && !raw.includes('/') && !raw.includes('\\') && raw !== '.' && raw !== '..'
}

export function getRequestedDatasetHandoff(): RequestedDatasetHandoff | null {
  if (cached !== undefined) return cached
  cached = null
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(window.location.href)
    const name = url.searchParams.get(DATASET_PARAM)?.trim() ?? ''
    const root = url.searchParams.get(ROOT_PARAM)?.trim() ?? ''
    if (isSafeFolderName(name)) {
      cached = { folderName: name, rootPath: root || null }
    }
    if (url.searchParams.has(DATASET_PARAM) || url.searchParams.has(ROOT_PARAM)) {
      url.searchParams.delete(DATASET_PARAM)
      url.searchParams.delete(ROOT_PARAM)
      window.history.replaceState(window.history.state, '', url.toString())
    }
  } catch {
    cached = null
  }
  return cached
}

export function getRequestedDatasetFolderName(): string | null {
  return getRequestedDatasetHandoff()?.folderName ?? null
}
