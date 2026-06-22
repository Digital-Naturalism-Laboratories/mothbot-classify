import { useStore } from '@nanostores/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { exportScopeDarwinCSV } from '~/features/data-flow/4.export/export-orchestrator'
import {
  ExpandDisclosurePanel,
  ExpandDisclosureTitleRow,
  expandDisclosurePanelId,
} from '~/components/atomic/expand-disclosure'
import { Loader } from '~/components/atomic/Loader'
import { exportingNightIdsStore } from '~/features/data-flow/4.export/export.state'
import { buildLeafGroupLinkParams, isSingleLeafHierarchy } from '~/features/mothbox-next/hierarchy-routes'
import { shouldSkipHierarchyLevel } from '~/features/mothbox-next/build-hierarchy-breadcrumbs'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import type { HierarchyNode, ResolvedHierarchy } from '~/features/mothbox-next/resolve-hierarchy-nodes'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'
import { cn } from '~/utils/cn'
import { InlineProgress } from './inline-progress'
import { ProjectsTreeRowContextMenu } from './item-actions'
import type { ProgressIndex } from './projects-progress'

const projectsTreeDeepRowTitleClass = 'text-neutral-900'
const projectsTreeRowClass =
  'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-12'
const projectsTreeRowTitleClass = 'flex min-w-0 items-center'
const projectsTreeIndentChildClass = 'pl-8'
const projectsTreeIndentLeafClass = 'ml-[38px]'

type ManifestHierarchyTreeProps = {
  projectId: string
  nights: Record<string, LeafGroupEntity>
  progressIndex: ProgressIndex
}

export function ManifestHierarchyTree(props: ManifestHierarchyTreeProps) {
  const { projectId, nights, progressIndex } = props
  const resolved = useStore(activeHierarchyStore)
  const folderName = useStore(activeDatasetFolderNameStore)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (!resolved) return null

  return (
    <div className='shadow-border rounded-xl bg-white p-8'>
      <HierarchyTreeLevel
        levelIndex={0}
        parentId={undefined}
        projectId={projectId}
        folderName={folderName}
        nights={nights}
        progressIndex={progressIndex}
        resolved={resolved}
        collapsed={collapsed}
        onToggle={(nodeKey) => setCollapsed((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }))}
      />
    </div>
  )
}

type HierarchyTreeLevelProps = {
  levelIndex: number
  parentId?: string
  projectId: string
  folderName: string | null
  nights: Record<string, LeafGroupEntity>
  progressIndex: ProgressIndex
  resolved: ResolvedHierarchy
  collapsed: Record<string, boolean>
  onToggle: (nodeKey: string) => void
}

function HierarchyTreeLevel(props: HierarchyTreeLevelProps) {
  const { levelIndex, parentId, projectId, folderName, nights, progressIndex, resolved, collapsed, onToggle } = props

  const level = resolved.hierarchy.levels[levelIndex]
  if (!level) return null

  const allLevelNodes = resolved.nodesByLevel[level.key] ?? []
  const nodes = allLevelNodes.filter((node) => {
    if (!parentId) return !node.parentId
    return node.parentId === parentId
  })

  if (!nodes.length) return null

  if (shouldSkipHierarchyLevel({ level, nodes: allLevelNodes }) && levelIndex === 0) {
    const nextIndex = levelIndex + 1
    if (nextIndex >= resolved.hierarchy.levels.length) return null
    return (
      <HierarchyTreeLevel
        levelIndex={nextIndex}
        parentId={parentId}
        projectId={projectId}
        folderName={folderName}
        nights={nights}
        progressIndex={progressIndex}
        resolved={resolved}
        collapsed={collapsed}
        onToggle={onToggle}
      />
    )
  }

  const isLeafLevel = level.key === resolved.hierarchy.leaf.key
  const childLevelIndex = levelIndex + 1

  return (
    <div className='flex w-full flex-col gap-1'>
      {nodes.map((node) => (
        <HierarchyTreeNode
          key={`${level.key}:${node.id}`}
          node={node}
          levelLabel={level.label}
          isLeafLevel={isLeafLevel}
          childLevelIndex={childLevelIndex}
          projectId={projectId}
          folderName={folderName}
          nights={nights}
          progressIndex={progressIndex}
          resolved={resolved}
          collapsed={collapsed}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

type HierarchyTreeNodeProps = {
  node: HierarchyNode
  levelLabel: string
  isLeafLevel: boolean
  childLevelIndex: number
  projectId: string
  folderName: string | null
  nights: Record<string, LeafGroupEntity>
  progressIndex: ProgressIndex
  resolved: ResolvedHierarchy
  collapsed: Record<string, boolean>
  onToggle: (nodeKey: string) => void
}

function HierarchyTreeNode(props: HierarchyTreeNodeProps) {
  const {
    node,
    levelLabel,
    isLeafLevel,
    childLevelIndex,
    projectId,
    folderName,
    nights,
    progressIndex,
    resolved,
    collapsed,
    onToggle,
  } = props
  const exportingNightIds = useStore(exportingNightIdsStore)
  const nodeKey = `${node.levelKey}:${node.id}`

  if (isLeafLevel) {
    const night = nights[node.id]
    const prog = progressIndex.byLeafGroup[node.id] ?? { total: 0, identified: 0 }
    const isExporting = exportingNightIds.has(node.id)
    const link = buildLeafGroupLinkParams({
      folderName,
      projectId,
      deploymentId: night?.deploymentId ?? projectId,
      night: night ?? { id: node.id, name: node.label },
      singleLeafDataset: isSingleLeafHierarchy(resolved),
    })

    return (
      <ProjectsTreeRowContextMenu scope='night' id={node.id} nights={nights}>
        <Link
          to={link.to}
          params={link.params}
          aria-label={`Open ${levelLabel.toLowerCase()} ${node.label}`}
          className={cn(
            'group/night block h-32 w-full cursor-pointer rounded-md bg-stone-50 hover:bg-blue-100',
            'transition-[background-color] duration-150 ease-out',
          )}
        >
          <div className={cn(projectsTreeRowClass, 'h-full')}>
            <div className={cn(projectsTreeRowTitleClass, 'h-full gap-8', projectsTreeIndentLeafClass)}>
              <span className='min-w-0 truncate text-13 leading-none text-blue-700'>{node.label}</span>
              {isExporting ? (
                <div className='flex shrink-0 items-center gap-4 text-13 text-neutral-500'>
                  <Loader size={14} />
                  <span>exporting</span>
                </div>
              ) : (
                <button
                  type='button'
                  aria-label='Export Darwin Core CSV'
                  className='shrink-0 opacity-0 group-hover/night:opacity-100 transition-opacity flex items-center gap-4 rounded px-6 py-2 text-12 text-neutral-500 hover:text-neutral-800 hover:bg-black/5'
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const p = exportScopeDarwinCSV({ scope: 'night', id: node.id, nights })
                    toast.promise(p, { loading: '💾 Exporting DwC…', success: '✅ DwC exported', error: '🚨 Failed to export DwC' })
                  }}
                >
                  <DownloadIcon className='h-12 w-12' />
                  Export DwC
                </button>
              )}
            </div>
            <InlineProgress total={prog.total} identified={prog.identified} />
          </div>
        </Link>
      </ProjectsTreeRowContextMenu>
    )
  }

  const childLevel = resolved.hierarchy.levels[childLevelIndex]
  const childNodes = childLevel
    ? (resolved.nodesByLevel[childLevel.key] ?? []).filter((child) => child.parentId === node.id)
    : []
  const hasChildren = childNodes.length > 0
  const isExpanded = !collapsed[nodeKey]
  const panelId = expandDisclosurePanelId({ namespace: 'hierarchy-tree', segment: node.levelKey, entityId: node.id })
  const prog = progressForBranch({ progressIndex, node, resolved })

  return (
    <div className='group/branch w-full'>
      <ProjectsTreeRowContextMenu scope='deployment' id={node.id} nights={nights}>
        <div className={projectsTreeRowClass}>
          <div className={cn(projectsTreeRowTitleClass, projectsTreeIndentChildClass)}>
            <div className='min-w-0'>
              <ExpandDisclosureTitleRow
                collapsible={hasChildren}
                expanded={isExpanded}
                panelId={panelId}
                onToggle={() => onToggle(nodeKey)}
                expandAriaLabel={`Expand ${levelLabel.toLowerCase()} ${node.label}`}
                collapseAriaLabel={`Collapse ${levelLabel.toLowerCase()} ${node.label}`}
                titleClassName={projectsTreeDeepRowTitleClass}
              >
                {node.label}
              </ExpandDisclosureTitleRow>
            </div>
          </div>
          <InlineProgress total={prog.total} identified={prog.identified} />
        </div>
      </ProjectsTreeRowContextMenu>
      {hasChildren ? (
        <ExpandDisclosurePanel id={panelId} hidden={!isExpanded} className='w-full'>
          <HierarchyTreeLevel
            levelIndex={childLevelIndex}
            parentId={node.id}
            projectId={projectId}
            folderName={folderName}
            nights={nights}
            progressIndex={progressIndex}
            resolved={resolved}
            collapsed={collapsed}
            onToggle={onToggle}
          />
        </ExpandDisclosurePanel>
      ) : null}
    </div>
  )
}

function progressForBranch(params: {
  progressIndex: ProgressIndex
  node: HierarchyNode
  resolved: ResolvedHierarchy
}) {
  const { progressIndex, node, resolved } = params
  const leafIds = collectLeafIdsUnderNode({ resolved, node })
  let total = 0
  let identified = 0

  for (const leafId of leafIds) {
    const prog = progressIndex.byLeafGroup[leafId]
    if (!prog) continue
    total += prog.total
    identified += prog.identified
  }

  return { total, identified }
}

function collectLeafIdsUnderNode(params: { resolved: ResolvedHierarchy; node: HierarchyNode }) {
  const { resolved, node } = params
  const leafKey = resolved.hierarchy.leaf.key

  if (node.levelKey === leafKey) return [node.id]

  const childLevelIndex = resolved.hierarchy.levels.findIndex((level) => level.key === node.levelKey) + 1
  const childLevel = resolved.hierarchy.levels[childLevelIndex]
  if (!childLevel) return []

  const children = (resolved.nodesByLevel[childLevel.key] ?? []).filter((child) => child.parentId === node.id)
  if (!children.length) return []

  if (childLevel.key === leafKey) return children.map((child) => child.id)

  return children.flatMap((child) => collectLeafIdsUnderNode({ resolved, node: child }))
}
