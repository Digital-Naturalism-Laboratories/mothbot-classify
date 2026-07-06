export type VizChartType = 'bar' | 'radial' | 'pack'
export type VizGroupBy = 'cluster' | 'taxa'
export type VizTaxaRank = 'order' | 'family' | 'genus' | 'species'
export type VizRepresentativeMode = 'first' | 'most-common'

export type VizConfig = {
  chartType: VizChartType
  selectedLeafGroupIds: string[]
  groupBy: VizGroupBy
  taxaRank: VizTaxaRank
  taxaFilter: string[]
  representativeMode: VizRepresentativeMode
  preferNobg: boolean
  outputWidth: number
  outputHeight: number
}

export function defaultVizConfig(leafGroupIds: string[]): VizConfig {
  return {
    chartType: 'pack',
    selectedLeafGroupIds: leafGroupIds,
    groupBy: 'taxa',
    taxaRank: 'family',
    taxaFilter: [],
    representativeMode: 'first',
    preferNobg: true,
    outputWidth: 3000,
    outputHeight: 2000,
  }
}
