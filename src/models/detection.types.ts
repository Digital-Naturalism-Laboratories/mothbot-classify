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
  leafGroupId: string
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
  botClassifierId?: string
  // When user types free text identification, store the morphospecies string
  morphospecies?: string
  speciesListId?: string
  /** Species list (DOI, or GBIF download URL while its DOI is pending) the current ID was made from. */
  speciesListDOI?: string
  /** Taxa Mothbot Process left out of the choices for a bot ID (e.g. "light-trap-exclusions@d62bede7"). */
  speciesListExclusions?: string
  // Original label from bot detection JSON (e.g., "ORDER_Diptera")
  originalMothboxLabel?: string
  /** Species list the original bot ID used — kept after a human re-identifies with another list. */
  originalMothboxSpeciesList?: string
  /** Exclusions the original bot ID used. */
  originalMothboxSpeciesListExclusions?: string
  classificationType?: DetectionClassificationType
  humanClassifierId?: string
  pixelMassPixels?: number
  pixelMassMm2?: number | null
  pixelMassTimestamp?: string
  /** How Mothbot Process outlined the insect for pixel mass (a rembg model name, or 'border-colour-mask/v1'). */
  pixelMassMethod?: string
  detectorId?: string
  /** When Mothbot Process clustered this detection (its raw `timestamp_cluster`), from the package records. */
  clusteredAt?: string
}
