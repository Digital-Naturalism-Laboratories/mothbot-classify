import { makeZip } from 'client-zip'
import type { PackageZipPlan } from './plan-package-zip'

export type PackageZipProgress = { done: number; total: number; path: string }

export type PackageZipResult = {
  fileCount: number
  /** Files the records point to that weren't found in the package folder. */
  missing: string[]
}

export const EXPORT_REPORT_NAME = 'export-report.json'

/**
 * Streams a planned export into `writable` as a zip (zip64, so any number of files and
 * any size). Files are read one at a time while the zip is written, so memory stays flat
 * however large the export is. Images are stored as they are (they are already
 * compressed). Missing files are skipped and listed in `export-report.json` in the zip.
 */
export async function writePackageZip(params: {
  plan: PackageZipPlan
  readFile: (packageRelativePath: string) => Promise<File | null>
  writable: WritableStream<Uint8Array>
  onProgress?: (progress: PackageZipProgress) => void
  signal?: AbortSignal
  report?: Record<string, unknown>
}): Promise<PackageZipResult> {
  const { plan, readFile, writable, onProgress, signal } = params
  const missing: string[] = []
  let fileCount = 0
  const total = plan.entries.length
  const now = new Date()

  async function* inputs() {
    for (let i = 0; i < plan.entries.length; i++) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
      const entry = plan.entries[i]!
      onProgress?.({ done: i, total, path: entry.path })
      if (entry.kind === 'text') {
        fileCount++
        yield { name: entry.path, input: entry.text, lastModified: now }
        continue
      }
      const file = await readFile(entry.path)
      if (!file) {
        missing.push(entry.path)
        continue
      }
      fileCount++
      yield { name: entry.path, input: file, lastModified: new Date(file.lastModified || now.getTime()), size: file.size }
    }
    const report = {
      exportedAt: now.toISOString(),
      app: 'Mothbot Classify',
      sessionCount: plan.sessionCount,
      patchCount: plan.patchCount,
      fileCount,
      missingFiles: missing,
      ...params.report,
    }
    yield { name: EXPORT_REPORT_NAME, input: JSON.stringify(report, null, 2) + '\n', lastModified: now }
    onProgress?.({ done: total, total, path: EXPORT_REPORT_NAME })
  }

  await makeZip(inputs()).pipeTo(writable, { signal })
  return { fileCount: fileCount + 1, missing }
}
