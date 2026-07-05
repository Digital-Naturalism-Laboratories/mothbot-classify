import { toast } from 'sonner'
import { userSessionStore } from '~/stores/ui'
import { runDinalabMothboxV1Adapter } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/run-adapter'
import { createThrottledProgressCallback } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/adapter-progress'
import { createBrowserDinalabAdapterIO } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'
import type { DinalabAdapterProgressCallback } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/adapter-io'
import { fileExistsAt } from '~/utils/fs-directory-handle'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { sanitizeDatasetFolderName } from './choose-datasets-folder'
import { resolvePackageSourceLayout } from './resolve-package-source-layout'
import { resolveDatasetSetupKind, type DatasetSetupKind } from './resolve-setup-kind'
import { migrateLegacyMorphoLinksInPackage } from '~/features/mothbox-next/morpho-links-package'

const SETUP_DATASET_TOAST_ID = 'setup-dataset-folder'

export async function buildMothboxPackageFromFolder(params: {
  packageHandle: FileSystemDirectoryHandleLike
  folderName: string
  kind?: DatasetSetupKind
  /** Sibling `_processed/<folderName>` directory, when JSON outputs live there instead of nested inside packageHandle. */
  processedMirrorHandle?: FileSystemDirectoryHandleLike | null
  /** Datasets root directory, used as a fallback metadata source for AMI datasets whose parquet/CSV files sit at the root level rather than inside the project folder. */
  rootMetadataHandle?: FileSystemDirectoryHandleLike | null
  onProgress?: DinalabAdapterProgressCallback
}): Promise<{ datasetId: string; patchCount: number }> {
  const { packageHandle, folderName, processedMirrorHandle, rootMetadataHandle, onProgress } = params
  const kind = params.kind ?? (await resolveDatasetSetupKind({ directory: packageHandle, folderName }))
  const datasetId = sanitizeDatasetFolderName(folderName)
  const humanClassifierId = (userSessionStore.get()?.initials || 'user').trim().toLowerCase() || 'user'

  const reportProgress =
    onProgress ??
    createThrottledProgressCallback((progress) => {
      toast.loading(progress.message, {
        id: SETUP_DATASET_TOAST_ID,
        description: progress.description ?? `Setting up “${folderName}”.`,
      })
    })

  const layout = await resolvePackageSourceLayout({ packageHandle, kind, processedMirrorHandle })

  // For the "_processed mirror sibling" layout, all package output
  // (dataset.json, 02_records/, 03_classifications/, adapter-report.json)
  // should be written into the _processed mirror folder, not into the
  // original source folder — source images are often too large to share,
  // so the team's workflow is to share only the _processed side.
  const effectivePackageHandle =
    kind === 'mothbox-processed-sibling' && processedMirrorHandle ? processedMirrorHandle : packageHandle

  reportProgress({
    phase: 'scan',
    message: 'Setting up dataset…',
    description: `Indexing ${folderName}…`,
  })

  const result = await runDinalabMothboxV1Adapter({
    datasetId,
    humanClassifierId,
    retainPatchesInSource: true,
    packageRelativeSourcePrefix: layout.packageRelativeSourcePrefix,
    packageSourceLayout: layout.layout,
    legacySourceRootName: layout.legacySourceRootName,
    folderKind: kind,
    io: createBrowserDinalabAdapterIO({ sourceHandle: layout.sourceHandle, packageHandle: effectivePackageHandle, rootMetadataHandle }),
    // For the sibling-mirror layout, full-size source photos live in the
    // original folder (packageHandle, before swapping to the mirror), not
    // in the mirror used as io.source. Let the adapter fall back to
    // checking there when resolving each photo's real path.
    originalSourceExists:
      kind === 'mothbox-processed-sibling' ? (relativePath) => fileExistsAt(packageHandle, relativePath) : undefined,
    onProgress: reportProgress,
  })

  if ('flush' in reportProgress && typeof reportProgress.flush === 'function') {
    reportProgress.flush()
  }

  const morphoLinks = await migrateLegacyMorphoLinksInPackage({ packageHandle: effectivePackageHandle })
  if (morphoLinks.importedCount > 0) {
    console.log('✅ setup: migrated morpho links', morphoLinks)
  }

  return { datasetId, patchCount: result.patchCount }
}
