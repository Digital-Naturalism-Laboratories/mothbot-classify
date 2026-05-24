import type { TaxonRecord } from '~/models/taxonomy/types'

export type DetectionClassificationType = 'accept' | 'taxon' | 'morphospecies' | 'error'

/**
 * Core detection entity type.
 * Represents a single detection (patch) with its identification state.
 *
 * This type is defined here to avoid circular dependencies between:
 * - stores/entities/detections.ts (state management)
 * - features/data-flow/2.identify/identify.ts (identification logic)
 * - models/detection-shapes.ts (shape transformations)
 *
 * Note: To check if a detection is a morphospecies, use `!!detection.morphospecies`.
 * The deprecated `isMorpho` field has been removed.
 */
export type DetectionEntity = {
  id: string
  patchId: string
  photoId: string
  nightId: string
  label?: string
  taxon?: TaxonRecord
  score?: number
  direction?: number
  shapeType?: string
  points?: number[][]
  detectedBy?: 'auto' | 'user'
  identifiedAt?: number
  isError?: boolean
  clusterId?: number
  // When user types free text identification, store the morphospecies string
  morphospecies?: string
  speciesListId?: string
  speciesListDOI?: string
  // Original label from bot detection JSON (e.g., "ORDER_Diptera")
  originalMothboxLabel?: string
  classificationType?: DetectionClassificationType
}

