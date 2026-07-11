import React from 'react'
import { useStore } from '@nanostores/react'
import { EllipsisIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { clearPatchSelection } from '~/stores/ui'
import { PanelHeading } from '~/styles'
import { collapsedKeysStore, collapseMany, expandMany, makeKey, toggleKey } from './collapse.store'
import { CountsRow } from './counts-row'
import { ClickableRow } from './clickable-row'
import type { TaxonomyNode } from './left-panel.types'
import { TaxonomyRow } from './taxonomy-row'
import { cn } from '~/styles/classed'
import { getBranchSpineProps } from './taxonomy-tree-lines'

export type TaxonomySectionProps = {
  title: string
  nodes?: TaxonomyNode[]
  bucket: 'auto' | 'user'
  sortByClusters?: boolean
  onSortByClustersChange?: (enabled: boolean) => void
  clustersCollapsed?: boolean
  onClustersCollapsedChange?: (enabled: boolean) => void
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
  onSelectTaxon: (params: {
    taxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
    bucket: 'auto' | 'user'
  }) => void
  emptyText: string
  className?: string
  errorsCount?: number
  aggregateLabel?: string
  aggregateCount?: number
  alwaysShowAggregate?: boolean
  availableAlgorithms?: string[]
  selectedAlgorithm?: string
  onAlgorithmChange?: (algorithm: string) => void
}

export function TaxonomySection(props: TaxonomySectionProps) {
  const {
    title,
    nodes,
    bucket,
    sortByClusters = false,
    onSortByClustersChange,
    clustersCollapsed = false,
    onClustersCollapsedChange,
    selectedTaxon,
    selectedBucket,
    onSelectTaxon,
    emptyText,
    className,
    errorsCount = 0,
    aggregateLabel = 'All unapproved',
    aggregateCount,
    alwaysShowAggregate = false,
    availableAlgorithms,
    selectedAlgorithm,
    onAlgorithmChange,
  } = props

  const hasNodes = Array.isArray(nodes) && nodes.length > 0
  const hasErrors = bucket === 'user' && (errorsCount || 0) > 0
  const showAggregate = bucket === 'auto' && (alwaysShowAggregate || hasNodes)
  const showAlgorithms = bucket === 'auto' && Array.isArray(availableAlgorithms) && availableAlgorithms.length >= 1
  if (!hasNodes && !hasErrors && !showAggregate && !showAlgorithms) {
    return (
      <div className={className}>
        <PanelHeading className='mb-6'>{title}</PanelHeading>
        <p className='text-13 text-neutral-500'>{emptyText}</p>
      </div>
    )
  }

  const allCount = aggregateCount ?? (nodes || []).reduce((acc, n) => acc + (n?.count || 0), 0)
  const isAllSelected = !selectedTaxon && selectedBucket === bucket
  const isErrorsSelected = selectedBucket === 'user' && selectedTaxon?.name === 'ERROR'
  const errorsRowIsLast = bucket === 'user' && hasErrors
  const lastNodeIndex = (nodes?.length || 0) - 1

  return (
    <div className={className}>
      <SectionHeader
        title={title}
        bucket={bucket}
        nodes={nodes}
        sortByClusters={sortByClusters}
        onSortByClustersChange={onSortByClustersChange}
        clustersCollapsed={clustersCollapsed}
        onClustersCollapsedChange={onClustersCollapsedChange}
        availableAlgorithms={availableAlgorithms}
        selectedAlgorithm={selectedAlgorithm}
        onAlgorithmChange={onAlgorithmChange}
      />

      <div>
        {showAggregate ? (
          <ClickableRow
            name={aggregateLabel}
            count={allCount}
            selected={isAllSelected}
            className='w-full'
            onSelect={() => {
              clearPatchSelection()
              onSelectTaxon({ taxon: undefined, bucket })
            }}
          />
        ) : null}

        {(nodes || []).map((node, index) => {
          const isInLastBranch = !errorsRowIsLast && index === lastNodeIndex
          if (node.rank === 'class') {
            return (
              <ClassNode
                key={`class-${node.name}`}
                bucket={bucket}
                classNode={node}
                isInLastBranch={isInLastBranch}
                selectedTaxon={selectedTaxon}
                selectedBucket={selectedBucket}
                onSelectTaxon={onSelectTaxon}
              />
            )
          }
          // When genus nodes land at root (e.g. AMI data with no order/family/class),
          // render them with the correct rank so clicks fire genus-level filters.
          if (node.rank === 'genus') {
            return (
              <StandaloneGenusNode
                key={`genus-${node.name}`}
                bucket={bucket}
                genusNode={node}
                isInLastBranch={isInLastBranch}
                selectedTaxon={selectedTaxon}
                selectedBucket={selectedBucket}
                onSelectTaxon={onSelectTaxon}
              />
            )
          }
          return (
            <OrderNode
              key={`order-${node.name}`}
              bucket={bucket}
              orderNode={node}
              isInLastBranch={isInLastBranch}
              selectedTaxon={selectedTaxon}
              selectedBucket={selectedBucket}
              onSelectTaxon={onSelectTaxon}
            />
          )
        })}

        {errorsRowIsLast ? (
          <CountsRow
            label='Errors'
            count={errorsCount || 0}
            selected={isErrorsSelected}
            isAbsoluteLast
            onSelect={() => {
              clearPatchSelection()
              onSelectTaxon({ taxon: { rank: 'species', name: 'ERROR' }, bucket: 'user' })
            }}
          />
        ) : null}

        {!hasNodes && !showAggregate && !hasErrors ? (
          <p className='text-13 text-neutral-500'>{emptyText}</p>
        ) : null}
      </div>
    </div>
  )
}

function SectionHeader(props: {
  title: string
  bucket: 'auto' | 'user'
  nodes?: TaxonomyNode[]
  sortByClusters?: boolean
  onSortByClustersChange?: (enabled: boolean) => void
  clustersCollapsed?: boolean
  onClustersCollapsedChange?: (enabled: boolean) => void
  availableAlgorithms?: string[]
  selectedAlgorithm?: string
  onAlgorithmChange?: (algorithm: string) => void
}) {
  const { title, bucket, nodes, sortByClusters = false, onSortByClustersChange, clustersCollapsed = false, onClustersCollapsedChange, availableAlgorithms, selectedAlgorithm, onAlgorithmChange } = props
  return (
    <div className='mb-6 flex items-center justify-between'>
      <PanelHeading>{title}</PanelHeading>

      <SectionMoreMenu
        bucket={bucket}
        nodes={nodes}
        sortByClusters={sortByClusters}
        onSortByClustersChange={onSortByClustersChange}
        clustersCollapsed={clustersCollapsed}
        onClustersCollapsedChange={onClustersCollapsedChange}
        availableAlgorithms={availableAlgorithms}
        selectedAlgorithm={selectedAlgorithm}
        onAlgorithmChange={onAlgorithmChange}
      />
    </div>
  )
}

function SectionMoreMenu(props: {
  bucket: 'auto' | 'user'
  nodes?: TaxonomyNode[]
  sortByClusters?: boolean
  onSortByClustersChange?: (enabled: boolean) => void
  clustersCollapsed?: boolean
  onClustersCollapsedChange?: (enabled: boolean) => void
  availableAlgorithms?: string[]
  selectedAlgorithm?: string
  onAlgorithmChange?: (algorithm: string) => void
}) {
  const { bucket, nodes, sortByClusters = false, onSortByClustersChange, clustersCollapsed = false, onClustersCollapsedChange, availableAlgorithms, selectedAlgorithm, onAlgorithmChange } = props
  const showAlgorithms = bucket === 'auto' && Array.isArray(availableAlgorithms) && availableAlgorithms.length >= 1
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size='icon-sm' variant='ghostMuted' aria-label='Taxonomy actions' icon={EllipsisIcon} />
      </DropdownMenuTrigger>

      <DropdownMenuContent side='right' align='start' sideOffset={4}>
        {bucket === 'auto' ? (
          <>
            <DropdownMenuCheckboxItem
              checked={sortByClusters}
              onCheckedChange={(checked) => onSortByClustersChange?.(checked === true)}
            >
              Sort by clusters
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={clustersCollapsed}
              onCheckedChange={(checked) => onClustersCollapsedChange?.(checked === true)}
            >
              Collapse all clusters
            </DropdownMenuCheckboxItem>
          </>
        ) : null}

        <DropdownMenuItem onSelect={() => expandMany(allKeysFor(nodes || [], bucket))}>Expand all</DropdownMenuItem>

        <DropdownMenuItem onSelect={() => collapseMany(allKeysFor(nodes || [], bucket))}>Collapse all</DropdownMenuItem>

        {showAlgorithms ? (
          <>
            <DropdownMenuSeparator />
            {availableAlgorithms!.length === 1 ? (
              <>
                <DropdownMenuLabel>ID algorithm</DropdownMenuLabel>
                <div className='px-8 py-4 text-12 text-neutral-500 select-none'>{availableAlgorithms![0]}</div>
              </>
            ) : (
              <>
                <DropdownMenuLabel>ID algorithm</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={selectedAlgorithm ?? ''} onValueChange={(v) => onAlgorithmChange?.(v)}>
                  {availableAlgorithms!.map((alg) => (
                    <DropdownMenuRadioItem key={alg} value={alg}>
                      {alg}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </>
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
function ClassNode(props: {
  bucket: 'auto' | 'user'
  classNode: TaxonomyNode
  isInLastBranch?: boolean
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
  onSelectTaxon: (params: {
    taxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
    bucket: 'auto' | 'user'
  }) => void
}) {
  const { bucket, classNode, isInLastBranch, selectedTaxon, selectedBucket, onSelectTaxon } = props
  const collapsedSet = useStore(collapsedKeysStore)
  const classKey = makeKey({ bucket, rank: 'class', path: `${classNode.name}` })
  const classExpanded = !collapsedSet.has(classKey)
  const hasChildren = !!(classNode.children && classNode.children.length)
  const hasExpandedChildren = hasChildren && classExpanded
  const lastChildIndex = (classNode.children?.length || 0) - 1
  return (
    <div>
      <TaxonomyRow
        rank='class'
        name={classNode.name}
        count={classNode.count}
        selected={selectedBucket === bucket && selectedTaxon?.rank === 'class' && selectedTaxon?.name === classNode.name}
        onSelect={() => {
          clearPatchSelection()
          onSelectTaxon({ taxon: { rank: 'class', name: classNode.name }, bucket })
        }}
        canToggle={hasChildren}
        hasChildren={hasChildren}
        expanded={classExpanded}
        onToggleExpanded={() => toggleKey(classKey)}
        hasExpandedChildren={hasExpandedChildren}
        isAbsoluteLast={isInLastBranch && !hasExpandedChildren}
      />

      {hasExpandedChildren ? (
        <IndentedBranch directRowCount={classNode.children?.length ?? 0}>
          {(classNode.children || []).map((orderNode, index) => (
            <OrderNode
              key={`order-${classNode.name}-${orderNode.name}`}
              bucket={bucket}
              orderNode={orderNode}
              className={classNode.name}
              isInLastBranch={!!isInLastBranch && index === lastChildIndex}
              selectedTaxon={selectedTaxon}
              selectedBucket={selectedBucket}
              onSelectTaxon={onSelectTaxon}
            />
          ))}
        </IndentedBranch>
      ) : null}
    </div>
  )
}

function OrderNode(props: {
  bucket: 'auto' | 'user'
  orderNode: TaxonomyNode
  className?: string
  isInLastBranch?: boolean
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
  onSelectTaxon: (params: {
    taxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
    bucket: 'auto' | 'user'
  }) => void
}) {
  const { bucket, orderNode, className, isInLastBranch, selectedTaxon, selectedBucket, onSelectTaxon } = props
  const collapsedSet = useStore(collapsedKeysStore)
  const orderKey = makeKey({ bucket, rank: 'order', path: `${className ? `${className}/` : ''}${orderNode.name}` })
  const orderExpanded = !collapsedSet.has(orderKey)
  const hasChildren = !!(orderNode.children && orderNode.children.length)
  const hasExpandedChildren = hasChildren && orderExpanded
  const lastChildIndex = (orderNode.children?.length || 0) - 1
  return (
    <div>
      <TaxonomyRow
        rank='order'
        name={orderNode.name}
        count={orderNode.count}
        selected={selectedBucket === bucket && selectedTaxon?.rank === 'order' && selectedTaxon?.name === orderNode.name}
        onSelect={() => {
          clearPatchSelection()
          onSelectTaxon({ taxon: { rank: 'order', name: orderNode.name }, bucket })
        }}
        inBranch={!!className}
        canToggle={hasChildren}
        hasChildren={hasChildren}
        expanded={orderExpanded}
        onToggleExpanded={() => toggleKey(orderKey)}
        hasExpandedChildren={hasExpandedChildren}
        isAbsoluteLast={isInLastBranch && !hasExpandedChildren}
      />

      {hasExpandedChildren ? (
        <IndentedBranch directRowCount={orderNode.children?.length ?? 0}>
          {(orderNode.children || []).map((childNode, index) =>
            childNode.rank === 'genus' ? (
              // Family level absent (e.g. AMI order→genus→species) — render genus directly.
              <GenusNode
                key={`genus-${className ? `${className}-` : ''}${orderNode.name}-${childNode.name}`}
                bucket={bucket}
                orderName={orderNode.name}
                genusNode={childNode}
                isInLastBranch={!!isInLastBranch && index === lastChildIndex}
                selectedTaxon={selectedTaxon}
                selectedBucket={selectedBucket}
                onSelectTaxon={onSelectTaxon}
              />
            ) : (
              <FamilyNode
                key={`family-${className ? `${className}-` : ''}${orderNode.name}-${childNode.name}`}
                bucket={bucket}
                orderName={orderNode.name}
                familyNode={childNode}
                isInLastBranch={!!isInLastBranch && index === lastChildIndex}
                selectedTaxon={selectedTaxon}
                selectedBucket={selectedBucket}
                onSelectTaxon={onSelectTaxon}
              />
            ),
          )}
        </IndentedBranch>
      ) : null}
    </div>
  )
}

function FamilyNode(props: {
  bucket: 'auto' | 'user'
  orderName: string
  familyNode: TaxonomyNode
  isInLastBranch?: boolean
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
  onSelectTaxon: (params: {
    taxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
    bucket: 'auto' | 'user'
  }) => void
}) {
  const { bucket, orderName, familyNode, isInLastBranch, selectedTaxon, selectedBucket, onSelectTaxon } = props
  const collapsedSet = useStore(collapsedKeysStore)
  const familyPath = `${orderName}/${familyNode.name}`
  const familyKey = makeKey({ bucket, rank: 'family', path: familyPath })
  const familyExpanded = !collapsedSet.has(familyKey)
  const hasChildren = !!(familyNode.children && familyNode.children.length)
  const hasExpandedChildren = hasChildren && familyExpanded
  const lastChildIndex = (familyNode.children?.length || 0) - 1
  return (
    <div className='relative'>
      <TaxonomyRow
        rank='family'
        name={familyNode.name}
        count={familyNode.count}
        selected={selectedBucket === bucket && selectedTaxon?.rank === 'family' && selectedTaxon?.name === familyNode.name}
        onSelect={() => {
          clearPatchSelection()
          onSelectTaxon({ taxon: { rank: 'family', name: familyNode.name }, bucket })
        }}
        inBranch
        canToggle={hasChildren}
        hasChildren={hasChildren}
        expanded={familyExpanded}
        onToggleExpanded={() => toggleKey(familyKey)}
        hasExpandedChildren={hasExpandedChildren}
        isAbsoluteLast={isInLastBranch && !hasExpandedChildren}
      />

      {hasExpandedChildren ? (
        <IndentedBranch directRowCount={familyNode.children?.length ?? 0}>
          {(familyNode.children || []).map((genusNode, index) => (
            <GenusNode
              key={`genus-${orderName}-${familyNode.name}-${genusNode.name}`}
              bucket={bucket}
              orderName={orderName}
              familyName={familyNode.name}
              genusNode={genusNode}
              isInLastBranch={!!isInLastBranch && index === lastChildIndex}
              selectedTaxon={selectedTaxon}
              selectedBucket={selectedBucket}
              onSelectTaxon={onSelectTaxon}
            />
          ))}
        </IndentedBranch>
      ) : null}
    </div>
  )
}

// Renders a genus node that appears at the root of the taxonomy tree (i.e. when
// order and family are absent from the data, as in AMI parquet-only datasets).
// Fires rank:'genus' on click so filterPatchesByTaxon matches correctly.
function StandaloneGenusNode(props: {
  bucket: 'auto' | 'user'
  genusNode: TaxonomyNode
  isInLastBranch?: boolean
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
  onSelectTaxon: (params: {
    taxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
    bucket: 'auto' | 'user'
  }) => void
}) {
  const { bucket, genusNode, isInLastBranch, selectedTaxon, selectedBucket, onSelectTaxon } = props
  const collapsedSet = useStore(collapsedKeysStore)
  const genusKey = makeKey({ bucket, rank: 'genus', path: genusNode.name })
  const genusExpanded = !collapsedSet.has(genusKey)
  const hasChildren = !!(genusNode.children && genusNode.children.length)
  const hasExpandedChildren = hasChildren && genusExpanded
  const lastChildIndex = (genusNode.children?.length || 0) - 1
  return (
    <div>
      <TaxonomyRow
        rank='genus'
        name={genusNode.name}
        count={genusNode.count}
        selected={selectedBucket === bucket && selectedTaxon?.rank === 'genus' && selectedTaxon?.name === genusNode.name}
        onSelect={() => {
          clearPatchSelection()
          onSelectTaxon({ taxon: { rank: 'genus', name: genusNode.name }, bucket })
        }}
        canToggle={hasChildren}
        hasChildren={hasChildren}
        expanded={genusExpanded}
        onToggleExpanded={() => toggleKey(genusKey)}
        hasExpandedChildren={hasExpandedChildren}
        isAbsoluteLast={isInLastBranch && !hasExpandedChildren}
      />
      {hasExpandedChildren ? (
        <IndentedBranch directRowCount={genusNode.children?.length ?? 0}>
          {(genusNode.children || []).map((speciesNode, index) => (
            <div key={`species-${genusNode.name}-${speciesNode.name}`} className='relative'>
              <TaxonomyRow
                rank='species'
                name={speciesNode.name}
                count={speciesNode.count}
                selected={
                  selectedBucket === bucket && selectedTaxon?.rank === 'species' && selectedTaxon?.name === speciesNode.name
                }
                onSelect={() => {
                  clearPatchSelection()
                  onSelectTaxon({ taxon: { rank: 'species', name: speciesNode.name }, bucket })
                }}
                inBranch
                isMorphoSpecies={speciesNode.isMorpho}
                isAbsoluteLast={!!isInLastBranch && index === lastChildIndex}
              />
            </div>
          ))}
        </IndentedBranch>
      ) : null}
    </div>
  )
}

function GenusNode(props: {
  bucket: 'auto' | 'user'
  orderName: string
  familyName?: string
  genusNode: TaxonomyNode
  isInLastBranch?: boolean
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
  onSelectTaxon: (params: {
    taxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
    bucket: 'auto' | 'user'
  }) => void
}) {
  const { bucket, orderName, familyName, genusNode, isInLastBranch, selectedTaxon, selectedBucket, onSelectTaxon } = props
  const collapsedSet = useStore(collapsedKeysStore)
  // When family is absent (e.g. AMI order→genus→species), omit it from the path
  // so the collapse key matches what expandLeftPanelPathForSelection generates.
  const genusPath = familyName ? `${orderName}/${familyName}/${genusNode.name}` : `${orderName}/${genusNode.name}`
  const genusKey = makeKey({ bucket, rank: 'genus', path: genusPath })
  const genusExpanded = !collapsedSet.has(genusKey)
  const hasChildren = !!(genusNode.children && genusNode.children.length)
  const hasExpandedChildren = hasChildren && genusExpanded
  const lastChildIndex = (genusNode.children?.length || 0) - 1
  return (
    <div className='relative'>
      <TaxonomyRow
        rank='genus'
        name={genusNode.name}
        count={genusNode.count}
        selected={selectedBucket === bucket && selectedTaxon?.rank === 'genus' && selectedTaxon?.name === genusNode.name}
        onSelect={() => {
          clearPatchSelection()
          onSelectTaxon({ taxon: { rank: 'genus', name: genusNode.name }, bucket })
        }}
        inBranch
        canToggle={hasChildren}
        hasChildren={hasChildren}
        expanded={genusExpanded}
        onToggleExpanded={() => toggleKey(genusKey)}
        hasExpandedChildren={hasExpandedChildren}
        isAbsoluteLast={isInLastBranch && !hasExpandedChildren}
      />

      {hasExpandedChildren ? (
        <IndentedBranch directRowCount={genusNode.children?.length ?? 0}>
          {(genusNode.children || []).map((speciesNode, index) => (
            <div key={`species-${orderName}-${familyName ?? ''}-${genusNode.name}-${speciesNode.name}`} className='relative'>
              <TaxonomyRow
                rank='species'
                name={speciesNode.name}
                count={speciesNode.count}
                selected={selectedBucket === bucket && selectedTaxon?.rank === 'species' && selectedTaxon?.name === speciesNode.name}
                onSelect={() => {
                  clearPatchSelection()
                  onSelectTaxon({ taxon: { rank: 'species', name: speciesNode.name }, bucket })
                }}
                inBranch
                isMorphoSpecies={speciesNode.isMorpho}
                isAbsoluteLast={!!isInLastBranch && index === lastChildIndex}
              />
            </div>
          ))}
        </IndentedBranch>
      ) : null}
    </div>
  )
}

function allKeysFor(nodes: TaxonomyNode[], bucket: 'auto' | 'user'): string[] {
  const keys: string[] = []
  for (const node of nodes || []) {
    if (node.rank === 'class') {
      if (node.children && node.children.length) {
        const classKey = makeKey({ bucket, rank: 'class', path: node.name })
        keys.push(classKey)
      }
      for (const orderNode of node.children || []) {
        if (orderNode.children && orderNode.children.length) {
          const orderKey = makeKey({ bucket, rank: 'order', path: `${node.name}/${orderNode.name}` })
          keys.push(orderKey)
        }
        for (const familyNode of orderNode.children || []) {
          const familyPath = `${orderNode.name}/${familyNode.name}`
          if (familyNode.children && familyNode.children.length) {
            const familyKey = makeKey({ bucket, rank: 'family', path: familyPath })
            keys.push(familyKey)
          }
          for (const genusNode of familyNode.children || []) {
            const genusPath = `${familyPath}/${genusNode.name}`
            if (genusNode.children && genusNode.children.length) {
              const genusKey = makeKey({ bucket, rank: 'genus', path: genusPath })
              keys.push(genusKey)
            }
          }
        }
      }
    } else {
      const orderNode = node
      if (orderNode.children && orderNode.children.length) {
        const orderKey = makeKey({ bucket, rank: 'order', path: orderNode.name })
        keys.push(orderKey)
      }
      for (const familyNode of orderNode.children || []) {
        const familyPath = `${orderNode.name}/${familyNode.name}`
        if (familyNode.children && familyNode.children.length) {
          const familyKey = makeKey({ bucket, rank: 'family', path: familyPath })
          keys.push(familyKey)
        }
        for (const genusNode of familyNode.children || []) {
          const genusPath = `${familyPath}/${genusNode.name}`
          if (genusNode.children && genusNode.children.length) {
            const genusKey = makeKey({ bucket, rank: 'genus', path: genusPath })
            keys.push(genusKey)
          }
        }
      }
    }
  }
  return keys
}

function IndentedBranch(props: { directRowCount: number; className?: string; children: React.ReactNode }) {
  const { directRowCount, className, children } = props
  const spine = getBranchSpineProps(directRowCount)

  return (
    <div className={cn('relative ml-8 pl-16', className)}>
      {spine ? <div className={spine.className} style={spine.style} aria-hidden /> : null}
      {children}
    </div>
  )
}
