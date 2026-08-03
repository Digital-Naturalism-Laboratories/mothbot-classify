import type { TaxonRecord } from '~/models/taxonomy/types'
import type { ClassificationType, ClassifierType } from './classification-types'

export type PatchRecord = {
  patch_id: string
  dataset_id: string
  asset_path: string
  media_type?: string
  captured_at?: string
  deployment_id?: string
  camera_day_id?: string
  cluster_id?: number
  clustered_at?: string
  detector_id?: string
}

export type PatchSourceRecord = {
  patch_id: string
  source_type: string
  source_photo_id?: string
  source_photo_asset_path?: string
  original_patch_path?: string
  original_bot_detection_path?: string
  source_bot_detection_id?: string
  crop_points?: number[][]
  crop_direction?: number
  crop_shape_type?: string
  metadata_path?: string
  source_image_id?: string
  source_photo_url?: string
  crop_url?: string
  source_metadata?: Record<string, unknown>
}

export type DeploymentRecord = {
  deployment_id: string
  site_id?: string
  device_id?: string
  site_name_from_folder?: string
  device_id_from_folder?: string
  deployment_start_from_folder?: string
  dataset_name_from_folder?: string
}

export type CameraDayRecord = {
  camera_day_id: string
  deployment_id?: string
  device_id?: string
  night_date?: string
}

/** iNaturalist (or other) URLs keyed by normalized morphospecies label. */
export type MorphoLinkRecord = {
  morpho_key: string
  url: string
}

export type ClassificationRecord = {
  patch_id: string
  classifier_id: string
  classifier_type: ClassifierType
  classification_type: ClassificationType
  label?: string | null
  taxon?: TaxonRecord | null
  morphospecies?: string | null
  is_error?: boolean
  confidence?: number | null
  classified_at?: number | null
  source_bot_detection_id?: string | null
  resolved_from?: string
  pixel_mass_pixels?: number | null
  pixel_mass_mm2?: number | null
  pixel_mass_timestamp?: string | null
}

export type CurrentClassificationRecord = ClassificationRecord & {
  resolved_from?: string
}
