import type { DetectionEntity } from '~/models/detection.types'

export type LeafGroupScopeEntity = {
  id?: string
  datasetId?: string
  /** @deprecated v4 cache / legacy hydration; prefer datasetId */
  projectId?: string
  siteId?: string
  deploymentId?: string
}

export function resolveDatasetId(leafGroup?: Pick<LeafGroupScopeEntity, 'datasetId' | 'projectId'>): string | undefined {
  return leafGroup?.datasetId ?? leafGroup?.projectId
}

export function resolveDatasetIdForLeafGroup(params: {
  leafGroupId: string
  leafGroups?: Record<string, LeafGroupScopeEntity>
}): string | undefined {
  const { leafGroupId, leafGroups } = params
  const id = (leafGroupId ?? '').trim()
  if (!id) return undefined

  const scopeId = resolveDatasetId(leafGroups?.[id])
  if (scopeId) return scopeId

  const parts = id.split('/').filter(Boolean)
  return parts[0]
}

/**
 * Whether a leaf group id belongs to the open dataset scope.
 * Prefer entity datasetId; legacy path-shaped ids use prefix fallback only when entity is missing.
 */
export function isLeafGroupInDataset(params: {
  leafGroupId: string
  datasetId?: string
  leafGroups?: Record<string, LeafGroupScopeEntity>
}) {
  const { leafGroupId, datasetId, leafGroups } = params
  if (!datasetId) return true

  const id = (leafGroupId ?? '').trim()
  if (!id) return false

  const leafGroup = leafGroups?.[id]
  const scopeId = resolveDatasetId(leafGroup)
  if (scopeId) return scopeId === datasetId

  return id.startsWith(`${datasetId}/`)
}

export function isDetectionInDataset(params: {
  detection?: Pick<DetectionEntity, 'leafGroupId'>
  datasetId?: string
  leafGroups?: Record<string, LeafGroupScopeEntity>
}) {
  const { detection, datasetId, leafGroups } = params
  const leafGroupId = (detection?.leafGroupId ?? '').trim()
  if (!leafGroupId) return false

  return isLeafGroupInDataset({ leafGroupId, datasetId, leafGroups })
}

/** v4 session cache rows may use projectId instead of datasetId */
export type LeafGroupCacheRow = LeafGroupScopeEntity & {
  name: string
  siteId: string
  deploymentId: string
}

export function normalizeLeafGroupFromCache(leafGroup: LeafGroupCacheRow): LeafGroupCacheRow {
  const datasetId = resolveDatasetId(leafGroup)
  if (!datasetId || leafGroup.datasetId === datasetId) return leafGroup

  const { projectId: _legacy, ...rest } = leafGroup
  return { ...rest, datasetId }
}

export function normalizeLeafGroupsFromCache(
  leafGroups: Record<string, LeafGroupCacheRow>,
): Record<string, LeafGroupCacheRow> {
  const next: Record<string, LeafGroupCacheRow> = {}
  for (const [id, leafGroup] of Object.entries(leafGroups)) {
    next[id] = normalizeLeafGroupFromCache(leafGroup)
  }
  return next
}
