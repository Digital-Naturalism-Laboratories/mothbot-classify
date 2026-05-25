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
}

export type DeploymentRecord = {
  deployment_id: string
  site_id?: string
  device_id?: string
}

export type CameraDayRecord = {
  camera_day_id: string
  deployment_id?: string
  device_id?: string
  night_date?: string
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
}

export type CurrentClassificationRecord = ClassificationRecord & {
  resolved_from?: string
}
