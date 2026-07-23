export type VizLayout = 'bar' | 'radial' | 'shape'
export type VizSortMode = 'size' | 'cluster' | 'taxon' | 'none'
export type VizTaxaRank = 'order' | 'family' | 'genus' | 'species'
/** Selection-first with override: what set of patches to visualize. */
export type VizScope = 'selection' | 'night' | 'dataset'
export type VizBackground = 'transparent' | 'black' | 'white' | 'custom'

export type VizConfig = {
  layout: VizLayout
  scope: VizScope
  /** Night(s) used when scope === 'night'. */
  selectedLeafGroupIds: string[]

  // ordering / selection
  sortMode: VizSortMode
  taxaRank: VizTaxaRank
  taxaFilter: string[]
  onePerCluster: boolean
  excludeNoise: boolean
  limit: number // 0 = all

  // patch images
  preferNobg: boolean
  requireNobg: boolean
  blurDropPct: number
  opacityDropPct: number

  // canvas / style
  outputWidth: number // radial is square; bar auto-heights; shape uses mask aspect
  scale: number
  padding: number
  background: VizBackground
  bgColor: string // hex, used when background === 'custom'
  seed: number
}

export function defaultVizConfig(leafGroupIds: string[], hasSelection: boolean): VizConfig {
  return {
    layout: 'radial',
    scope: hasSelection ? 'selection' : 'night',
    selectedLeafGroupIds: leafGroupIds,
    sortMode: 'size',
    taxaRank: 'family',
    taxaFilter: [],
    onePerCluster: false,
    excludeNoise: false,
    limit: 0, // all
    preferNobg: true,
    requireNobg: false,
    blurDropPct: 0,
    opacityDropPct: 0,
    outputWidth: 4500,
    scale: 0.2,
    padding: 2,
    background: 'transparent',
    bgColor: '#3050a0',
    seed: 42,
  }
}

/** Resolve the config's background to an [r,g,b] tuple, or null for transparent. */
export function resolveBackground(config: VizConfig): [number, number, number] | null {
  switch (config.background) {
    case 'transparent': return null
    case 'black': return [0, 0, 0]
    case 'white': return [255, 255, 255]
    case 'custom': return hexToRgb(config.bgColor) ?? null
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length < 6) return null
  const n = Number.parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return null
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
