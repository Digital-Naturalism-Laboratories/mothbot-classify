import type { HierarchyDef } from './hierarchy-manifest'
import { buildLeafGroupUrl, resolveLeafGroupIdFromRoute, isSingleLeafHierarchy } from './hierarchy-routes'
import type { ResolvedHierarchy } from './resolve-hierarchy-nodes'
import { walkAncestorChain } from './resolve-hierarchy-nodes'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'

export type HierarchyBreadcrumb = {
  label: string
  entityName: string
  href?: string
}

export function buildHierarchyBreadcrumbs(params: {
  pathname: string
  resolved: ResolvedHierarchy
  folderName?: string | null
  nights: Record<string, Pick<LeafGroupEntity, 'id' | 'name'> | undefined>
}): HierarchyBreadcrumb[] {
  const { pathname, resolved, folderName, nights } = params
  const leafGroupId = resolveLeafGroupIdFromRoute({ pathname, nights, leafGroupIds: resolved.leafGroupIds })
  if (!leafGroupId) return []

  const chain = walkAncestorChain({ resolved, leafGroupId })
  if (!chain.length) return []

  const levelLabelByKey = new Map(resolved.hierarchy.levels.map((level) => [level.key, level.label]))
  const singleLeaf = isSingleLeafHierarchy(resolved)

  return chain.map((node, index) => {
    const isLeaf = index === chain.length - 1
    const entityName = levelLabelByKey.get(node.levelKey) ?? node.levelKey

    return {
      label: node.label,
      entityName,
      href:
        isLeaf && folderName
          ? buildLeafGroupUrl({ folderName, leafGroupId: node.id, singleLeafDataset: singleLeaf })
          : undefined,
    }
  })
}

export function shouldSkipHierarchyLevel(params: {
  level: HierarchyDef['levels'][number]
  nodes: ResolvedHierarchy['nodesByLevel'][string]
}) {
  const { level, nodes } = params
  if (!nodes?.length) return true
  if (level.key === 'deployment' && nodes.length === 1) {
    const id = nodes[0]?.id ?? ''
    if (id.endsWith('/deployment/default') || id.endsWith('/deployment')) return true
  }
  return false
}
