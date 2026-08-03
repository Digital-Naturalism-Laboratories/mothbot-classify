import { useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { detectionsStore } from '~/stores/entities/detections'
import { selectedPatchIdsStore } from '~/stores/ui'
import { buildVizDetections, getAvailableTaxaKeysForConfig, type VizDetectionSet } from './viz-data'
import type { VizConfig } from './viz-types'

export function useVizDetections(config: VizConfig): VizDetectionSet {
  useStore(detectionsStore)
  useStore(selectedPatchIdsStore)
  return useMemo(() => buildVizDetections(config), [config])
}

export function useAvailableTaxaKeys(config: VizConfig): string[] {
  useStore(detectionsStore)
  useStore(selectedPatchIdsStore)
  return useMemo(() => getAvailableTaxaKeysForConfig(config), [config])
}
