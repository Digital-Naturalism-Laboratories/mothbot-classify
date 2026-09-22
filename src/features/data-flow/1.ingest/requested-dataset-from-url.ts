/**
 * One-shot dataset handoff from Mothbot Process.
 *
 * After a user picks a dataset folder in Process, it links to Classify as
 * `?dataset=<folder name>`. A browser cannot open a local folder from a URL, but
 * Classify already remembers the user's datasets-root folder, so the startup
 * auto-open can jump straight to the named dataset instead of the last-used one.
 *
 * The param is read once per page load (cached) and stripped from the address
 * bar, so a later refresh doesn't keep re-requesting the same dataset.
 */
const PARAM = 'dataset'
let cached: string | null | undefined

export function getRequestedDatasetFolderName(): string | null {
  if (cached !== undefined) return cached
  cached = null
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(window.location.href)
    const raw = url.searchParams.get(PARAM)?.trim() ?? ''
    // This is a folder *name* inside the datasets root — never a path. Reject
    // anything that could escape the root.
    if (raw && !raw.includes('/') && !raw.includes('\\') && raw !== '.' && raw !== '..') {
      cached = raw
    }
    if (url.searchParams.has(PARAM)) {
      url.searchParams.delete(PARAM)
      window.history.replaceState(window.history.state, '', url.toString())
    }
  } catch {
    cached = null
  }
  return cached
}
