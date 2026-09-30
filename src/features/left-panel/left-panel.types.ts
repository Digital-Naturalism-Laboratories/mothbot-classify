export type NightWarnings = {
  jsonWithoutPhotoCount?: number
  missingPatchImageCount?: number
}

export type TaxonomyNode = {
  rank: 'class' | 'order' | 'family' | 'genus' | 'species'
  name: string
  count: number
  children?: TaxonomyNode[]
  isMorpho?: boolean
}

export type LeafGroupLeftPanelProps = {
  leafGroupId: string
  hasMachineIdentification?: boolean
  unassignedCount?: number
  taxonomyAuto?: TaxonomyNode[]
  taxonomyUser?: TaxonomyNode[]
  totalPatches: number
  totalDetections: number
  totalIdentified?: number
  sizeThreshold: number
  sizeThresholdMax: number
  groupByTaxon: boolean
  clusteredFirst: boolean
  groupByClusters: boolean
  sortBySize: boolean
  /** Order blurriest first by blurriness (overrides size). */
  sortByBlur?: boolean
  /** Hide patches blurrier than this (0-100); 100 shows all. */
  blurLimit?: number
  /** Whether any patch in view has a blurriness score. */
  hasBlurData?: boolean
  reversed: boolean
  clustersCollapsed: boolean
  onSizeThresholdChange: (value: number) => void
  onGroupByTaxonChange: (enabled: boolean) => void
  onClusteredFirstChange: (enabled: boolean) => void
  onGroupByClustersChange: (enabled: boolean) => void
  onSortBySizeChange: (enabled: boolean) => void
  onSortByBlurChange?: (enabled: boolean) => void
  onBlurLimitChange?: (value: number) => void
  onReversedChange: (enabled: boolean) => void
  onClustersCollapsedChange: (enabled: boolean) => void
  availableDetectorIds?: string[]
  selectedDetectorId?: string
  onDetectorChange?: (detectorId: string) => void
  /** User-flagged errors for the night, scoped to the visible detector run. */
  errorCount?: number
  /** Present only when the night is too large to show at once (see night-parts.ts). */
  nightParts?: Array<{ label: string; count: number }>
  /** Patches in the whole night, for the large-night notice. */
  nightPartsTotal?: number
  selectedNightPart?: number | 'all'
  onNightPartChange?: (choice: number | 'all') => void
  availableBotAlgorithms?: string[]
  selectedBotAlgorithm?: string
  onBotAlgorithmChange?: (algorithm: string) => void
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
  onSelectTaxon: (params: {
    taxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
    bucket: 'auto' | 'user'
  }) => void
  warnings?: NightWarnings
  className?: string
}
