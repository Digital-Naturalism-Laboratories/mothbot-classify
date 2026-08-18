import { Column, PanelHeading } from '~/styles'
import { cn } from '~/utils/cn'
import { Progress } from '~/components/ui/progress'
import { Button } from '~/components/ui/button'
import { useStore } from '@nanostores/react'
import { useState, type ReactNode } from 'react'
import { ChevronDownIcon, ChevronUpIcon, EllipsisIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { detectionsStore } from '~/stores/entities/detections'
import { selectedPatchIdsStore } from '~/stores/ui'
import { exportNightDarwinCSV, copyNightExportFilePathToClipboard, copyNightFolderPathToClipboard } from '~/features/data-flow/4.export/darwin-csv'
import { toast } from 'sonner'
import { Number } from '~/components/atomic/number'
import { LabeledSliderControl } from '~/components/atomic/labeled-slider-control'
import { PatchSizeControl } from '~/components/atomic/patch-size-control'
import type { LeafGroupLeftPanelProps } from './left-panel.types'
import { WarningsBox } from './warnings-box'
import { TaxonomySection } from './taxonomy-section'
import { NightSelectorSection } from './night-selector'
import { UNAPPROVED_AGGREGATE_LABEL, UNASSIGNED_AGGREGATE_LABEL } from '~/features/labeling/night-labeling-mode'
import { VisualizationDialog } from '~/features/data-flow/4.export/visualization/visualization-dialog'

export function LeafGroupLeftPanel(props: LeafGroupLeftPanelProps) {
  const {
    leafGroupId,
    hasMachineIdentification = true,
    unassignedCount = 0,
    taxonomyAuto,
    taxonomyUser,
    totalPatches,
    totalDetections,
    totalIdentified = 0,
    sizeThreshold,
    sizeThresholdMax,
    groupByTaxon,
    clusteredFirst,
    groupByClusters,
    sortBySize,
    reversed,
    clustersCollapsed,
    onSizeThresholdChange,
    onGroupByTaxonChange,
    onClusteredFirstChange,
    onGroupByClustersChange,
    onSortBySizeChange,
    onReversedChange,
    onClustersCollapsedChange,
    availableDetectorIds,
    selectedDetectorId,
    onDetectorChange,
    availableBotAlgorithms,
    selectedBotAlgorithm,
    onBotAlgorithmChange,
    selectedTaxon,
    selectedBucket,
    onSelectTaxon,
    warnings,
    className,
  } = props

  const detections = useStore(detectionsStore)
  const selectedPatchIds = useStore(selectedPatchIdsStore)
  const selectedCount = selectedPatchIds?.size ?? 0
  const [layoutOptionsOpen, setLayoutOptionsOpen] = useState(true)
  const [vizDialogOpen, setVizDialogOpen] = useState(false)
  const errorCountForNight = Object.values(detections ?? {}).filter(
    (d) => (d as any)?.leafGroupId === leafGroupId && (d as any)?.detectedBy === 'user' && (d as any)?.isError === true,
  ).length

  return (
    <Column className={cn('bg-sidebar pl-14 pr-16 py-20 pt-12', className)}>
      <NightSelectorSection />
      {availableDetectorIds && availableDetectorIds.length > 1 ? (
        <DetectorSelectorSection
          detectorIds={availableDetectorIds}
          selectedDetectorId={selectedDetectorId}
          onDetectorChange={onDetectorChange}
          className='mb-16'
        />
      ) : null}
      <WarningsBox warnings={warnings} className='mb-16' />
      <div className='mb-16'>
        <PanelHeading className='mb-6'>Summary</PanelHeading>
        <div className='space-y-4 text-13 text-neutral-700'>
          <div className='flex items-center justify-between'>
            <span>Total patches</span>
            <Number value={totalPatches} mono format className='font-medium' />
          </div>
          <div className='flex items-center justify-between'>
            <span>Total detections</span>
            <Number value={totalDetections} mono format className='font-medium' />
          </div>
          <div className='flex items-center justify-between'>
            <span>Identified</span>
            <Number value={totalIdentified} mono format className='font-medium' />
          </div>
          <div className='pt-4'>
            <Progress value={totalDetections ? Math.round((totalIdentified / totalDetections) * 100) : 0} />
          </div>
          {selectedCount > 0 && (
            <div className='flex items-center justify-between pt-2'>
              <span className='text-blue-600'>Selected</span>
              <span className='font-medium tabular-nums text-blue-600'>{selectedCount}</span>
            </div>
          )}
        </div>
      </div>

      <LayoutOptionsSection
        className='mb-16'
        open={layoutOptionsOpen}
        onToggle={() => setLayoutOptionsOpen((currentValue) => !currentValue)}
      >
        <PatchSizeControl compact />
        <SizeThresholdControl value={sizeThreshold} max={sizeThresholdMax} onChange={onSizeThresholdChange} />
        <div className='pt-2 text-11 font-medium uppercase tracking-wide text-neutral-500'>Organize by</div>
        <LabeledCheckboxControl
          label='Taxonomic groups'
          checked={groupByTaxon}
          onChange={onGroupByTaxonChange}
        />
        <LabeledCheckboxControl
          label='Clustered items first'
          checked={clusteredFirst}
          onChange={onClusteredFirstChange}
        />
        <LabeledCheckboxControl
          label='Clusters'
          checked={groupByClusters}
          onChange={onGroupByClustersChange}
        />
        <LabeledCheckboxControl
          label='Size'
          checked={sortBySize}
          onChange={onSortBySizeChange}
        />
        <LabeledCheckboxControl
          label='Reverse order'
          checked={reversed}
          onChange={onReversedChange}
        />
        <LabeledCheckboxControl
          label='Collapse all clusters'
          checked={clustersCollapsed}
          onChange={onClustersCollapsedChange}
        />
      </LayoutOptionsSection>

      {(hasMachineIdentification || (availableBotAlgorithms && availableBotAlgorithms.length > 0)) ? (
        <TaxonomySection
          title='Machine identified'
          nodes={taxonomyAuto}
          bucket='auto'
          selectedTaxon={selectedTaxon}
          selectedBucket={selectedBucket}
          onSelectTaxon={onSelectTaxon}
          emptyText='No detections'
          aggregateLabel={UNAPPROVED_AGGREGATE_LABEL}
          availableAlgorithms={availableBotAlgorithms}
          selectedAlgorithm={selectedBotAlgorithm}
          onAlgorithmChange={onBotAlgorithmChange}
        />
      ) : (
        <TaxonomySection
          title='Unassigned'
          nodes={[]}
          bucket='auto'
          selectedTaxon={selectedTaxon}
          selectedBucket={selectedBucket}
          onSelectTaxon={onSelectTaxon}
          emptyText='No unassigned patches'
          aggregateLabel={UNASSIGNED_AGGREGATE_LABEL}
          aggregateCount={unassignedCount}
          alwaysShowAggregate
        />
      )}

      <TaxonomySection
        className='mt-16'
        title='Human reviewed'
        nodes={taxonomyUser}
        bucket='user'
        selectedTaxon={selectedTaxon}
        selectedBucket={selectedBucket}
        onSelectTaxon={onSelectTaxon}
        emptyText='No identifications yet'
        errorsCount={errorCountForNight}
      />

      <div className='mt-auto pt-16'>
        <Button className='w-full' onClick={() => showDarwinExportToast({ leafGroupId })}>
          Export Darwin CSV
        </Button>
        <Button className='w-full mt-8' variant='outline' onClick={() => setVizDialogOpen(true)}>
          Export Visualization
        </Button>
        <VisualizationDialog
          open={vizDialogOpen}
          onClose={() => setVizDialogOpen(false)}
          initialLeafGroupIds={[leafGroupId]}
        />

        {/* <Button
          className='w-full mt-8'
          onClick={() => {
            const p = exportNightSummaryRS({ leafGroupId })
            toast.promise(p, {
              loading: '💾 Exporting RS summary…',
              success: '✅ RS summary exported',
              error: '🚨 Failed to export RS summary',
            })
          }}
        >
          Export summary to RS
        </Button> */}
      </div>
    </Column>
  )
}

type DetectorSelectorSectionProps = {
  detectorIds: string[]
  selectedDetectorId?: string
  onDetectorChange?: (id: string) => void
  className?: string
}

function DetectorSelectorSection(props: DetectorSelectorSectionProps) {
  const { detectorIds, selectedDetectorId, onDetectorChange, className } = props
  return (
    <div className={cn('mb-16 flex items-center justify-between gap-8', className)}>
      <div className='flex min-w-0 items-baseline gap-6'>
        <PanelHeading className='shrink-0'>Detection run</PanelHeading>
        <span className='truncate text-13 font-medium text-ink-primary'>{selectedDetectorId ?? '—'}</span>
      </div>
      {detectorIds.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size='icon-sm' variant='ghostMuted' aria-label='Choose detection run' icon={EllipsisIcon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side='right' align='start' sideOffset={4}>
            <DropdownMenuLabel>Detection run</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={selectedDetectorId ?? ''} onValueChange={(v) => onDetectorChange?.(v)}>
              {detectorIds.map((id) => (
                <DropdownMenuRadioItem key={id} value={id}>
                  {id}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

function showDarwinExportToast(params: { leafGroupId: string }) {
  const { leafGroupId } = params

  const promise = exportNightDarwinCSV({ leafGroupId })

  toast.promise(promise, {
    loading: '💾 Exporting Darwin CSV…',
    success: () => ({
      message: '✅ Darwin CSV exported in the night folder',
      action: {
        label: 'Copy file path',
        onClick: () => {
          void copyNightExportFilePathToClipboard({ leafGroupId })
        },
      },
      cancel: {
        label: 'Copy folder path',
        onClick: () => {
          void copyNightFolderPathToClipboard({ leafGroupId })
        },
      },
    }),
    error: '🚨 Failed to export Darwin CSV',
  })
}

type LayoutOptionsSectionProps = {
  className?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

function LayoutOptionsSection(props: LayoutOptionsSectionProps) {
  const { className, open, onToggle, children } = props
  const Icon = open ? ChevronUpIcon : ChevronDownIcon

  return (
    <div className={className}>
      <button
        type='button'
        className={cn(
          '-mx-8 flex w-[calc(100%+16px)] items-center justify-between gap-8 rounded-md p-8 text-left',
          'text-14 font-semibold text-ink-primary',
          'hover:bg-inka-100',
        )}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? 'Collapse layout options' : 'Expand layout options'}
      >
        <PanelHeading className='text-inherit'>Layout Options</PanelHeading>
        <Icon className='h-14 w-14 text-neutral-500' />
      </button>

      {!open ? null : <div className='space-y-10 pt-8'>{children}</div>}
    </div>
  )
}

type SizeThresholdControlProps = {
  value: number
  max: number
  onChange: (value: number) => void
}

function SizeThresholdControl(props: SizeThresholdControlProps) {
  const { value, max, onChange } = props
  const sliderMax = Math.max(1, max)
  const sliderStep = getSizeThresholdStep({ max: sliderMax })
  const valueLabel = getSizeThresholdLabel({ value, max })

  return (
    <LabeledSliderControl
      label='Size threshold'
      value={valueLabel}
      sliderValue={Math.min(value, sliderMax)}
      min={0}
      max={sliderMax}
      step={sliderStep}
      disabled={max <= 0}
      onChange={onChange}
    />
  )
}

function getSizeThresholdStep(params: { max: number }) {
  const { max } = params
  if (max <= 200) return 1
  if (max <= 1000) return 5
  return 10
}

function getSizeThresholdLabel(params: { value: number; max: number }) {
  const { value, max } = params
  if (max <= 0) return 'No size data'
  if (value <= 0) return 'All sizes'
  return `>= ${value}px`
}

type LabeledCheckboxControlProps = {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}

function LabeledCheckboxControl(props: LabeledCheckboxControlProps) {
  const { label, checked, onChange } = props
  return (
    <label className='flex items-center justify-between gap-8 text-13 cursor-pointer select-none'>
      <span className='text-ink-secondary'>{label}</span>
      <input
        type='checkbox'
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className='accent-blue-600 cursor-pointer'
      />
    </label>
  )
}
