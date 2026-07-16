import { atom } from 'nanostores'
import type { DetectionEntity } from '~/models/detection.types'

export type ClusterMoveSnapshot = {
  kind: 'cluster-move'
  leafGroupIds: string[]
  prevClusterIds: Record<string, number | undefined>
}

export type IdentificationSnapshot = {
  kind: 'identification'
  leafGroupIds: string[]
  prevDetections: Record<string, DetectionEntity>
}

export type ClusterUndoSnapshot = ClusterMoveSnapshot | IdentificationSnapshot

export const clusterUndoStackStore = atom<ClusterUndoSnapshot[]>([])

export function pushClusterUndo(snapshot: ClusterUndoSnapshot) {
  const stack = clusterUndoStackStore.get()
  const next = [...stack, snapshot]
  if (next.length > 20) next.shift()
  clusterUndoStackStore.set(next)
}

export function popClusterUndo(): ClusterUndoSnapshot | undefined {
  const stack = clusterUndoStackStore.get()
  if (!stack.length) return undefined
  clusterUndoStackStore.set(stack.slice(0, -1))
  return stack[stack.length - 1]
}
