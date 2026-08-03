import { findRelativeFilesUnderDirectory } from './fs-find-files'
import type { DatasetFolderKind } from './classify-dataset-folder'
import { resolveLegacyWrapperDirNameFromRelativePaths } from './legacy-wrapper-paths'
import { resolveLegacyContentRootHandle } from './resolve-legacy-content-root'
import { getPackageSourceDirectoryHandle } from './move-legacy-into-package-source'
import { PACKAGE_ARCHIVE_DIR } from './reserved-paths'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

export type PackageSourceLayout = 'in_place' | 'archive'

export type ResolvedPackageSourceLayout = {
  sourceHandle: FileSystemDirectoryHandleLike
  packageRelativeSourcePrefix: string
  layout: PackageSourceLayout
  legacySourceRootName?: string
}

export async function resolvePackageSourceLayout(params: {
  packageHandle: FileSystemDirectoryHandleLike
  kind: Exclude<DatasetFolderKind, 'package' | 'skip'>
  /** Sibling `_processed/<folderName>` directory, required when kind is 'mothbox-processed-sibling'. */
  processedMirrorHandle?: FileSystemDirectoryHandleLike | null
}): Promise<ResolvedPackageSourceLayout> {
  const { packageHandle, kind, processedMirrorHandle } = params

  if (kind === 'source-only') {
    const sourceHandle = await getPackageSourceDirectoryHandle(packageHandle)
    return {
      sourceHandle,
      packageRelativeSourcePrefix: PACKAGE_ARCHIVE_DIR,
      layout: 'archive',
    }
  }

  if (kind === 'mothbox-processed' || kind === 'ami') {
    return {
      sourceHandle: packageHandle,
      packageRelativeSourcePrefix: '',
      layout: 'in_place',
    }
  }

  if (kind === 'mothbox-processed-sibling') {
    if (!processedMirrorHandle) {
      throw new Error(
        'Expected a sibling _processed mirror folder for this dataset, but none was found. The folder may have moved.',
      )
    }
    // Everything the adapter needs (bot/identified JSON and the patch image
    // crops) already lives together under the _processed mirror folder, in
    // the same in-place layout as `mothbox-processed`. No overlay needed —
    // just point the source at the mirror directly.
    return {
      sourceHandle: processedMirrorHandle,
      packageRelativeSourcePrefix: '',
      layout: 'in_place',
    }
  }

  const legacyRoot = await resolveLegacyContentRootHandle(packageHandle)
  const assetPaths = await findRelativeFilesUnderDirectory(legacyRoot, (name) => name.endsWith('_botdetection.json'))

  const wrapperName = resolveLegacyWrapperDirNameFromRelativePaths(assetPaths)
  const legacyRootName = (legacyRoot as { name?: string }).name?.trim()
  const packageName = (packageHandle as { name?: string }).name?.trim()

  const isNestedLegacyRoot = legacyRootName !== packageName && !!legacyRootName
  const packageRelativeSourcePrefix = isNestedLegacyRoot ? legacyRootName : wrapperName ?? ''

  return {
    sourceHandle: legacyRoot,
    packageRelativeSourcePrefix,
    layout: 'in_place',
    legacySourceRootName: wrapperName ?? (isNestedLegacyRoot ? legacyRootName : undefined),
  }
}

export function toPackageRelativeAssetPath(params: { sourcePrefix: string; pathRelativeToSource: string }): string {
  const { sourcePrefix, pathRelativeToSource } = params
  const prefix = sourcePrefix.trim().replace(/\/+$/, '')
  const rel = pathRelativeToSource.replace(/^\/+/, '')
  if (!prefix) return rel
  if (!rel) return prefix
  return `${prefix}/${rel}`.replaceAll('\\', '/')
}
