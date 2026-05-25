import { deploymentRecordDisplayName } from './hierarchy-display-labels'
import { isDefaultLeafCameraDayId, resolveHierarchyFromManifest, type HierarchyDef } from './hierarchy-manifest'
import { isPatchImagesOnlyPackage, FLAT_PATCH_IMAGES_LEAF_LABEL } from './normalize-flat-patch-images-records'
import type { MothboxNextDatasetManifest } from './dataset-manifest'
import type { CameraDayRecord, DeploymentRecord, PatchSourceRecord } from './records'

export type HierarchyNode = {
  levelKey: string
  id: string
  label: string
  parentId?: string
  parentLevelKey?: string
}

export type ResolvedHierarchy = {
  hierarchy: HierarchyDef
  nodesByLevel: Record<string, HierarchyNode[]>
  nodeByKey: Record<string, HierarchyNode>
  leafGroupIds: string[]
}

export function hierarchyNodeKey(params: { levelKey: string; id: string }) {
  return `${params.levelKey}:${params.id}`
}

export function resolveHierarchyNodes(params: {
  manifest: MothboxNextDatasetManifest
  deployments: DeploymentRecord[]
  cameraDays: CameraDayRecord[]
  patchSources?: PatchSourceRecord[]
}): ResolvedHierarchy {
  const { manifest, deployments, cameraDays, patchSources = [] } = params
  const cameraDayIds = cameraDays.map((row) => row.camera_day_id).filter(Boolean)
  const hierarchy = resolveHierarchyFromManifest({ manifest, cameraDayIds, patchSources })
  const flatPatchImages = isPatchImagesOnlyPackage({
    manifest: { ...manifest, hierarchy },
    patchSources,
    deployments,
  })

  const nodesByLevel: Record<string, HierarchyNode[]> = {}
  const nodeByKey: Record<string, HierarchyNode> = {}

  for (const level of hierarchy.levels) {
    const rows = flatPatchImages && level.key === hierarchy.leaf.key
      ? cameraDays.slice(0, 1)
      : rowsForLevel({ level, deployments, cameraDays })
    const nodes: HierarchyNode[] = []

    for (const row of rows) {
      const id = readField(row, level.id_field)
      if (!id) continue

      const parentField = level.parent_field
      const parentId = parentField ? readField(row, parentField) || undefined : undefined
      const parentLevelKey = parentId ? findParentLevelKey({ hierarchy, levelKey: level.key }) : undefined

      const node: HierarchyNode = {
        levelKey: level.key,
        id,
        label: labelForNode({ levelKey: level.key, row, id }),
        parentId,
        parentLevelKey,
      }

      nodes.push(node)
      nodeByKey[hierarchyNodeKey({ levelKey: level.key, id })] = node
    }

    nodes.sort((a, b) => a.label.localeCompare(b.label))
    nodesByLevel[level.key] = nodes
  }

  const leafLevelKey = hierarchy.leaf.key
  const leafGroupIds = (nodesByLevel[leafLevelKey] ?? []).map((node) => node.id)

  return { hierarchy, nodesByLevel, nodeByKey, leafGroupIds }
}

export function walkAncestorChain(params: {
  resolved: ResolvedHierarchy
  leafGroupId: string
}): HierarchyNode[] {
  const { resolved, leafGroupId } = params
  const leafLevelKey = resolved.hierarchy.leaf.key
  const startKey = hierarchyNodeKey({ levelKey: leafLevelKey, id: leafGroupId })
  const start = resolved.nodeByKey[startKey]
  if (!start) return []

  const chain: HierarchyNode[] = [start]
  let current = start

  while (current.parentId && current.parentLevelKey) {
    const parentKey = hierarchyNodeKey({ levelKey: current.parentLevelKey, id: current.parentId })
    const parent = resolved.nodeByKey[parentKey]
    if (!parent) break
    chain.unshift(parent)
    current = parent
  }

  return chain
}

function rowsForLevel(params: {
  level: HierarchyDef['levels'][number]
  deployments: DeploymentRecord[]
  cameraDays: CameraDayRecord[]
}) {
  const { level, deployments, cameraDays } = params

  if (level.key === 'deployment') return deployments
  if (level.key === 'night') return cameraDays

  if (level.records.includes('deployments')) return deployments
  if (level.records.includes('camera-days')) return cameraDays

  return []
}

function readField(row: Record<string, unknown>, field: string) {
  const value = row[field]
  if (typeof value === 'string') return value.trim()
  return ''
}

function findParentLevelKey(params: { hierarchy: HierarchyDef; levelKey: string }) {
  const { hierarchy, levelKey } = params
  const index = hierarchy.levels.findIndex((level) => level.key === levelKey)
  if (index <= 0) return undefined
  return hierarchy.levels[index - 1]?.key
}

function labelForNode(params: { levelKey: string; row: Record<string, unknown>; id: string }) {
  const { levelKey, row, id } = params

  if (levelKey === 'deployment') {
    return deploymentRecordDisplayName(row as DeploymentRecord)
  }

  if (levelKey === 'night') {
    const nightDate = typeof row.night_date === 'string' ? row.night_date.trim() : ''
    if (nightDate === FLAT_PATCH_IMAGES_LEAF_LABEL) return nightDate
    if (nightDate && !/^\d{4}-\d{2}-\d{2}$/.test(nightDate)) return nightDate
    if (isDefaultLeafCameraDayId(id)) return FLAT_PATCH_IMAGES_LEAF_LABEL
    if (nightDate) return nightDate
    if (id.includes('__')) return id.split('__').pop() ?? id
    return id
  }

  return id
}
