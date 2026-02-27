import { memo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { detectionStoreById, detectionsStore } from '~/stores/entities/detections'
import { patchStoreById } from '~/stores/entities/patch-selectors'
import { Badge } from '~/components/ui/badge'
import { TaxonRankLetterBadge } from '~/components/taxon-rank-badge'
import {
  selectedPatchIdsStore,
  togglePatchSelection,
  setSelection,
  selectedClusterIdStore,
  setSelectedClusterId,
  selectedSubClusterIdStore,
  setSelectedSubClusterId,
  selectionNightIdStore,
} from '~/stores/ui'
import { cn } from '~/utils/cn'
import { useObjectUrl } from '~/utils/use-object-url'
import { Button } from '~/components/ui/button'
import { ZoomInIcon } from 'lucide-react'
import type { BadgeVariants } from '~/components/ui/badge'
import { getClusterVariant } from '~/utils/colors'
import { MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { setMorphoCover } from '~/features/data-flow/3.persist/covers'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import { Column, Row } from '~/styles'
import { toast } from 'sonner'
import { deriveTaxonNameFromDetection } from '~/models/taxonomy/extract'

export type PatchItemProps = {
  id: string
  index?: number
  onOpenDetail?: (id: string) => void
  onImageLoad?: (id: string) => void
  onImageError?: (id: string) => void
  compact?: boolean
  clusterVariant?: BadgeVariants['variant']
}

function PatchItemImpl(props: PatchItemProps) {
  const { id, index, compact } = props
  const patch = useStore(patchStoreById(id))
  const detection = useStore(detectionStoreById(id))
  const summaries = useStore(nightSummariesStore)
  const detections = useStore(detectionsStore)
  const hoveredTopClusterId = useStore(selectedClusterIdStore)
  const hoveredSubClusterId = useStore(selectedSubClusterIdStore)
  const selected = useStore(selectedPatchIdsStore)
  const label = detection ? deriveTaxonNameFromDetection({ detection }) || 'Unlabeled' : 'Unlabeled'
  const rank = typeof detection?.morphospecies === 'string' && !!detection?.morphospecies ? 'morphospecies' : detection?.taxon?.taxonRank
  const morphoKeyForDetection = (detection?.morphospecies || '').trim() ? normalizeMorphoKey(detection?.morphospecies || '') : ''
  const isMorphoBySummary = !!(
    patch?.nightId &&
    morphoKeyForDetection &&
    (summaries?.[patch.nightId] as any)?.morphoCounts?.[morphoKeyForDetection]
  )
  const isMorphoEffective = !!((typeof detection?.morphospecies === 'string' && !!detection?.morphospecies) || isMorphoBySummary)
  const clusterId = typeof detection?.clusterId === 'number' ? detection.clusterId : undefined
  const isSelected = selected?.has?.(id)

  const url = useObjectUrl(patch?.imageFile?.file, patch?.imageFile?.handle)

  const [controlsPinned, setControlsPinned] = useState(false)

  function onToggle() {
    if (!id) return
    togglePatchSelection({ patchId: id })
  }

  function onClickZoom(e: React.MouseEvent) {
    e.stopPropagation()
    if (!id) return
    const open = props?.onOpenDetail
    if (open) open(id)
  }

  function onSetMorphoCover(e: React.MouseEvent) {
    e.stopPropagation()
    const morphoKey = (typeof detection?.morphospecies === 'string' ? detection?.morphospecies || '' : '').trim()
    if (!morphoKey) return
    if (!patch?.nightId || !patch?.id) return
    void setMorphoCover({ label: morphoKey, nightId: patch.nightId, patchId: patch.id })
    toast.success('Image will be shown as morphospecies cover')
  }

  const clusterVariant: BadgeVariants['variant'] | undefined =
    props?.clusterVariant ?? (typeof clusterId === 'number' ? getClusterVariant(clusterId) : undefined)

  function onSelectCluster(e?: React.MouseEvent | React.KeyboardEvent) {
    const nightId = patch?.nightId

    if (typeof clusterId !== 'number') return
    if (!nightId) return

    const all = Object.values(detections || {})

    const topId = Math.trunc(clusterId)

    const ids = all
      .filter((d) => d?.nightId === nightId && typeof d?.clusterId === 'number' && Math.trunc((d as any)?.clusterId as number) === topId)
      .map((d) => (d as any)?.id)
      .filter((x): x is string => typeof x === 'string' && !!x)

    if (ids.length === 0) return

    const append = !!(e as any)?.metaKey || !!(e as any)?.ctrlKey
    const currentNightId = selectionNightIdStore.get()

    if (append && currentNightId && currentNightId === nightId) {
      const current = new Set(selectedPatchIdsStore.get() ?? new Set<string>())
      for (const pid of ids) current.add(pid)
      setSelection({ nightId, patchIds: Array.from(current) })
      return
    }

    setSelection({ nightId, patchIds: ids })
  }

  function onSelectSubCluster(e?: React.MouseEvent | React.KeyboardEvent) {
    const nightId = patch?.nightId

    if (typeof clusterId !== 'number') return
    if (!nightId) return

    const all = Object.values(detections || {})

    const ids = all
      .filter((d) => d?.nightId === nightId && typeof d?.clusterId === 'number' && d?.clusterId === clusterId)
      .map((d) => (d as any)?.id)
      .filter((x): x is string => typeof x === 'string' && !!x)

    if (ids.length === 0) return

    const append = !!(e as any)?.metaKey || !!(e as any)?.ctrlKey
    const currentNightId = selectionNightIdStore.get()

    if (append && currentNightId && currentNightId === nightId) {
      const current = new Set(selectedPatchIdsStore.get() ?? new Set<string>())
      for (const pid of ids) current.add(pid)
      setSelection({ nightId, patchIds: Array.from(current) })
      return
    }

    setSelection({ nightId, patchIds: ids })
  }

  return (
    <Column
      className={cn(
        'group w-full select-none relative bg-neutral-100 rounded-md cursor-pointer outline-none',
        isSelected && 'bg-blue-500/20',
      )}
      tabIndex={0}
      data-index={index}
      data-id={id}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onToggle()
      }}
      role='button'
      aria-pressed={isSelected}
    >
      {!compact && typeof clusterId === 'number' && (
        <ClusterRow clusterId={clusterId} clusterVariant={clusterVariant} onClickTop={onSelectCluster} onClickSub={onSelectSubCluster} />
      )}

      <Row className={cn('absolute top-8 right-8 z-5 gap-4', controlsPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
        {!compact && (
          <Button
            icon={ZoomInIcon}
            size='icon-sm'
            onMouseDown={(e) => {
              e.stopPropagation()
            }}
            onClick={onClickZoom}
            aria-label='Open details'
          />
        )}

        {!compact && isMorphoEffective && (
          <DropdownMenu onOpenChange={setControlsPinned}>
            <DropdownMenuTrigger asChild>
              <Button size='icon-sm' onMouseDown={(e) => e.stopPropagation()} aria-label='More actions'>
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent side='bottom' align='end' className='min-w-[220px] p-4'>
              <DropdownMenuItem onClick={onSetMorphoCover} className='text-13'>
                Use this image as morphospecies cover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </Row>
      <div
        className={cn(
          'absolute pointer-events-none inset-0 ring-inset rounded-md ring-1 ring-black/5',
          'group-hover:ring-black/20 ',
          (() => {
            const topId = typeof clusterId === 'number' ? Math.trunc(clusterId) : undefined
            const previewByTop = typeof hoveredTopClusterId === 'number' && typeof topId === 'number' && hoveredTopClusterId === topId
            const previewBySub =
              typeof hoveredSubClusterId === 'number' && typeof clusterId === 'number' && hoveredSubClusterId === clusterId
            const preview = (previewByTop || previewBySub) && !isSelected
            return preview ? 'ring-[1.5px] ring-black/40 ring-inset' : ''
          })(),
          isSelected && 'ring-2 group-hover:ring-2 group-hover:ring-blue-400 ring-blue-600',
        )}
      />
      {url ? (
        <div className='flex-1'>
          <img
            src={url}
            alt={patch?.name ?? 'patch'}
            className='aspect-square w-full object-contain rounded-t-[5px]'
            onDragStart={(e) => e.preventDefault()}
            decoding='async'
            loading='lazy'
            onLoad={() => {
              if (!id) return
              props?.onImageLoad?.(id)
            }}
            onError={() => {
              if (!id) return
              props?.onImageError?.(id)
            }}
          />
        </div>
      ) : (
        <div className='aspect-square w-full ' />
      )}

      {!compact && <TaxonRankRow rank={rank} label={label} />}
    </Column>
  )
}

function TaxonRankRow(props: { rank: string | undefined; label: string | undefined }) {
  const { rank, label } = props

  return (
    <div className='w-full h-[22px] mx-4 flex gap-4 items-center '>
      {rank && <TaxonRankLetterBadge rank={rank} size='xsm' />}
      <Badge size='sm'>{label}</Badge>
    </div>
  )
}

function ClusterRow(props: {
  clusterId: number
  clusterVariant: BadgeVariants['variant']
  onClickTop?: (e: React.MouseEvent | React.KeyboardEvent) => void
  onClickSub?: (e: React.MouseEvent | React.KeyboardEvent) => void
}) {
  const { clusterId, clusterVariant, onClickTop, onClickSub } = props
  const hoveredClusterId = useStore(selectedClusterIdStore)
  const hoveredSubClusterId = useStore(selectedSubClusterIdStore)
  const isPreview = typeof hoveredClusterId === 'number' && hoveredClusterId === clusterId
  const isSubPreview = typeof hoveredSubClusterId === 'number' && hoveredSubClusterId === clusterId

  const topId = Math.trunc(clusterId)
  const frac = Math.abs(clusterId - topId)
  const subStr = frac > 0 ? `.${String(frac.toFixed(12)).replace(/^0\./, '').replace(/0+$/, '').replace(/\.$/, '')}` : ''

  if (clusterId === -1) return null

  return (
    <div className='h-[22px] flex items-center gap-4'>
      <Badge
        size='xsm'
        className={cn(
          'h-16 ml-4 cursor-pointer',
          'hover:ring-[1.5px] hover:ring-black/40 hover:ring-inset',
          isPreview && 'ring-[1.5px] ring-black/40 ring-inset',
        )}
        variant={clusterVariant}
        title='Cluster ID'
        role='button'
        tabIndex={0}
        onMouseDown={(e) => {
          e.stopPropagation()
        }}
        onMouseEnter={() => setSelectedClusterId({ clusterId: topId })}
        onMouseLeave={() => setSelectedClusterId({ clusterId: null })}
        onFocus={() => setSelectedClusterId({ clusterId: topId })}
        onBlur={() => setSelectedClusterId({ clusterId: null })}
        onClick={(e) => {
          if (onClickTop) onClickTop(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            if (onClickTop) onClickTop(e)
          }
        }}
        aria-label={`Select cluster C${topId}`}
      >
        C{topId}
      </Badge>
      {subStr ? (
        <Badge
          size='xsm'
          className={cn(
            'h-16 mr-4 cursor-pointer',
            'hover:ring-[1.5px] hover:ring-black/40 hover:ring-inset',
            isSubPreview && 'ring-[1.5px] ring-black/40 ring-inset',
          )}
          variant={clusterVariant}
          title='Sub-cluster ID'
          role='button'
          tabIndex={0}
          onMouseDown={(e) => {
            e.stopPropagation()
          }}
          onMouseEnter={() => setSelectedSubClusterId({ clusterId })}
          onMouseLeave={() => setSelectedSubClusterId({ clusterId: null })}
          onFocus={() => setSelectedSubClusterId({ clusterId })}
          onBlur={() => setSelectedSubClusterId({ clusterId: null })}
          onClick={(e) => {
            if (onClickSub) onClickSub(e)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              if (onClickSub) onClickSub(e)
            }
          }}
          aria-label={`Select sub-cluster ${subStr}`}
        >
          {subStr}
        </Badge>
      ) : null}
    </div>
  )
}

export const PatchItem = memo(PatchItemImpl)
