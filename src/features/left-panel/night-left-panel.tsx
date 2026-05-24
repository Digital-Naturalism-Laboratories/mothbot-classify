import { Column, PanelHeading } from '~/styles'
import { cn } from '~/utils/cn'
import { Progress } from '~/components/ui/progress'
import { Button } from '~/components/ui/button'
import { useStore } from '@nanostores/react'
import { useState, type ReactNode } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { detectionsStore } from '~/stores/entities/detections'
import { exportNightDarwinCSV, copyNightExportFilePathToClipboard, copyNightFolderPathToClipboard } from '~/features/data-flow/4.export/darwin-csv'
import { toast } from 'sonner'
import { LabeledSliderControl } from '~/components/atomic/labeled-slider-control'
import { PatchSizeControl } from '~/components/atomic/patch-size-control'
import type { NightLeftPanelProps } from './left-panel.types'
import { WarningsBox } from './warnings-box'
import { TaxonomySection } from './taxonomy-section'

export function NightLeftPanel(props: NightLeftPanelProps) {
  const {
    nightId,
    taxonomyAuto,
    taxonomyUser,
    totalPatches,
    totalDetections,
    totalIdentified = 0,
    sizeThreshold,
    sizeThresholdMax,
    sortByClusters,
    onSizeThresholdChange,
    onSortByClustersChange,
    selectedTaxon,
    selectedBucket,
    onSelectTaxon,
    warnings,
    className,
  } = props

  const detections = useStore(detectionsStore)
  const [layoutOptionsOpen, setLayoutOptionsOpen] = useState(false)
  const errorCountForNight = Object.values(detections ?? {}).filter(
    (d) => (d as any)?.nightId === nightId && (d as any)?.detectedBy === 'user' && (d as any)?.isError === true,
  ).length

  return (
    <Column className={cn('px-16 py-20 pt-12', className)}>
      <WarningsBox warnings={warnings} className='mb-16' />
      <div className='mb-16'>
        <PanelHeading className='mb-6'>Summary</PanelHeading>
        <div className='space-y-4 text-13 text-neutral-700'>
          <div className='flex items-center justify-between'>
            <span>Total patches</span>
            <span className='font-medium'>{totalPatches}</span>
          </div>
          <div className='flex items-center justify-between'>
            <span>Total detections</span>
            <span className='font-medium'>{totalDetections}</span>
          </div>
          <div className='flex items-center justify-between'>
            <span>Identified</span>
            <span className='font-medium'>{totalIdentified}</span>
          </div>
          <div className='pt-4'>
            <Progress value={totalDetections ? Math.round((totalIdentified / totalDetections) * 100) : 0} />
          </div>
        </div>
      </div>

      <LayoutOptionsSection
        className='mb-16'
        open={layoutOptionsOpen}
        onToggle={() => setLayoutOptionsOpen((currentValue) => !currentValue)}
      >
        <PatchSizeControl compact />
        <SizeThresholdControl value={sizeThreshold} max={sizeThresholdMax} onChange={onSizeThresholdChange} />
      </LayoutOptionsSection>

      <TaxonomySection
        title='Machine identified'
        nodes={taxonomyAuto}
        bucket='auto'
        sortByClusters={sortByClusters}
        onSortByClustersChange={onSortByClustersChange}
        selectedTaxon={selectedTaxon}
        selectedBucket={selectedBucket}
        onSelectTaxon={onSelectTaxon}
        emptyText='No detections'
      />

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
        <Button className='w-full' onClick={() => showDarwinExportToast({ nightId })}>
          Export Darwin CSV
        </Button>

        {/* <Button
          className='w-full mt-8'
          onClick={() => {
            const p = exportNightSummaryRS({ nightId })
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

function showDarwinExportToast(params: { nightId: string }) {
  const { nightId } = params

  const promise = exportNightDarwinCSV({ nightId })

  toast.promise(promise, {
    loading: '💾 Exporting Darwin CSV…',
    success: () => ({
      message: '✅ Darwin CSV exported in the night folder',
      action: {
        label: 'Copy file path',
        onClick: () => {
          void copyNightExportFilePathToClipboard({ nightId })
        },
      },
      cancel: {
        label: 'Copy folder path',
        onClick: () => {
          void copyNightFolderPathToClipboard({ nightId })
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
