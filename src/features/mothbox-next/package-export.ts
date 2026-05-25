import type { DetectionEntity } from '~/models/detection.types'
import type { PatchEntity } from '~/stores/entities/5.patches'
import { deriveTaxonNameFromDetection } from '~/models/taxonomy/extract'

export type PackageExportRow = {
  patch_id: string
  asset_path: string
  night_id: string
  photo_id: string
  scientific_name: string
  detected_by: string
  classification_type: string
}

export function buildPackageExportRows(params: {
  patches: Record<string, PatchEntity>
  detections: Record<string, DetectionEntity>
}): PackageExportRow[] {
  const { patches, detections } = params
  const rows: PackageExportRow[] = []

  for (const patch of Object.values(patches)) {
    const detection = detections[patch.id]
    if (!detection) continue

    rows.push({
      patch_id: patch.id,
      asset_path: patch.imageFile?.path ?? '',
      night_id: patch.leafGroupId,
      photo_id: patch.photoId,
      scientific_name: deriveTaxonNameFromDetection({ detection }) ?? detection.label ?? '',
      detected_by: detection.detectedBy ?? 'auto',
      classification_type: detection.isError ? 'error' : detection.morphospecies ? 'morphospecies' : 'taxon',
    })
  }

  return rows.sort((a, b) => a.patch_id.localeCompare(b.patch_id))
}

export const PACKAGE_EXPORT_CSV_HEADERS = [
  'patch_id',
  'asset_path',
  'night_id',
  'photo_id',
  'scientific_name',
  'detected_by',
  'classification_type',
] as const
