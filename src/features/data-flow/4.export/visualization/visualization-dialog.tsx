import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { toast } from 'sonner'
import { ImageIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { activeNightIdsStore, selectedPatchIdsStore } from '~/stores/ui'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { detectionsStore } from '~/stores/entities/detections'
import { cn } from '~/utils/cn'
import { buildVizDetections } from './viz-data'
import { loadPatchImages } from './viz-images'
import { renderMosaicFromDetections, drawMosaicToPreview } from './viz-renderer'
import { exportVisualization } from './viz-export'
import { defaultVizConfig, resolveBackground } from './viz-types'
import { useAvailableTaxaKeys } from './use-viz-data'
import type {
  VizBackground, VizConfig, VizLayout, VizScope, VizSortMode, VizTaxaRank,
} from './viz-types'

const PREVIEW_WIDTH = 1000
const PREVIEW_HEIGHT = 667
const PREVIEW_RENDER_WIDTH = 1100 // pack at a reduced width for a responsive preview
const PREVIEW_MAX_ITEMS = 1500

type Props = { open: boolean; onClose: () => void; initialLeafGroupIds?: string[] }

const NOBG_MODES = {
  prefer: { preferNobg: true, requireNobg: false, label: 'Prefer transparent (fall back to jpg)' },
  only: { preferNobg: true, requireNobg: true, label: 'Only transparent (nobg)' },
  jpg: { preferNobg: false, requireNobg: false, label: 'Original jpg' },
} as const
type NobgMode = keyof typeof NOBG_MODES

export function VisualizationDialog(props: Props) {
  const { open, onClose, initialLeafGroupIds } = props

  const leafGroups = useStore(leafGroupsStore)
  const activeNightIds = useStore(activeNightIdsStore)
  const hierarchy = useStore(activeHierarchyStore)
  const selectedPatchIds = useStore(selectedPatchIdsStore)
  useStore(detectionsStore)

  const allLeafGroupIds = useMemo(() => hierarchy?.leafGroupIds ?? [], [hierarchy])
  const selectionCount = selectedPatchIds?.size ?? 0

  const initialNights = useCallback(() => {
    if (initialLeafGroupIds?.length) return initialLeafGroupIds
    if (activeNightIds.size > 0) return Array.from(activeNightIds)
    return allLeafGroupIds.slice(0, 1)
  }, [initialLeafGroupIds, activeNightIds, allLeafGroupIds])

  const [config, setConfig] = useState<VizConfig>(() => defaultVizConfig(initialNights(), selectionCount > 0))
  const [baseMask, setBaseMask] = useState<ImageBitmap | null>(null)
  const [rendering, setRendering] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Reset when reopened.
  useEffect(() => {
    if (!open) return
    setConfig(defaultVizConfig(initialNights(), selectionCount > 0))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const availableTaxa = useAvailableTaxaKeys(config)

  // Debounced preview render. Runs whenever the dialog is open and the config /
  // mask changes — including the first open. The canvas-ref check lives inside
  // the timer so a not-yet-mounted ref (Radix portals the content in) doesn't
  // skip the initial render.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const target = canvasRef.current
      if (!target || cancelled) return
      setRendering(true)
      try {
        // Pack at a reduced width but scale proportionally so the preview reads
        // like the full-resolution export, just smaller.
        const previewConfig: VizConfig = {
          ...config,
          outputWidth: PREVIEW_RENDER_WIDTH,
          scale: config.scale * (PREVIEW_RENDER_WIDTH / Math.max(1, config.outputWidth)),
          limit: config.limit > 0 ? Math.min(config.limit, PREVIEW_MAX_ITEMS) : PREVIEW_MAX_ITEMS,
        }
        const { detections, scopeLabel } = buildVizDetections(previewConfig)
        const { images } = await loadPatchImages(detections, {
          preferNobg: config.preferNobg, requireNobg: config.requireNobg,
        })
        if (cancelled) { for (const b of images.values()) b.close(); return }
        const { canvas: mosaic, stats } = await renderMosaicFromDetections(detections, previewConfig, images, baseMask)
        for (const b of images.values()) b.close()
        if (cancelled) return
        drawMosaicToPreview(target, mosaic, resolveBackground(config))
        setStatus(`${scopeLabel} · placed ${stats.placed}/${detections.length}` +
          (stats.filtered ? ` · filtered ${stats.filtered}` : '') +
          (config.limit > 0 && detections.length >= PREVIEW_MAX_ITEMS ? ' · preview capped' : ''))
      } catch (e) {
        setStatus(`⚠️ ${(e as Error).message}`)
      } finally {
        if (!cancelled) setRendering(false)
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, config, baseMask])

  function update(partial: Partial<VizConfig>) {
    setConfig((prev) => ({ ...prev, ...partial }))
  }

  function setScope(scope: VizScope) {
    if (scope === 'dataset') update({ scope, selectedLeafGroupIds: allLeafGroupIds })
    else if (scope === 'night') update({ scope, selectedLeafGroupIds: initialNights() })
    else update({ scope })
  }

  function toggleNight(id: string) {
    const next = config.selectedLeafGroupIds.includes(id)
      ? config.selectedLeafGroupIds.filter((x) => x !== id)
      : [...config.selectedLeafGroupIds, id]
    if (next.length === 0) return
    update({ selectedLeafGroupIds: next })
  }

  async function onMaskFile(file: File | undefined) {
    if (!file) { setBaseMask(null); return }
    try { setBaseMask(await createImageBitmap(file)) } catch { toast.error('Could not read mask image') }
  }

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const result = await exportVisualization(config, baseMask)
      if (result) {
        toast.success('Mosaic exported', {
          description: result.filePath,
          action: { label: 'Copy path', onClick: () => void navigator.clipboard.writeText(result.filePath).catch(() => null) },
        })
        onClose()
      } else {
        toast.error('Nothing to export — check your scope/selection')
      }
    } finally {
      setExporting(false)
    }
  }, [config, baseMask, onClose])

  const nobgMode: NobgMode = config.requireNobg ? 'only' : config.preferNobg ? 'prefer' : 'jpg'

  return (
    <Dialog open={open}>
      <DialogContent align='vhSide' onClose={onClose} className='flex flex-col'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-8'>
            <ImageIcon className='h-16 w-16' /> Create Mosaic
          </DialogTitle>
        </DialogHeader>

        <div className='flex flex-row gap-20 flex-1 overflow-hidden'>
          {/* Left: controls (scroll independently of the preview) */}
          <div className='flex flex-col gap-16 w-[420px] shrink-0 overflow-y-auto pr-8'>
          {/* Scope */}
          <Section label='Visualize'>
            <SegmentedControl
              value={config.scope}
              options={[
                { value: 'selection', label: `Selection${selectionCount ? ` (${selectionCount})` : ''}` },
                { value: 'night', label: 'Night(s)' },
                { value: 'dataset', label: 'Dataset' },
              ]}
              onChange={(v) => setScope(v as VizScope)}
            />
            {config.scope === 'selection' && selectionCount === 0 && (
              <div className='text-12 text-ink-secondary mt-4'>Nothing selected — falling back to the active night.</div>
            )}
          </Section>

          {/* Night checklist (night scope) */}
          {config.scope === 'night' && allLeafGroupIds.length > 1 && (
            <Section label='Nights'>
              <div className='space-y-4 max-h-[120px] overflow-y-auto'>
                {allLeafGroupIds.map((id) => (
                  <label key={id} className='flex items-center gap-8 cursor-pointer text-13 select-none'>
                    <input type='checkbox' checked={config.selectedLeafGroupIds.includes(id)}
                      onChange={() => toggleNight(id)} className='rounded accent-blue-600' />
                    <span className={cn('flex-1 truncate', config.selectedLeafGroupIds.includes(id) ? 'text-ink-primary' : 'text-ink-secondary')}>
                      {leafGroups[id]?.name ?? id.split('/').pop()}
                    </span>
                  </label>
                ))}
              </div>
            </Section>
          )}

          {/* Layout */}
          <Section label='Layout'>
            <SegmentedControl
              value={config.layout}
              options={[{ value: 'radial', label: 'Radial' }, { value: 'bar', label: 'Bar' }, { value: 'shape', label: 'Shape' }]}
              onChange={(v) => update({ layout: v as VizLayout })}
            />
            {config.layout === 'shape' && (
              <div className='mt-8 flex items-center gap-8 text-13'>
                <input type='file' accept='image/*' onChange={(e) => onMaskFile(e.target.files?.[0])} />
                <span className='text-ink-secondary'>{baseMask ? 'mask loaded' : 'opaque/dark = fill'}</span>
              </div>
            )}
          </Section>

          {/* Sort */}
          <Section label='Sort by'>
            <div className='flex gap-8 items-center flex-wrap'>
              <SegmentedControl
                value={config.sortMode}
                options={[{ value: 'size', label: 'Size' }, { value: 'cluster', label: 'Cluster' }, { value: 'taxon', label: 'Taxon' }, { value: 'none', label: 'None' }]}
                onChange={(v) => update({ sortMode: v as VizSortMode })}
              />
              {(config.sortMode === 'taxon' || config.taxaFilter.length > 0) && (
                <select value={config.taxaRank}
                  onChange={(e) => update({ taxaRank: e.target.value as VizTaxaRank, taxaFilter: [] })}
                  className='rounded border border-neutral-300 dark:border-neutral-600 px-8 py-4 text-13 bg-background'>
                  <option value='order'>Order</option>
                  <option value='family'>Family</option>
                  <option value='genus'>Genus</option>
                  <option value='species'>Species</option>
                </select>
              )}
            </div>
          </Section>

          {/* Taxa filter */}
          {availableTaxa.length > 0 && (
            <Section label={`Filter ${config.taxaRank} (${config.taxaFilter.length === 0 ? 'all' : config.taxaFilter.length})`}>
              <div className='flex gap-4 flex-wrap max-h-[110px] overflow-y-auto'>
                <Chip active={config.taxaFilter.length === 0} onClick={() => update({ taxaFilter: [] })}>All</Chip>
                {availableTaxa.map((key) => (
                  <Chip key={key} active={config.taxaFilter.includes(key)}
                    onClick={() => update({
                      taxaFilter: config.taxaFilter.includes(key)
                        ? config.taxaFilter.filter((x) => x !== key)
                        : [...config.taxaFilter, key],
                    })}>{key}</Chip>
                ))}
              </div>
            </Section>
          )}

          {/* Selection refinements */}
          <Section label='Refine'>
            <div className='space-y-10'>
              <SwitchRow label='One representative per cluster' checked={config.onePerCluster}
                onChange={(v) => update({ onePerCluster: v })} />
              <SwitchRow label='Exclude unclustered / noise' checked={config.excludeNoise}
                onChange={(v) => update({ excludeNoise: v })} />
              <SwitchRow label='Include Error-marked' checked={config.includeErrors}
                onChange={(v) => update({ includeErrors: v })} />
              <NumberRow label='Limit (0 = all)' value={config.limit} min={0}
                onChange={(v) => update({ limit: v })} />
            </div>
          </Section>

          {/* Patch images */}
          <Section label='Patch images'>
            <div className='space-y-10'>
              <select value={nobgMode}
                onChange={(e) => update({ preferNobg: NOBG_MODES[e.target.value as NobgMode].preferNobg, requireNobg: NOBG_MODES[e.target.value as NobgMode].requireNobg })}
                className='w-full rounded border border-neutral-300 dark:border-neutral-600 px-8 py-4 text-13 bg-background'>
                {Object.entries(NOBG_MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <SliderRow label='Scale' value={config.scale} min={0.05} max={1} step={0.05}
                onChange={(v) => update({ scale: v })} />
              <SliderRow label='Padding' value={config.padding} min={0} max={12} step={1}
                onChange={(v) => update({ padding: v })} />
              <SliderRow label='Drop blurriest %' value={config.blurDropPct} min={0} max={60} step={5}
                onChange={(v) => update({ blurDropPct: v })} />
              <SliderRow label='Drop least-opaque %' value={config.opacityDropPct} min={0} max={60} step={5}
                onChange={(v) => update({ opacityDropPct: v })} />
            </div>
          </Section>

          {/* Canvas */}
          <Section label='Canvas'>
            <div className='space-y-10'>
              <NumberRow label='Width (px)' value={config.outputWidth} min={200}
                onChange={(v) => update({ outputWidth: v })} />
              <div className='flex items-center gap-12'>
                <span className='text-13 text-ink-secondary w-[120px] shrink-0'>Background</span>
                <div className='flex items-center gap-8'>
                  <SegmentedControl value={config.background}
                    options={[{ value: 'transparent', label: 'None' }, { value: 'black', label: 'Black' }, { value: 'white', label: 'White' }, { value: 'custom', label: 'Custom' }]}
                    onChange={(v) => update({ background: v as VizBackground })} />
                  {config.background === 'custom' && (
                    <input type='color' value={config.bgColor} onChange={(e) => update({ bgColor: e.target.value })}
                      className='h-24 w-32 rounded border border-neutral-300 dark:border-neutral-600' />
                  )}
                </div>
              </div>
            </div>
          </Section>

          </div>

          {/* Right: live preview, pinned beside the controls */}
          <div className='flex-1 min-w-0 overflow-y-auto'>
            <Section label={rendering ? 'Preview (rendering…)' : `Preview — ${status || 'ready'}`}>
              <div className='relative w-full rounded overflow-hidden' style={{ aspectRatio: `${PREVIEW_WIDTH}/${PREVIEW_HEIGHT}` }}>
                <canvas ref={canvasRef} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} className='w-full h-full' />
                {rendering && <div className='absolute inset-0 flex items-center justify-center bg-black/40 text-white text-13'>Rendering…</div>}
              </div>
            </Section>
          </div>
        </div>

        <DialogFooter className='pt-8'>
          <Button variant='outline' onClick={onClose} disabled={exporting}>Cancel</Button>
          <Button onClick={handleExport} disabled={exporting || rendering}>
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

function SegmentedControl(props: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className='inline-flex rounded-md border border-neutral-300 dark:border-neutral-600 overflow-hidden'>
      {props.options.map((opt) => (
        <button key={opt.value} type='button' onClick={() => props.onChange(opt.value)}
          className={cn('px-12 py-4 text-13 transition-colors',
            props.value === opt.value ? 'bg-blue-600 text-white' : 'bg-background text-ink-secondary hover:text-ink-primary')}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SwitchRow(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className='flex items-center gap-12 cursor-pointer'>
      <span className='text-13 text-ink-secondary w-[240px] shrink-0'>{props.label}</span>
      <Switch checked={props.checked} onCheckedChange={props.onChange} />
    </label>
  )
}

function SliderRow(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className='flex items-center gap-12'>
      <span className='text-13 text-ink-secondary w-[120px] shrink-0'>{props.label}</span>
      <input type='range' min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))} className='flex-1 max-w-[220px] accent-blue-600' />
      <span className='text-12 tabular-nums w-32 text-right text-ink-primary'>{props.value}</span>
    </div>
  )
}

/** Free-typing number field that commits on blur / Enter (not on every keystroke). */
function NumberRow(props: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(props.value))
  useEffect(() => { setText(String(props.value)) }, [props.value])
  const commit = () => {
    const n = Number(text)
    props.onChange(Number.isFinite(n) ? Math.max(props.min, Math.round(n)) : props.value)
  }
  return (
    <div className='flex items-center gap-12'>
      <span className='text-13 text-ink-secondary w-[120px] shrink-0'>{props.label}</span>
      <input type='text' inputMode='numeric' value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() } }}
        className='w-[110px] rounded border border-neutral-300 dark:border-neutral-600 px-8 py-4 text-13 bg-background' />
    </div>
  )
}

function Chip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type='button' onClick={props.onClick}
      className={cn('rounded px-8 py-3 text-12 border transition-colors',
        props.active ? 'bg-blue-600 text-white border-blue-600' : 'border-neutral-300 dark:border-neutral-600 text-ink-secondary hover:text-ink-primary')}>
      {props.children}
    </button>
  )
}
