import { applyIndexedFilesState } from './files.initialize'
import { validateFolderSelection } from './package/validate-selection'
import { ingestMothboxNextPackageFromIndexedFiles } from './package/ingest-package'
import { normalizeIndexedPathsToPackageRoot } from '~/features/mothbox-next/package-indexed-access'
import { ingestFilesToStores } from '~/features/data-flow/1.ingest/ingest'
import { detectIngestModeFromFiles } from './ingest-mode'
import { clearMothboxNextPackage } from '~/features/mothbox-next/active-package'
import { overlayHumanDetections } from './overlay-human-detections'
import { formatFilesystemError } from '~/utils/fs-error'

export async function singlePassIngest(params: {
  files: Array<{ file?: File; handle?: unknown; path: string; name: string; size: number }>
  /** Set when `ingestIndexedFolderFiles` already normalized paths. */
  pathsAlreadyNormalized?: boolean
  /** Set when `ingestIndexedFolderFiles` already called `applyIndexedFilesState`. */
  skipIndexedStateApply?: boolean
  /** Set when `ingestIndexedFolderFiles` already validated the folder. */
  skipValidation?: boolean
  /** Extra files used only for resolving full-size source photos outside the package (e.g. a sibling original-source folder when the package lives in a `_processed` mirror). Mothbox-next packages only. */
  extraSourceResolutionFiles?: Array<{ file?: File; handle?: unknown; path: string; name: string; size: number }>
}) {
  try {
    const normalizedFiles = params.pathsAlreadyNormalized
      ? params.files
      : normalizeIndexedPathsToPackageRoot(params.files)
    const tStart = performance.now()
    console.log('🌀 singlePassIngest: start', { totalFiles: normalizedFiles.length })
    if (!Array.isArray(normalizedFiles) || normalizedFiles.length === 0) {
      return { ok: false as const, message: 'No files' }
    }

    let validationMs = 0
    if (!params.skipValidation) {
      const validationMeasured = await measureStep({
        label: 'validated folder structure',
        fn: () => validateFolderSelection({ files: normalizedFiles }),
      })
      const validation = validationMeasured.result
      validationMs = validationMeasured.ms
      if (!validation.ok) {
        return { ok: false as const, message: formatFilesystemError(validation.message) }
      }
    }

    const ingestMode = detectIngestModeFromFiles(normalizedFiles)
    const isPackage = ingestMode === 'mothbox-next'

    const indexApplyMs = params.skipIndexedStateApply
      ? 0
      : await applyIndexedStateStep(normalizedFiles, ingestMode)

    const datasetUpdateMs = 0

    const { ms: ingestMs } = await measureStep({
      label: isPackage ? 'ingested mothbox-next package' : 'ingested files',
      fn: async () => {
        if (isPackage) {
          const result = await ingestMothboxNextPackageFromIndexedFiles({
            files: normalizedFiles as any,
            extraSourceResolutionFiles: params.extraSourceResolutionFiles as any,
          })
          if (!result.ok) throw new Error(result.message)
          return
        }
        clearMothboxNextPackage()
        await ingestFilesToStores({ files: normalizedFiles as any, parseDetectionsForNightId: null })
      },
    })

    // Surface x-anylabeling human detections as a parallel 'HumanDetection'
    // detector (they aren't in the package records). No-op when there are none.
    await measureStep({
      label: 'overlaid human detections',
      fn: () => overlayHumanDetections(),
    })

    const totalMs = Math.round(performance.now() - tStart)
    console.log('🌀 singlePassIngest: total', { totalMs })

    console.log('🌀 singlePassIngest: timings', { validationMs, indexApplyMs, datasetUpdateMs, ingestMs, totalMs })
    console.log('✅ singlePassIngest: complete', { totalFiles: normalizedFiles.length, totalMs })

    return { ok: true as const }
  } catch (err) {
    const message = formatFilesystemError(err)
    console.log('🚨 singlePassIngest: failed', { message, err })
    return { ok: false as const, message }
  }
}

type MeasureStepResult<T> = { result: T; ms: number }

async function applyIndexedStateStep(
  files: Array<{ file?: File; handle?: unknown; path: string; name: string; size: number }>,
  ingestMode: ReturnType<typeof detectIngestModeFromFiles>,
): Promise<number> {
  const measured = await measureStep({
    label: 'applied indexed files',
    fn: () => applyIndexedFilesState({ indexed: files, ingestMode }),
  })
  return measured.ms
}

async function measureStep<T>(params: { label: string; fn: () => T | Promise<T> }): Promise<MeasureStepResult<T>> {
  const { label, fn } = params

  const t = performance.now()

  const result = await fn()
  const ms = Math.round(performance.now() - t)

  console.log('🌀 singlePassIngest: ' + label, { ms })

  const out: MeasureStepResult<T> = { result, ms }
  return out
}
