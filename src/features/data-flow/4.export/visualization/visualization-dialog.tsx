import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { toast } from 'sonner'
import { ImageIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { activeNightIdsStore } from '~/stores/ui'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { patchesStore } from '~/stores/entities/5.patches'
import { patchFileMapByNightStore } from '~/features/data-flow/1.ingest/files.state'
import { cn } from '~/utils/cn'
import { buildVizData } from './viz-data'
import { renderVisualization } from './viz-renderer'
import { exportVisualization } from './viz-export'
import { defaultVizConfig } from './viz-types'
import { useAvailableTaxaKeys } from './use-viz-data'
import type { VizChartType, VizConfig, VizGroupBy, VizRepresentativeMode, VizTaxaRank } from './viz-types'

const PREVIEW_WIDTH = 800
const PREVIEW_HEIGHT = 533

type Props = {
  open: boolean
  onClose: () => void
  initialLeafGroupIds?: string[]
}

export function VisualizationDialog(props: Props) {
  const { open, onClose, initialLeafGroupIds } = props

  const leafGroups = useStore(leafGroupsStore)
  const activeNightIds = useStore(activeNightIdsStore)
  const hierarchy = useStore(activeHierarchyStore)
  const patches = useStore(patchesStore)
  const patchMapByNight = useStore(patchFileMapByNightStore)

  const allLeafGroupIds = hierarchy?.leafGroupIds ?? []

  const [config, setConfig] = useState<VizConfig>(() => {
    const ids = initialLeafGroupIds?.length
      ? initialLeafGroupIds
      : activeNightIds.size > 0
        ? Array.from(activeNightIds)
        : allLeafGroupIds.slice(0, 1)
    return defaultVizConfig(ids)
  })

  // Reset config when dialog opens with new initial IDs
  useEffect(() => {
    if (!open) return
    const ids = initialLeafGroupIds?.length
      ? initialLeafGroupIds
      : activeNightIds.size > 0
        ? Array.from(activeNightIds)
        : allLeafGroupIds.slice(0, 1)
    setConfig(defaultVizConfig(ids))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const availableTaxa = useAvailableTaxaKeys(config.selectedLeafGroupIds, config.taxaRank)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendering, setRendering] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Re-render preview whenever config or data changes
  useEffect(() => {
    if (!open || !canvasRef.current) return
    let cancelled = false

    async function render() {
      setRendering(true)
      try {
        const canvas = canvasRef.current!
        canvas.width = PREVIEW_WIDTH
        canvas.height = PREVIEW_HEIGHT

        const data = buildVizData(config)

        // Load images for preview (load all needed detections)
        const detsToLoad = config.representativeMode === 'first'
          ? data.groups.map((g) => g.representative)
          : data.groups.flatMap((g) => g.detections)

        const imageMap = new Map<string, ImageBitmap>()
        await Promise.allSettled(
          detsToLoad.map(async (det) => {
            const patch = patches[det.patchId]
            if (!patch) return
            let file: File | undefined
            if (config.preferNobg) {
              const nightMap = patchMapByNight[det.leafGroupId]
              const baseName = patch.name.replace(/\.[^.]+$/, '')
              file = nightMap?.[`${baseName}_nobg.png`]?.file
            }
            if (!file) file = patch.imageFile?.file
            if (!file) return
            try {
              imageMap.set(det.patchId, await createImageBitmap(file))
            } catch { /* skip */ }
          }),
        )

        if (cancelled) {
          for (const bmp of imageMap.values()) bmp.close()
          return
        }

        await renderVisualization(canvas, data, config, imageMap)
        for (const bmp of imageMap.values()) bmp.close()
      } finally {
        if (!cancelled) setRendering(false)
      }
    }

    void render()
    return () => { cancelled = true }
  }, [open, config, patches, patchMapByNight])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const result = await exportVisualization(config)
      if (result) {
        toast.success('Visualization exported', {
          description: result.folderPath,
          cancel: {
            label: 'Copy folder path',
            onClick: () => void navigator.clipboard.writeText(result.folderPath).catch(() => null),
          },
        })
        onClose()
      } else {
        toast.error('Failed to export visualization')
      }
    } finally {
      setExporting(false)
    }
  }, [config, onClose])

  function update(partial: Partial<VizConfig>) {
    setConfig((prev) => ({ ...prev, ...partial }))
  }

  function toggleNight(id: string) {
    const next = config.selectedLeafGroupIds.includes(id)
      ? config.selectedLeafGroupIds.filter((x) => x !== id)
      : [...config.selectedLeafGroupIds, id]
    if (next.length === 0) return
    update({ selectedLeafGroupIds: next })
  }

  function toggleTaxaFilter(key: string) {
    const next = config.taxaFilter.includes(key)
      ? config.taxaFilter.filter((x) => x !== key)
      : [...config.taxaFilter, key]
    update({ taxaFilter: next })
  }

  return (
    <Dialog open={open}>
      <DialogContent align='vhSide' onClose={onClose} className='flex flex-col'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-8'>
            <ImageIcon className='h-16 w-16' />
            Export Visualization
          </DialogTitle>
        </DialogHeader>

        <div className='flex flex-col gap-16 flex-1 overflow-y-auto'>

          {/* Night scope */}
          {allLeafGroupIds.length > 1 && (
            <Section label='Nights'>
              <div className='space-y-4 max-h-[140px] overflow-y-auto'>
                {allLeafGroupIds.map((id) => {
                  const night = leafGroups[id]
                  return (
                    <label key={id} className='flex items-center gap-8 cursor-pointer text-13 select-none'>
                      <input
                        type='checkbox'
                        checked={config.selectedLeafGroupIds.includes(id)}
                        onChange={() => toggleNight(id)}
                        className='rounded accent-blue-600'
                      />
                      <span className={cn('flex-1 truncate', config.selectedLeafGroupIds.includes(id) ? 'text-ink-primary' : 'text-ink-secondary')}>
                        {night?.name ?? id.split('/').pop()}
                      </span>
                    </label>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Chart type */}
          <Section label='Chart type'>
            <SegmentedControl
              value={config.chartType}
              options={[
                { value: 'bar', label: 'Bar' },
                { value: 'radial', label: 'Radial' },
              ]}
              onChange={(v) => update({ chartType: v as VizChartType })}
            />
          </Section>

          {/* Organize by */}
          <Section label='Organize by'>
            <div className='flex gap-8 items-center flex-wrap'>
              <SegmentedControl
                value={config.groupBy}
                options={[
                  { value: 'taxa', label: 'Taxa' },
                  { value: 'cluster', label: 'Cluster' },
                ]}
                onChange={(v) => update({ groupBy: v as VizGroupBy, taxaFilter: [] })}
              />
              {config.groupBy === 'taxa' && (
                <select
                  value={config.taxaRank}
                  onChange={(e) => update({ taxaRank: e.target.value as VizTaxaRank, taxaFilter: [] })}
                  className='rounded border border-neutral-300 dark:border-neutral-600 px-8 py-4 text-13 bg-background'
                >
                  <option value='order'>Order</option>
                  <option value='family'>Family</option>
                  <option value='genus'>Genus</option>
                  <option value='species'>Species</option>
                </select>
              )}
            </div>
          </Section>

          {/* Taxa filter */}
          {config.groupBy === 'taxa' && availableTaxa.length > 0 && (
            <Section label={`Filter ${config.taxaRank} (${config.taxaFilter.length === 0 ? 'all' : config.taxaFilter.length} selected)`}>
              <div className='flex gap-4 flex-wrap max-h-[120px] overflow-y-auto'>
                <button
                  type='button'
                  onClick={() => update({ taxaFilter: [] })}
                  className={cn(
                    'rounded px-8 py-3 text-12 border transition-colors',
                    config.taxaFilter.length === 0
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-neutral-300 dark:border-neutral-600 text-ink-secondary hover:text-ink-primary',
                  )}
                >
                  All
                </button>
                {availableTaxa.map((key) => (
                  <button
                    key={key}
                    type='button'
                    onClick={() => toggleTaxaFilter(key)}
                    className={cn(
                      'rounded px-8 py-3 text-12 border transition-colors',
                      config.taxaFilter.includes(key)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-neutral-300 dark:border-neutral-600 text-ink-secondary hover:text-ink-primary',
                    )}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Images */}
          <Section label='Images'>
            <div className='space-y-10'>
              <SwitchRow
                label='One representative per group'
                checked={config.representativeMode === 'first'}
                onChange={(v) => update({ representativeMode: v ? 'first' : 'most-common' as VizRepresentativeMode })}
              />
              <SwitchRow
                label='Prefer background-removed (Mothbox only)'
                checked={config.preferNobg}
                onChange={(v) => update({ preferNobg: v })}
              />
            </div>
          </Section>

          {/* Preview */}
          <Section label={rendering ? 'Preview (rendering…)' : 'Preview'}>
            <div className='relative w-full rounded overflow-hidden bg-[#0f0f1a]' style={{ aspectRatio: `${PREVIEW_WIDTH}/${PREVIEW_HEIGHT}` }}>
              <canvas
                ref={canvasRef}
                width={PREVIEW_WIDTH}
                height={PREVIEW_HEIGHT}
                className='w-full h-full'
              />
              {rendering && (
                <div className='absolute inset-0 flex items-center justify-center bg-black/40 text-white text-13'>
                  Rendering…
                </div>
              )}
            </div>
          </Section>
        </div>

        <DialogFooter className='pt-8'>
          <Button variant='outline' onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting || config.selectedLeafGroupIds.length === 0}>
            {exporting ? 'Exporting…' : 'Export PNG'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── small helpers ────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className='text-12 font-medium text-ink-secondary uppercase tracking-wide mb-8'>{label}</div>
      {children}
    </div>
  )
}

function SegmentedControl(props: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className='inline-flex rounded-md border border-neutral-300 dark:border-neutral-600 overflow-hidden'>
      {props.options.map((opt) => (
        <button
          key={opt.value}
          type='button'
          onClick={() => props.onChange(opt.value)}
          className={cn(
            'px-12 py-4 text-13 transition-colors',
            props.value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-background text-ink-secondary hover:text-ink-primary',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SwitchRow(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className='flex items-center justify-between gap-8 cursor-pointer'>
      <span className='text-13 text-ink-secondary'>{props.label}</span>
      <Switch checked={props.checked} onCheckedChange={props.onChange} />
    </label>
  )
}
