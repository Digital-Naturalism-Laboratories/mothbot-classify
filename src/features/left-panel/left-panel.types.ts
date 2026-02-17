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
  taxonomyAuto?: TaxonomyNode[]
  taxonomyUser?: TaxonomyNode[]
  totalPatches: number
  totalDetections: number
  totalIdentified?: number
  sortByClusters: boolean
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
