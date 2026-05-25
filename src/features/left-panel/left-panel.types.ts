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

export type NightLeftPanelProps = {
  nightId: string
  taxonomyAuto?: TaxonomyNode[]
  taxonomyUser?: TaxonomyNode[]
  totalPatches: number
  totalDetections: number
  totalIdentified?: number
  sizeThreshold: number
  sizeThresholdMax: number
  sortByClusters: boolean
  onSizeThresholdChange: (value: number) => void
  onSortByClustersChange: (enabled: boolean) => void
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
  onSelectTaxon: (params: {
    taxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
    bucket: 'auto' | 'user'
  }) => void
  warnings?: NightWarnings
  className?: string
}
