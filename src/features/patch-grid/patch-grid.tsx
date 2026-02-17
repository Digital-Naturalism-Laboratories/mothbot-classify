import { useStore } from '@nanostores/react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useHotkey } from '~/utils/use-hotkey'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '~/utils/cn'
import type { PatchEntity } from '~/stores/entities/5.patches'
import type { DetectionEntity } from '~/stores/entities/detections'
import { detectionsStore } from '~/stores/entities/detections'
import { patchColumnsStore } from '~/components/atomic/patch-size-control'
import { CenteredLoader } from '~/components/atomic/CenteredLoader'
import { TaxonRankLetterBadge } from '~/components/taxon-rank-badge'
import { PatchItem } from './patch-item'
import { selectedPatchIdsStore, selectionNightIdStore, setSelection, togglePatchSelection } from '~/stores/ui'
import {
  addRowBlocks,
  chunkIds,
  computeDetectionArea,
  getRankValue,
  isMorphospeciesDetection,
  separateRegularAndMorphoItems,
  sortGroupsByCount,
} from './grid-utils'
import { useContainerWidth } from '~/utils/use-container-width'
import { colorVariantsMap } from '~/utils/colors'
import { mapRankToVariant } from '~/utils/ranks'

const DEBUG = false

const GRID_GAP_DEFAULT = 8
const GRID_GAP_COMPACT = 6
const FOOTER_HIDE_THRESHOLD = 100
// Extra per-item rows: one above, one below

const ITEM_TOP_ROWS = 1
const ITEM_BOTTOM_ROWS = 1
// Same height for top and bottom rows
const TOP_ROW_HEIGHT = 22
const DEFAULT_MIN_ITEM_WIDTH = 240
const HEADER_BASE_HEIGHT = 32
const HEADER_TOP_MARGIN = 20

type GridBlockHeader = {
  kind: 'header'
  key: string
  title: string
  rank?: 'class' | 'order' | 'family' | 'genus' | 'species' | 'morphospecies'
  count: number
}

type GridBlockRow = { kind: 'row'; key: string; itemIds: string[] }

type GridBlock = GridBlockHeader | GridBlockRow

export type PatchGridProps = {
  patches: PatchEntity[]
  nightId: string
  className?: string
  onOpenPatchDetail: (id: string) => void
  loading?: boolean
  onImageProgress?: (loaded: number, total: number) => void
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
}

export function PatchGrid(props: PatchGridProps) {
  const { patches, nightId, className, onOpenPatchDetail, loading, onImageProgress, selectedTaxon, selectedBucket } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const desiredColumns = useStore(patchColumnsStore)
  const selected = useStore(selectedPatchIdsStore)
  useStore(selectionNightIdStore)

  const [isDragging, setIsDragging] = useState(false)
  const [dragToggled, setDragToggled] = useState<Set<string>>(new Set())
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState<number>(0)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const detections = useStore(detectionsStore)
  const orderedIds = useMemo(() => orderPatchIds({ patches, detections }), [patches, detections])

  const prevCountRef = useRef<number>(0)

  const containerWidth = useContainerWidth(containerRef)

  const gapPx = useMemo(() => {
    const tentativeWidth =
      containerWidth && desiredColumns
        ? Math.floor((containerWidth - Math.max(0, desiredColumns - 1) * GRID_GAP_DEFAULT) / desiredColumns)
        : DEFAULT_MIN_ITEM_WIDTH
    return tentativeWidth < 100 ? GRID_GAP_COMPACT : GRID_GAP_DEFAULT
  }, [containerWidth, desiredColumns])

  const columns = useMemo(() => {
    if (!containerWidth) return Math.max(1, desiredColumns || 1)
    const maxColumns = 24
    const cols = Math.max(1, Math.min(maxColumns, Math.round(desiredColumns || 1)))
    return cols
  }, [containerWidth, desiredColumns])

  const itemWidth = useMemo(() => computeItemWidth({ containerWidth, columns, gap: gapPx }), [containerWidth, columns, gapPx])
  const rowHeight = useMemo(() => {
    const baseWidth = itemWidth || DEFAULT_MIN_ITEM_WIDTH
    const isCompact = (itemWidth || 0) < FOOTER_HIDE_THRESHOLD
    const topExtras = isCompact ? 0 : ITEM_TOP_ROWS * TOP_ROW_HEIGHT
    const bottomExtras = isCompact ? 0 : ITEM_BOTTOM_ROWS * TOP_ROW_HEIGHT
    const height = Math.max(0, baseWidth) + topExtras + bottomExtras + gapPx
    return height
  }, [itemWidth, gapPx])

  // Group blocks (headers + rows) mirroring left panel taxonomy
  const itemIndexById = useMemo(() => {
    const map = new Map<string, number>()
    for (let i = 0; i < orderedIds.length; i++) map.set(orderedIds[i]!, i)
    return map
  }, [orderedIds])

  const blocks = useMemo(() => {
    return buildGridBlocks({ orderedIds, detections, columns, selectedTaxon, selectedBucket })
  }, [orderedIds, detections, columns, selectedTaxon, selectedBucket])

  const visualOrderIds = useMemo(() => {
    return flattenBlocksToVisualOrder({ blocks })
  }, [blocks])

  const visualIndexById = useMemo(() => {
    return buildVisualIndexMap({ visualOrderIds })
  }, [visualOrderIds])

  const itemIndexToBlockIndex = useMemo(() => {
    const map: number[] = []
    if (!blocks.length) return map
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      if (b.kind !== 'row') continue
      for (const id of b.itemIds) {
        const idx = itemIndexById.get(id)
        if (typeof idx === 'number') map[idx] = i
      }
    }
    return map
  }, [blocks, itemIndexById])

  const rowVirtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (i) => {
      const base = blocks[i]?.kind === 'row' ? rowHeight : HEADER_BASE_HEIGHT
      const nextIsHeader = blocks[i + 1]?.kind === 'header'
      const extra = nextIsHeader ? HEADER_TOP_MARGIN : 0
      const size = base + extra
      return size
    },
    overscan: 5,
    measureElement: (el) => {
      const node = el as HTMLElement | null
      const r = node?.getBoundingClientRect?.()
      const base = Math.ceil(r?.height || rowHeight)
      const idxAttr = node?.getAttribute('data-block-index')
      const idx = idxAttr != null ? Number(idxAttr) : -1
      const nextIsHeader = idx >= 0 && blocks[idx + 1]?.kind === 'header'
      const kind = node?.getAttribute('data-kind')
      const rowGapExtra = kind === 'row' ? gapPx : 0
      const extra = (nextIsHeader ? HEADER_TOP_MARGIN : 0) + rowGapExtra
      const h = base + extra
      return h
    },
  })

  // Preserve scroll position on minor list changes (e.g., identifying items)
  // Only reset scroll when the viewing context changes (night, bucket, or selected taxon)
  const lastContextRef = useRef<string>(`${nightId}|${selectedBucket || ''}|${selectedTaxon?.rank || ''}:${selectedTaxon?.name || ''}`)
  useEffect(() => {
    const currentContext = `${nightId}|${selectedBucket || ''}|${selectedTaxon?.rank || ''}:${selectedTaxon?.name || ''}`
    const contextChanged = currentContext !== lastContextRef.current
    lastContextRef.current = currentContext

    if (!contextChanged) return

    const count = orderedIds.length
    setIsDragging(false)
    setDragToggled(new Set())
    setAnchorIndex(null)
    setFocusIndex(0)

    const el = containerRef.current
    if (el) el.scrollTo({ top: 0 })
    rowVirtualizer.scrollToIndex(0, { align: 'start' })
    rowVirtualizer.scrollToOffset(0)
    const totalSize = rowVirtualizer.getTotalSize()

    prevCountRef.current = count
  }, [orderedIds.length, rowVirtualizer, columns, rowHeight, nightId, selectedBucket, selectedTaxon?.rank, selectedTaxon?.name])

  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTo({ top: 0 })
    rowVirtualizer.scrollToIndex(0, { align: 'start' })
    rowVirtualizer.scrollToOffset(0)
    const totalSize = rowVirtualizer.getTotalSize()
  }, [desiredColumns, rowVirtualizer, columns, rowHeight])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      rowVirtualizer.measure()
    })
    return () => cancelAnimationFrame(id)
  }, [rowHeight, columns, containerWidth, orderedIds.length, blocks.length, rowVirtualizer])

  const [loadedCount, setLoadedCount] = useState<number>(0)
  const totalCount = patches?.length || 0
  useEffect(() => {
    setLoadedCount(0)
  }, [nightId, patches])
  useEffect(() => {
    onImageProgress?.(loadedCount, totalCount)
  }, [loadedCount, totalCount, onImageProgress])

  useEffect(() => {
    function onMouseUp() {
      setIsDragging(false)
      setDragToggled(new Set())
    }
    if (isDragging) window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [isDragging])

  const hoveredId = useMemo(() => {
    if (hoverIndex == null) return null
    const id = visualOrderIds[hoverIndex]
    return id ?? null
  }, [hoverIndex, visualOrderIds])

  useHotkey('space', () => { if (hoveredId) onOpenPatchDetail(hoveredId) }, [hoveredId, onOpenPatchDetail])

  function focusItem(index: number) {
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector(`[data-index="${index}"]`) as HTMLElement | null
      el?.focus({ preventScroll: true })
    })
  }

  function handleItemMouseDown(e: React.MouseEvent, index: number, patchId: string) {
    e.preventDefault()
    if (e.shiftKey) {
      const rangeIds = computeShiftSelectionRange({ anchorIndex, currentIndex: index, visualOrderIds })
      const current = new Set(selected ?? new Set())
      for (const id of rangeIds) current.add(id)
      setSelection({ nightId, patchIds: Array.from(current) })
      setAnchorIndex(index)
      setFocusIndex(index)
      focusItem(index)
      return
    }

    togglePatchSelection({ patchId })
    const next = new Set(dragToggled)
    next.add(patchId)
    setDragToggled(next)
    setIsDragging(true)
    setAnchorIndex(index)
    setFocusIndex(index)
    focusItem(index)
  }

  function handleItemMouseEnter(patchId: string) {
    if (!isDragging) return
    if (dragToggled.has(patchId)) return
    togglePatchSelection({ patchId })
    const next = new Set(dragToggled)
    next.add(patchId)
    setDragToggled(next)
  }

  function onMouseDownContainer(e: React.MouseEvent) {
    const index = getVisualIndexFromEvent(e)
    if (index == null) return
    const id = visualOrderIds[index]
    if (!id) return
    handleItemMouseDown(e, index, id)
  }

  function onMouseMoveContainer(e: React.MouseEvent) {
    const index = getVisualIndexFromEvent(e)
    if (index != null) {
      if (index !== hoverIndex) setHoverIndex(index)
      if (isDragging) {
        const id = visualOrderIds[index]
        if (id) handleItemMouseEnter(id)
      }
    } else if (hoverIndex != null) {
      setHoverIndex(null)
    }
  }

  function onMouseLeaveContainer(e: React.MouseEvent) {
    if (hoverIndex != null) setHoverIndex(null)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!visualOrderIds.length) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const delta = e.key === 'ArrowLeft' ? -1 : 1
      const next = Math.max(0, Math.min(visualOrderIds.length - 1, focusIndex + delta))
      setFocusIndex(next)
      focusItem(next)
      return
    }
    if (e.key === ' ') {
      e.preventDefault()
      if (hoverIndex != null) return
      const id = visualOrderIds[focusIndex]
      if (id) togglePatchSelection({ patchId: id })
      return
    }
  }

  if (loading) return <CenteredLoader>🌀 Loading patches</CenteredLoader>

  return (
    <GridContainer
      ref={containerRef}
      className={className}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDownContainer}
      onMouseMove={onMouseMoveContainer}
      onMouseLeave={onMouseLeaveContainer}
    >
      <div style={{ height: rowVirtualizer.getTotalSize() + 88, width: '100%', position: 'relative' }}>
        {!orderedIds.length ? <div className='p-8 text-sm text-neutral-500'>No patches found</div> : null}

        {rowVirtualizer.getVirtualItems().map((stripe) => {
          const block = blocks[stripe.index]
          return (
            <div
              key={stripe.key}
              ref={rowVirtualizer.measureElement}
              data-block-index={stripe.index}
              data-kind={block?.kind}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${stripe.start}px)` }}
            >
              {block?.kind === 'header' ? (
                <GroupHeader title={block.title} rank={block.rank} count={block.count} className='px-8 py-6' />
              ) : block?.kind === 'row' ? (
                <RowGrid
                  itemIds={block.itemIds}
                  columns={columns}
                  gapPx={gapPx}
                  itemWidth={itemWidth}
                  itemIndexById={visualIndexById}
                  onOpenPatchDetail={onOpenPatchDetail}
                  onImageLoad={(id) => setLoadedCount((c) => c + 1)}
                  onImageError={(id) => setLoadedCount((c) => c + 1)}
                />
              ) : null}
            </div>
          )
        })}
        <div style={{ position: 'absolute', top: rowVirtualizer.getTotalSize(), left: 0, width: '100%', height: '88px' }} />
      </div>
    </GridContainer>
  )
}

type GridContainerProps = {
  className?: string
  children: React.ReactNode
  onMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onMouseLeave: (e: React.MouseEvent) => void
}

const GridContainer = React.forwardRef<HTMLDivElement, GridContainerProps>(function GridContainer(props, ref) {
  const { className, children, onMouseDown, onMouseMove, onKeyDown, onMouseLeave } = props
  return (
    <div
      ref={ref}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={cn('relative overflow-y-auto p-8 outline-none', className)}
    >
      {children}
    </div>
  )
})

function buildGridBlocks(params: {
  orderedIds: string[]
  detections: Record<string, DetectionEntity>
  columns: number
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  selectedBucket?: 'auto' | 'user'
}) {
  const { orderedIds, detections, columns, selectedTaxon, selectedBucket } = params
  const UNASSIGNED_LABEL = 'Unassigned'
  const out: GridBlock[] = []
  if (!orderedIds.length) return out

  if (selectedBucket === 'user' && selectedTaxon?.name === 'ERROR') {
    out.push({ kind: 'header', key: 'hdr:errors', title: 'Errors', rank: 'species', count: orderedIds.length })
    addRowBlocks({ itemIds: orderedIds, columns, keyPrefix: 'row:errors', out })
    return out
  }

  if (selectedTaxon?.rank === 'class') {
    out.push({
      kind: 'header',
      key: `hdr:class:${selectedTaxon.name}`,
      title: selectedTaxon.name,
      rank: 'class',
      count: orderedIds.length,
    })
    const anchorRank = 'order' as const
    const anchorGroups = new Map<string, string[]>()
    const noOrderItems: string[] = []
    const noOrderMorpho: string[] = []

    for (const id of orderedIds) {
      const det = detections?.[id]
      const rankValue = getRankValue({ det, rank: anchorRank })
      if (!rankValue) {
        if (isMorphospeciesDetection({ detection: det })) noOrderMorpho.push(id)
        else noOrderItems.push(id)
      } else {
        const arr = anchorGroups.get(rankValue) || []
        arr.push(id)
        anchorGroups.set(rankValue, arr)
      }
    }

    if (noOrderItems.length) {
      addRowBlocks({ itemIds: noOrderItems, columns, keyPrefix: `row:class:${selectedTaxon.name}:noorder`, out })
    }
    if (noOrderMorpho.length) {
      addRowBlocks({ itemIds: noOrderMorpho, columns, keyPrefix: `row:class:${selectedTaxon.name}:noordermorpho`, out })
    }

    const sortedAnchor = sortGroupsByCount({ groups: anchorGroups })

    const regularGroups: Array<[string, string[]]> = []
    const morphoGroups: Array<[string, string[]]> = []

    for (const [anchorName, idsOfAnchor] of sortedAnchor) {
      const isMorpho = isMorphospeciesHeader({ name: anchorName, ids: idsOfAnchor, rank: anchorRank, detections })
      if (isMorpho) morphoGroups.push([anchorName, idsOfAnchor])
      else regularGroups.push([anchorName, idsOfAnchor])
    }

    for (const [anchorName, idsOfAnchor] of regularGroups) {
      processAnchorGroup({ anchorName, idsOfAnchor, anchorRank, out, detections, columns })
    }

    for (const [anchorName, idsOfAnchor] of morphoGroups) {
      processAnchorGroup({ anchorName, idsOfAnchor, anchorRank, out, detections, columns })
    }
    return out
  }

  const anchorRank: 'order' | 'family' | 'genus' | 'species' = (selectedTaxon?.rank as any) || 'order'
  if (DEBUG) console.log('🔍 PatchGrid blocks - anchorRank:', anchorRank, 'selectedTaxon:', selectedTaxon)
  const anchorGroups = new Map<string, string[]>()
  for (const id of orderedIds) {
    const det = detections?.[id]
    const rankValue = getRankValue({ det, rank: anchorRank })
    const name = rankValue || UNASSIGNED_LABEL
    if (DEBUG)
      console.log('🔍 PatchGrid - id:', id, 'rankValue:', rankValue, 'name:', name, 'det:', {
        morphospecies: det?.morphospecies,
        taxon: det?.taxon,
        detectedBy: det?.detectedBy,
      })
    const arr = anchorGroups.get(name) || []
    arr.push(id)
    anchorGroups.set(name, arr)
  }
  if (DEBUG) console.log('🔍 PatchGrid - anchorGroups:', Array.from(anchorGroups.entries()))
  const sortedAnchor = sortGroupsByCount({ groups: anchorGroups })
  if (DEBUG) console.log('🔍 PatchGrid - sortedAnchor:', sortedAnchor)

  const regularGroups: Array<[string, string[]]> = []
  const morphoGroups: Array<[string, string[]]> = []
  for (const [anchorName, idsOfAnchor] of sortedAnchor) {
    const isMorpho = isMorphospeciesHeader({ name: anchorName, ids: idsOfAnchor, rank: anchorRank, detections })
    if (isMorpho) morphoGroups.push([anchorName, idsOfAnchor])
    else regularGroups.push([anchorName, idsOfAnchor])
  }

  for (const [anchorName, idsOfAnchor] of regularGroups) {
    processAnchorGroup({ anchorName, idsOfAnchor, anchorRank, out, detections, columns })
  }

  for (const [anchorName, idsOfAnchor] of morphoGroups) {
    processAnchorGroup({ anchorName, idsOfAnchor, anchorRank, out, detections, columns })
  }
  return out
}

function processAnchorGroup(params: {
  anchorName: string
  idsOfAnchor: string[]
  anchorRank: 'order' | 'family' | 'genus' | 'species'
  out: GridBlock[]
  detections: Record<string, DetectionEntity>
  columns: number
}) {
  const { anchorName, idsOfAnchor, anchorRank, out, detections, columns } = params
  const isMorpho = isMorphospeciesHeader({ name: anchorName, ids: idsOfAnchor, rank: anchorRank, detections })
  const displayRank = isMorpho ? 'morphospecies' : anchorRank
  out.push({
    kind: 'header',
    key: `hdr:${anchorRank}:${anchorName}`,
    title: anchorName,
    rank: displayRank,
    count: idsOfAnchor.length,
  })

  const subRank = anchorRank === 'order' ? 'family' : anchorRank === 'family' ? 'genus' : undefined
  if (!subRank) {
    const { regularItems, morphoItems } = separateRegularAndMorphoItems({ itemIds: idsOfAnchor, detections })
    if (regularItems.length) {
      addRowBlocks({ itemIds: regularItems, columns, keyPrefix: `row:${anchorRank}:${anchorName}`, out })
    }
    if (morphoItems.length) {
      addRowBlocks({ itemIds: morphoItems, columns, keyPrefix: `row:${anchorRank}:${anchorName}:morpho`, out })
    }
    return
  }

  const bySub = new Map<string, string[]>()
  const noSub: string[] = []
  const noSubMorpho: string[] = []
  for (const id of idsOfAnchor) {
    const det = detections?.[id]
    const sub = getRankValue({ det, rank: subRank })
    if (!sub) {
      if (isMorphospeciesDetection({ detection: det })) noSubMorpho.push(id)
      else noSub.push(id)
    } else {
      const arr = bySub.get(sub) || []
      arr.push(id)
      bySub.set(sub, arr)
    }
  }
  if (noSub.length) {
    addRowBlocks({ itemIds: noSub, columns, keyPrefix: `row:${anchorRank}:${anchorName}:__nosub`, out })
  }
  if (noSubMorpho.length) {
    addRowBlocks({ itemIds: noSubMorpho, columns, keyPrefix: `row:${anchorRank}:${anchorName}:__nosubmorpho`, out })
  }
  const sortedSub = sortGroupsByCount({ groups: bySub })

  const regularSub: Array<[string, string[]]> = []
  const morphoSub: Array<[string, string[]]> = []
  for (const [subName, subIds] of sortedSub) {
    const isSubMorpho = isMorphospeciesHeader({ name: subName, ids: subIds, rank: subRank, detections })
    if (isSubMorpho) morphoSub.push([subName, subIds])
    else regularSub.push([subName, subIds])
  }

  for (const [subName, subIds] of regularSub) {
    const nextSubRank = subRank === 'family' ? 'genus' : undefined
    if (nextSubRank) {
      processAnchorGroup({ anchorName: subName, idsOfAnchor: subIds, anchorRank: subRank, out, detections, columns })
    } else {
      const isSubMorpho = isMorphospeciesHeader({ name: subName, ids: subIds, rank: subRank, detections })
      const displaySubRank = isSubMorpho ? 'morphospecies' : subRank
      out.push({
        kind: 'header',
        key: `hdr:${subRank}:${anchorName}/${subName}`,
        title: subName,
        rank: displaySubRank,
        count: subIds.length,
      })
      const { regularItems, morphoItems } = separateRegularAndMorphoItems({ itemIds: subIds, detections })
      if (regularItems.length) {
        addRowBlocks({ itemIds: regularItems, columns, keyPrefix: `row:${subRank}:${anchorName}/${subName}`, out })
      }
      if (morphoItems.length) {
        addRowBlocks({ itemIds: morphoItems, columns, keyPrefix: `row:${subRank}:${anchorName}/${subName}:morpho`, out })
      }
    }
  }

  for (const [subName, subIds] of morphoSub) {
    out.push({
      kind: 'header',
      key: `hdr:${subRank}:${anchorName}/${subName}`,
      title: subName,
      rank: 'morphospecies',
      count: subIds.length,
    })
    addRowBlocks({ itemIds: subIds, columns, keyPrefix: `row:${subRank}:${anchorName}/${subName}`, out })
  }
}

function isMorphospeciesHeader(params: { name: string; ids: string[]; rank: string; detections: Record<string, DetectionEntity> }) {
  const { name, ids, rank, detections } = params
  if (rank !== 'species') return false
  if (ids.length === 0) return false
  const firstDet = detections?.[ids[0]]
  if (!firstDet) return false
  const morphospecies = typeof firstDet.morphospecies === 'string' ? firstDet.morphospecies : undefined
  return morphospecies === name
}

function orderPatchIds(params: { patches: PatchEntity[]; detections: Record<string, DetectionEntity> }) {
  const { patches, detections } = params
  if (!Array.isArray(patches) || patches.length === 0) return [] as string[]
  const withSortKey = patches.map((p) => {
    const det = detections?.[p.id]
    const clusterId = typeof (det as any)?.clusterId === 'number' ? (det as any)?.clusterId : undefined
    const area = computeDetectionArea({ detection: det })
    return { id: p.id, name: p.name, clusterId, area }
  })
  withSortKey.sort((a, b) => {
    const aClusterId = a.clusterId
    const bClusterId = b.clusterId
    const aIsValid = typeof aClusterId === 'number' && aClusterId >= 0
    const bIsValid = typeof bClusterId === 'number' && bClusterId >= 0
    const aIsUnclustered = aClusterId === -1
    const bIsUnclustered = bClusterId === -1

    if (aIsValid && bIsValid) return aClusterId - bClusterId
    if (aIsValid && bIsUnclustered) return -1
    if (aIsValid && bClusterId === undefined) return -1
    if (aIsUnclustered && bIsValid) return 1
    if (aIsUnclustered && bIsUnclustered) {
      if (b.area !== a.area) return b.area - a.area
      return (a?.name || '').localeCompare(b?.name || '')
    }
    if (aIsUnclustered && bClusterId === undefined) return -1
    if (aClusterId === undefined && bIsValid) return 1
    if (aClusterId === undefined && bIsUnclustered) return 1
    if (aClusterId === undefined && bClusterId === undefined) {
      if (b.area !== a.area) return b.area - a.area
      return (a?.name || '').localeCompare(b?.name || '')
    }
    return 0
  })
  const ids = withSortKey.map((x) => x.id)
  return ids
}

function computeItemWidth(params: { containerWidth: number; columns: number; gap: number }) {
  const { containerWidth, columns, gap } = params
  if (!containerWidth || containerWidth <= 0 || !columns) return 0
  const totalGaps = Math.max(0, columns - 1) * gap
  const width = Math.max(0, containerWidth - totalGaps)
  const colWidth = Math.floor(width / Math.max(1, columns))
  return colWidth
}

function GroupHeader(props: {
  title: string
  rank?: 'class' | 'order' | 'family' | 'genus' | 'species' | 'morphospecies'
  count: number
  className?: string
}) {
  const { title, rank, count, className } = props

  const colorVariant = mapRankToVariant({ rank })
  const colorClass = colorVariantsMap[colorVariant as keyof typeof colorVariantsMap]

  return (
    <div className={cn('flex items-center ring-1 ring-inset rounded-sm justify-between', colorClass, className)}>
      <div className='flex items-center gap-6'>
        <TaxonRankLetterBadge rank={rank} size='xsm' />
        <span className='text-13 font-semibold text-ink-primary'>{title}</span>
      </div>
      <span className='text-12 text-neutral-600'>{count}</span>
    </div>
  )
}

type RowGridProps = {
  itemIds: string[]
  columns: number
  gapPx: number
  itemWidth: number
  itemIndexById: Map<string, number>
  onOpenPatchDetail: (id: string) => void
  onImageLoad: (id: string) => void
  onImageError: (id: string) => void
}

function RowGrid(props: RowGridProps) {
  const { itemIds, columns, gapPx, itemWidth, itemIndexById, onOpenPatchDetail, onImageLoad, onImageError } = props

  const compact = (itemWidth || 0) < FOOTER_HIDE_THRESHOLD

  return (
    <div
      className='grid'
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`,
        columnGap: `${gapPx}px`,
        rowGap: `0px`,
        marginBottom: `${gapPx}px`,
      }}
    >
      {itemIds.map((id) => {
        const index = itemIndexById.get(id)
        if (typeof index !== 'number') return null
        return (
          <PatchItem
            id={id}
            key={id}
            index={index}
            compact={compact}
            onOpenDetail={onOpenPatchDetail}
            onImageLoad={onImageLoad}
            onImageError={onImageError}
          />
        )
      })}
    </div>
  )
}

function flattenBlocksToVisualOrder(params: { blocks: GridBlock[] }) {
  const { blocks } = params
  const ids: string[] = []
  for (const block of blocks) {
    if (block.kind === 'row') {
      for (const id of block.itemIds) {
        ids.push(id)
      }
    }
  }
  return ids
}

function buildVisualIndexMap(params: { visualOrderIds: string[] }) {
  const { visualOrderIds } = params
  const map = new Map<string, number>()
  for (let i = 0; i < visualOrderIds.length; i++) {
    map.set(visualOrderIds[i]!, i)
  }
  return map
}

function computeShiftSelectionRange(params: { anchorIndex: number | null; currentIndex: number; visualOrderIds: string[] }) {
  const { anchorIndex, currentIndex, visualOrderIds } = params
  const start = anchorIndex != null ? anchorIndex : currentIndex
  const [lo, hi] = start <= currentIndex ? [start, currentIndex] : [currentIndex, start]
  return visualOrderIds.slice(lo, hi + 1)
}

function getVisualIndexFromEvent(e: React.MouseEvent) {
  const target = e.target as HTMLElement
  const indexAttr = target?.closest('[data-index]')?.getAttribute('data-index')
  if (indexAttr == null) return null
  const index = Number(indexAttr)
  return Number.isNaN(index) ? null : index
}
