import type { PatchEntity } from '~/stores/entities/5.patches'
import type { IndexedFile } from '~/features/data-flow/1.ingest/files.state'
import { ensureFileFromIndexed } from './catalog-utils'

export type PreviewPair = {
  leafGroupId: string
  patchId: string
}

export async function resolvePreviewFileFromPairs(params: {
  previewPairs: PreviewPair[]
  patches?: Record<string, PatchEntity>
  patchMapByNight?: Record<string, Record<string, IndexedFile>>
}) {
  const { previewPairs, patches, patchMapByNight } = params

  for (const pair of previewPairs) {
    const indexed = patches?.[pair.patchId]?.imageFile
    if (!indexed) continue

    const file = await ensureFileFromIndexed(indexed)
    if (file) return file
  }

  for (const pair of previewPairs) {
    const mapForNight = patchMapByNight?.[pair.leafGroupId]
    const indexed = mapForNight?.[pair.patchId.toLowerCase()]
    if (!indexed) continue

    const file = await ensureFileFromIndexed(indexed)
    if (file) return file
  }

  return undefined
}
