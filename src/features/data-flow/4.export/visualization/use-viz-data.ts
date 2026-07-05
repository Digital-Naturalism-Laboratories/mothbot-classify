import { useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { detectionsStore } from '~/stores/entities/detections'
import { buildVizData, getAvailableTaxaKeys, type VizData } from './viz-data'
import type { VizConfig } from './viz-types'

export function useVizData(config: VizConfig): VizData {
  // Subscribe to detections so this updates when detections change
  useStore(detectionsStore)
  return useMemo(() => buildVizData(config), [config])
}

export function useAvailableTaxaKeys(leafGroupIds: string[], taxaRank: VizConfig['taxaRank']): string[] {
  useStore(detectionsStore)
  return useMemo(() => getAvailableTaxaKeys(leafGroupIds, taxaRank), [leafGroupIds, taxaRank])
}
