import { useStore } from '@nanostores/react'
import { useMemo, useState, useEffect, useRef } from 'react'
import { PatchDownloadContextMenu } from '~/components/atomic/patch-download-context-menu'
import { TaxonRankBadge } from '~/components/taxon-rank-badge'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { detectionStoreById, labelDetections, type DetectionEntity } from '~/stores/entities/detections'
import { patchStoreById } from '~/stores/entities/patch-selectors'
import { photosStore } from '~/stores/entities/photos'
import type { PatchEntity } from '~/stores/entities/5.patches'
import type { PhotoEntity } from '~/stores/entities/photos'
import { makeIndexedFileHandle } from '~/stores/entities/photos'
import { useObjectUrl } from '~/utils/use-object-url'
import type { TaxonRecord } from '~/features/data-flow/2.identify/species-list.store'
import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { morphoLinksStore } from '~/features/data-flow/3.persist/links'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { deriveTaxonNameFromDetection } from '~/models/taxonomy/extract'
import { getProjectIdFromNightId } from '~/utils/paths'
import { ImageWithDownloadName } from '~/components/atomic/image-with-download-name'
import { buildDetectionPolygonPoints } from '~/models/detection-overlay'

export type PatchDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  patchId?: string | null
}

export function PatchDetailDialog(props: PatchDetailDialogProps) {
  const { open, onOpenChange, patchId } = props

  const patch = useStore(patchStoreById(patchId || ''))
  const detection = useStore(detectionStoreById(patchId || ''))
  const photos = useStore(photosStore)
  const photo = patch?.photoId ? photos?.[patch.photoId] : undefined
  const morphoLinks = useStore(morphoLinksStore)

  const [identifyOpen, setIdentifyOpen] = useState(false)

  const projectId = useMemo(() => getProjectIdFromNightId(patch?.leafGroupId), [patch?.leafGroupId])

  const morphospeciesKey = useMemo(() => {
    const morpho = typeof detection?.morphospecies === 'string' ? detection.morphospecies : ''
    return morpho ? normalizeMorphoKey(morpho) : undefined
  }, [detection?.morphospecies])

  const morphospeciesLink = useMemo(() => {
    if (!morphospeciesKey) return undefined
    return morphoLinks?.[morphospeciesKey]
  }, [morphospeciesKey, morphoLinks])

  function onIdentifySubmit(label: string, taxon?: TaxonRecord) {
    const detectionId = patch?.id
    const trimmed = (label ?? '').trim()
    if (!detectionId || !trimmed) return

    labelDetections({ detectionIds: [detectionId], label: trimmed, taxon })
  }

  const showNobg = patch?.imageFile?.parentDir != null
  const botData = useBotDetectionData(patch)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent align='vhSide' className='max-w-[1200px]'>
        <DialogHeader className={`grid gap-8 mb-8 ${showNobg ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <DialogTitle>Patch details</DialogTitle>
          <DialogTitle>Source Photo</DialogTitle>
          {showNobg ? <DialogTitle>Background Removed</DialogTitle> : null}
        </DialogHeader>

        <div className={`grid grid-cols-1 gap-12 ${showNobg ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <PatchDetails patch={patch} detection={detection} />
          <SourcePhoto photo={photo} detection={detection} />
          {showNobg ? <NobgImage patch={patch} detection={detection} botData={botData} /> : null}
        </div>

        <div className='mt-12 grid grid-cols-1 md:grid-cols-2 gap-12 text-12 text-neutral-700'>
          <div className='space-y-4'>
            <h4 className='text-14 font-semibold text-neutral-800'>Detection</h4>
            <div>
              <span className='font-medium'>Label:</span> {detection?.label ?? 'Unlabeled'}
            </div>
            <div>
              <span className='font-medium'>Detected by:</span> {detection?.detectedBy ?? 'auto'}
            </div>
            <div>
              <span className='font-medium'>Score:</span> {detection?.score ?? '—'}
            </div>
            <div>
              <span className='font-medium'>Shape:</span> {detection?.shapeType ?? '—'}
            </div>
            <div>
              <span className='font-medium'>Points:</span> {Array.isArray(detection?.points) ? detection!.points!.length : 0}
            </div>
            <BlurDetails blurScore={patch?.blurScore ?? botData?.blurScore} botData={botData} />

            {(() => {
              const px = botData?.pixelMassPixels ?? detection?.pixelMassPixels
              const mm2 = botData?.pixelMassMm2 ?? detection?.pixelMassMm2
              if (px == null && mm2 == null) return null
              return (
                <div className='pt-8 space-y-2'>
                  <h5 className='text-13 font-semibold text-neutral-800'>Pixel Mass</h5>
                  {px != null ? (
                    <div><span className='font-medium'>Foreground pixels:</span> {px.toLocaleString()}</div>
                  ) : null}
                  {mm2 != null ? (
                    <div><span className='font-medium'>Pixel area:</span> {mm2.toFixed(4)} mm²</div>
                  ) : null}
                  {mm2 == null && px != null ? (
                    <div className='text-neutral-500 text-11'>No calibration set — area in mm² unavailable</div>
                  ) : null}
                </div>
              )
            })()}

            <div className='pt-8 space-y-2'>
              <h5 className='text-13 font-semibold text-neutral-800'>Taxonomy</h5>
              <div>
                <span className='font-medium'>Scientific name:</span> {detection?.taxon?.scientificName ?? '—'}
              </div>
              <div>
                <span className='font-medium'>Taxon ID:</span> {detection?.taxon?.taxonID ?? '—'}
              </div>
              <div className='flex items-center gap-8'>
                <span className='font-medium'>Rank:</span>
                {detection?.taxon?.taxonRank ? <TaxonRankBadge rank={detection?.taxon?.taxonRank} /> : '—'}
              </div>
              <div>
                <span className='font-medium'>Kingdom:</span> {detection?.taxon?.kingdom ?? '—'}
              </div>
              <div>
                <span className='font-medium'>Phylum:</span> {detection?.taxon?.phylum ?? '—'}
              </div>
              <div>
                <span className='font-medium'>Class:</span> {detection?.taxon?.class ?? '—'}
              </div>
              <div>
                <span className='font-medium'>Order:</span> {detection?.taxon?.order ?? '—'}
              </div>
              <div>
                <span className='font-medium'>Family:</span> {detection?.taxon?.family ?? '—'}
              </div>
              <div>
                <span className='font-medium'>Genus:</span> {detection?.taxon?.genus ?? '—'}
              </div>
              <div>
                <span className='font-medium'>Species:</span> {detection?.taxon?.species ?? '—'}
              </div>
              {typeof detection?.morphospecies === 'string' && detection.morphospecies ? (
                <div className='pt-4'>
                  <div>
                    <span className='font-medium'>Morphospecies:</span> {detection.morphospecies}
                  </div>
                  {morphospeciesLink ? (
                    <div className='mt-2'>
                      <a href={morphospeciesLink} target='_blank' rel='noreferrer' className='text-12 text-blue-600 hover:underline'>
                        View link
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className='space-y-4'>
            <h4 className='text-14 font-semibold text-neutral-800'>Links</h4>
            <div>
              <span className='font-medium'>Night:</span> {patch?.leafGroupId ?? '—'}
            </div>
            <div>
              <span className='font-medium'>Photo:</span> {patch?.photoId ?? '—'}
            </div>
            <div>
              <span className='font-medium'>Patch:</span> {patch?.name ?? '—'}
            </div>
            {patch?.originalBotDetectionPath ? (
              <div className='break-all'>
                <span className='font-medium'>Source data file:</span> {patch.originalBotDetectionPath}
              </div>
            ) : null}
            {(() => {
              const lat = patch?.latitude || botData?.latitude
              const lon = patch?.longitude || botData?.longitude
              if (!lat && !lon) return null
              return (
                <div className='pt-8 space-y-2'>
                  <h5 className='text-13 font-semibold text-neutral-800'>Location</h5>
                  {lat ? <div><span className='font-medium'>Latitude:</span> {lat}</div> : null}
                  {lon ? <div><span className='font-medium'>Longitude:</span> {lon}</div> : null}
                </div>
              )
            })()}
          </div>
        </div>

        <IdentifyDialog open={identifyOpen} onOpenChange={setIdentifyOpen} onSubmit={onIdentifySubmit} datasetId={projectId} />
      </DialogContent>
    </Dialog>
  )
}

function PatchDetails(props: { patch?: PatchEntity; detection?: DetectionEntity }) {
  const { patch, detection } = props

  const patchUrl = useObjectUrl(patch?.imageFile?.file, makeIndexedFileHandle(patch?.imageFile))

  const finestTaxonLevel = detection ? deriveTaxonNameFromDetection({ detection }) : undefined
  const patchAlt = finestTaxonLevel ?? patch?.name ?? 'patch'
  const originalDownloadName = resolvePatchOriginalDownloadName(patch)
  const fileMeta = usePatchFileMeta(patch)
  const [pixelSize, setPixelSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => setPixelSize(null), [patch?.id])

  return (
    <div className='space-y-8'>
      <PatchDownloadContextMenu
        file={patch?.imageFile?.file}
        handle={makeIndexedFileHandle(patch?.imageFile)}
        originalUrl={patchUrl}
        originalDownloadName={originalDownloadName}
      >
        <div className='w-full'>
          {patchUrl ? (
            <img
              src={patchUrl}
              alt={patchAlt}
              className='w-full max-h-[300px] object-contain rounded-md border border-black/10'
              onLoad={(e) => setPixelSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
          ) : (
            <div className='w-full h-[300px] rounded-md border border-black/10 bg-neutral-50' />
          )}
        </div>
      </PatchDownloadContextMenu>
      <div className='flex flex-wrap gap-8'>
        {patchUrl ? (
          <a href={patchUrl} target='_blank' rel='noreferrer'>
            <Button size='xsm' variant='outline'>
              Open patch
            </Button>
          </a>
        ) : null}
        <Button size='xsm' variant='outline' onClick={() => copyToClipboard(patch?.imageFile?.path)}>
          Copy patch path
        </Button>
      </div>

      <div className='text-12 text-neutral-700 break-all mt-12'>
        <span className='font-medium'>File path:</span> {patch?.imageFile?.path ?? '—'}
      </div>

      <div className='text-12 text-neutral-700 break-all'>
        <span className='font-medium'>Patch ID:</span> {patch?.id}
      </div>

      <PatchFileDetails patch={patch} detection={detection} fileMeta={fileMeta} pixelSize={pixelSize} />
    </div>
  )
}

type PatchFileMeta = { size: number; type: string; lastModified: number }

/** Size, type and modified date of the patch's image file (loaded from disk if needed). */
function usePatchFileMeta(patch?: PatchEntity): PatchFileMeta | null {
  const [meta, setMeta] = useState<PatchFileMeta | null>(null)
  useEffect(() => {
    setMeta(null)
    let cancelled = false
    const toMeta = (f: File) => ({ size: f.size, type: f.type, lastModified: f.lastModified })
    if (patch?.imageFile?.file) {
      setMeta(toMeta(patch.imageFile.file))
      return
    }
    const handle = makeIndexedFileHandle(patch?.imageFile) as { getFile?: () => Promise<File> } | undefined
    handle?.getFile?.()
      .then((f) => { if (!cancelled && f) setMeta(toMeta(f)) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one lookup per patch
  }, [patch?.id])
  return meta
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** Width x height (px) and rotation of the detection box in the source photo, from its 4 corners. */
function boxGeometry(points?: number[][]) {
  if (!Array.isArray(points) || points.length < 4) return null
  const side = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1])
  const s1 = side(points[0], points[1])
  const s2 = side(points[1], points[2])
  const [long, from, to] = s1 >= s2 ? [s1, points[0], points[1]] : [s2, points[1], points[2]]
  const angle = ((Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI + 180) % 180
  return { w: Math.round(long), h: Math.round(Math.min(s1, s2)), angle: Math.round(angle) }
}

function PatchFileDetails(props: {
  patch?: PatchEntity
  detection?: DetectionEntity
  fileMeta: PatchFileMeta | null
  pixelSize: { w: number; h: number } | null
}) {
  const { patch, detection, fileMeta, pixelSize } = props
  const box = boxGeometry(detection?.points)
  const rows: Array<[string, string]> = []
  if (pixelSize) rows.push(['Dimensions', `${pixelSize.w} × ${pixelSize.h} px`])
  if (fileMeta) {
    rows.push(['File size', formatBytes(fileMeta.size)])
    if (fileMeta.type) rows.push(['File type', fileMeta.type.replace('image/', '').toUpperCase()])
    if (fileMeta.lastModified) rows.push(['File modified', new Date(fileMeta.lastModified).toLocaleString()])
  }
  if (patch?.capturedAt) rows.push(['Captured', patch.capturedAt])
  if (patch?.detectorId) rows.push(['Detector', patch.detectorId])
  if (box) rows.push(['Box in photo', `${box.w} × ${box.h} px${box.angle ? `, rotated ${box.angle}°` : ''}`])
  if (typeof detection?.clusterId === 'number') rows.push(['Cluster', String(detection.clusterId)])
  if (!rows.length) return null
  return (
    <div className='mt-8 space-y-2 text-12 text-neutral-700'>
      <div className='font-medium text-neutral-800'>File details</div>
      {rows.map(([label, value]) => (
        <div key={label} className='break-all'>
          <span className='font-medium'>{label}:</span> {value}
        </div>
      ))}
    </div>
  )
}

function SourcePhoto(props: { photo?: PhotoEntity; detection?: DetectionEntity }) {
  const { photo, detection } = props

  const photoUrl = useObjectUrl(photo?.imageFile?.file, makeIndexedFileHandle(photo?.imageFile))
  const hasPhotoRecord = !!photo
  const sourceUnavailable = hasPhotoRecord && !photoUrl

  // Natural pixel size of the source photo — the detection's points are in that
  // same coordinate space, so it doubles as the SVG viewBox.
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => { setNaturalSize(null) }, [photoUrl])

  const polygonPoints = useMemo(
    () => buildDetectionPolygonPoints({ points: detection?.points }),
    [detection?.points],
  )
  const showOverlay = !!photoUrl && !!polygonPoints && !!naturalSize

  return (
    <div className='space-y-8'>
      {/* `relative` so the overlay can sit exactly on the image's layout box. */}
      <div className='relative'>
        <ImageWithDownloadName
          src={photoUrl}
          alt={photo?.name ?? 'photo'}
          downloadName={photo?.name ?? undefined}
          className='w-full max-h-[300px] object-contain rounded-md border border-black/10'
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
            }
          }}
          fallback={
            <div className='w-full h-[300px] rounded-md border border-black/10 bg-neutral-50 flex items-center justify-center p-16 text-center'>
              <p className='text-13 text-neutral-500'>
                {sourceUnavailable
                  ? 'Source image was not found in this dataset. It may only have been shared with the processed data, without the original source photos.'
                  : 'No source photo linked to this patch.'}
              </p>
            </div>
          }
        />
        {showOverlay ? (
          /*
           * `preserveAspectRatio="xMidYMid meet"` letterboxes the viewBox exactly
           * the way `object-contain` letterboxes the photo, so points given in
           * original-image pixels land in the right place at any rendered size.
           */
          <svg
            className='pointer-events-none absolute inset-0 h-full w-full'
            viewBox={`0 0 ${naturalSize!.width} ${naturalSize!.height}`}
            preserveAspectRatio='xMidYMid meet'
            aria-hidden='true'
          >
            {/* Dark halo underneath keeps the outline readable on pale backgrounds. */}
            <polygon
              points={polygonPoints!}
              fill='none'
              stroke='rgba(0,0,0,0.55)'
              strokeWidth={4}
              vectorEffect='non-scaling-stroke'
            />
            <polygon
              points={polygonPoints!}
              fill='rgba(236,72,153,0.18)'
              stroke='#ec4899'
              strokeWidth={2}
              vectorEffect='non-scaling-stroke'
            />
          </svg>
        ) : null}
      </div>
      {showOverlay ? (
        <p className='text-11 text-neutral-500'>
          <span className='inline-block h-8 w-8 rounded-sm border border-[#ec4899] bg-[#ec4899]/20 align-middle mr-4' />
          Pink outline shows where this patch was cropped from.
        </p>
      ) : null}
      <div className='flex flex-wrap gap-8'>
        {photoUrl ? (
          <a href={photoUrl} target='_blank' rel='noreferrer'>
            <Button size='xsm' variant='outline'>
              Open photo
            </Button>
          </a>
        ) : null}
        <Button size='xsm' variant='outline' disabled={!photo?.imageFile?.path} onClick={() => copyToClipboard(photo?.imageFile?.path)}>
          Copy photo path
        </Button>
      </div>
      <div className='text-12 text-neutral-700 break-all mt-12'>
        <div>
          <span className='font-medium'>Photo ID:</span> {photo?.id}
        </div>
        <div className='mt-4'>
          <span className='font-medium'>File path:</span>{' '}
          {photo?.imageFile?.path ?? (sourceUnavailable ? 'Not available in this dataset' : '—')}
        </div>
      </div>
    </div>
  )
}

/** Blurriness from Mothbot Process: the imported score, else the one in the detection JSON. */
function BlurDetails(props: { blurScore?: number; botData?: BotDetectionData | null }) {
  const { blurScore, botData } = props
  if (typeof blurScore !== 'number') return null
  const { blurHomogeneous: homogeneous, blurMotion: motion, blurWinner: winner, blurType: type, blurDirectionRatio: ratio } = botData ?? {}
  const part = (label: string, value: number | undefined, key: string) =>
    typeof value === 'number' ? (
      <span className={winner === key ? 'font-medium text-neutral-700' : undefined}>
        {label} {value.toFixed(1)}
      </span>
    ) : null
  return (
    <div title={botData?.blurMethod ? `Method: ${botData.blurMethod}` : undefined}>
      <div>
        <span className='font-medium'>Blurriness:</span> {blurScore.toFixed(1)}
        <span className='text-neutral-500'> / 100</span>
        {type ? <span className='text-neutral-500'> · {type === 'motion' ? 'looks like motion blur' : 'looks like homogeneous blur'}</span> : null}
      </div>
      {typeof homogeneous === 'number' || typeof motion === 'number' ? (
        <div className='text-neutral-500' title='The score is the larger of the two parts (shown in bold). Direction ratio: fine detail in the strongest vs the weakest direction; 3 or more suggests motion.'>
          {part('homogeneous', homogeneous, 'homogeneous')}
          {' · '}
          {part('motion', motion, 'motion')}
          {typeof ratio === 'number' ? ` · direction ratio ${ratio.toFixed(1)}` : null}
        </div>
      ) : null}
    </div>
  )
}

type BotDetectionData = {
  pixelMassPixels?: number
  pixelMassMm2?: number
  blurScore?: number
  /** Process's two blur parts (0-100), which one set the score, and the likely kind of blur. */
  blurHomogeneous?: number
  blurMotion?: number
  blurWinner?: string
  blurType?: string
  blurDirectionRatio?: number
  blurMethod?: string
  latitude?: string
  longitude?: string
}

function useBotDetectionData(patch?: PatchEntity): BotDetectionData | null {
  const [data, setData] = useState<BotDetectionData | null>(null)

  useEffect(() => {
    setData(null)
    const parentDir = patch?.imageFile?.parentDir as
      | { getFileHandle?: (name: string) => Promise<{ getFile: () => Promise<File> }> }
      | undefined
    const jsonName = patch?.botDetectionJsonName
    const patchFileName = patch?.imageFile?.name

    if (!parentDir?.getFileHandle || !jsonName || !patchFileName) return

    let cancelled = false
    parentDir.getFileHandle(jsonName)
      .then((h) => h.getFile())
      .then((f) => f.text())
      .then((text) => {
        if (cancelled) return
        const json = JSON.parse(text) as {
          latitude?: string
          longitude?: string
          shapes?: Array<{
            patch_path?: string
            pixel_mass_pixels?: number
            pixel_mass_mm2?: number
            blur_score?: number
            blur_homogeneous?: number
            blur_motion?: number
            blur_winner?: string
            blur_type?: string
            blur_direction_ratio?: number
            blur_method?: string
          }>
        }
        const shape = json.shapes?.find((s) => s.patch_path === patchFileName)
        const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
        const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
        setData({
          pixelMassPixels: shape?.pixel_mass_pixels,
          pixelMassMm2: shape?.pixel_mass_mm2,
          blurScore: num(shape?.blur_score),
          blurHomogeneous: num(shape?.blur_homogeneous),
          blurMotion: num(shape?.blur_motion),
          blurWinner: str(shape?.blur_winner),
          blurType: str(shape?.blur_type),
          blurDirectionRatio: num(shape?.blur_direction_ratio),
          blurMethod: str(shape?.blur_method),
          latitude: json.latitude,
          longitude: json.longitude,
        })
      })
      .catch(() => { if (!cancelled) setData(null) })

    return () => { cancelled = true }
  }, [patch?.id, patch?.botDetectionJsonName, patch?.imageFile?.parentDir, patch?.imageFile?.name])

  return data
}

function NobgImage(props: { patch?: PatchEntity; detection?: DetectionEntity; botData?: BotDetectionData | null }) {
  const { patch, detection, botData } = props
  const [nobgUrl, setNobgUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const revokeRef = useRef<string | null>(null)

  useEffect(() => {
    setNobgUrl(null)
    setLoading(true)

    const parentDir = patch?.imageFile?.parentDir as
      | { getFileHandle?: (name: string) => Promise<{ getFile: () => Promise<File> }> }
      | undefined
    const patchName = patch?.imageFile?.name

    if (!parentDir?.getFileHandle || !patchName) {
      setLoading(false)
      return
    }

    const nobgName = patchName.replace(/\.jpg$/i, '_nobg.png')
    let cancelled = false

    parentDir.getFileHandle(nobgName)
      .then((handle) => handle.getFile())
      .then((file) => {
        if (cancelled) return
        const url = URL.createObjectURL(file)
        if (revokeRef.current) URL.revokeObjectURL(revokeRef.current)
        revokeRef.current = url
        setNobgUrl(url)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current)
        revokeRef.current = null
      }
    }
  }, [patch?.id, patch?.imageFile?.parentDir, patch?.imageFile?.name])

  const pixelMassPixels = botData?.pixelMassPixels ?? detection?.pixelMassPixels
  const pixelMassMm2 = botData?.pixelMassMm2 ?? detection?.pixelMassMm2

  return (
    <div className='space-y-8'>
      {loading ? (
        <div className='w-full h-[300px] rounded-md border border-black/10 bg-neutral-50 animate-pulse' />
      ) : nobgUrl ? (
        <img
          src={nobgUrl}
          alt='background removed'
          className='w-full max-h-[300px] object-contain rounded-md border border-black/10'
          style={{ background: 'repeating-conic-gradient(#e0e0e0 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px' }}
        />
      ) : (
        <div className='w-full h-[300px] rounded-md border border-black/10 bg-neutral-50 flex items-center justify-center p-16 text-center'>
          <p className='text-13 text-neutral-400'>Background-removed image not found in this folder.</p>
        </div>
      )}
      <div className='flex flex-wrap gap-8'>
        {nobgUrl ? (
          <a href={nobgUrl} target='_blank' rel='noreferrer'>
            <Button size='xsm' variant='outline'>Open nobg image</Button>
          </a>
        ) : null}
      </div>
      <div className='text-12 text-neutral-700 space-y-2 mt-12'>
        {pixelMassPixels != null ? (
          <div><span className='font-medium'>Foreground pixels:</span> {pixelMassPixels.toLocaleString()}</div>
        ) : null}
        {pixelMassMm2 != null ? (
          <div><span className='font-medium'>Pixel area:</span> {pixelMassMm2.toFixed(4)} mm²</div>
        ) : null}
        {pixelMassMm2 == null && pixelMassPixels != null ? (
          <div className='text-neutral-500 text-11'>No calibration — mm² unavailable</div>
        ) : null}
      </div>
    </div>
  )
}

function copyToClipboard(text?: string) {
  const value = (text ?? '').trim()
  if (!value) return
  void navigator?.clipboard?.writeText?.(value)
}


/**
 * Picks a safe download filename for "Download original". `patch.name` is
 * just the bare patch ID with no extension — and that ID itself often
 * contains a model filename segment ending in `.pt` (e.g.
 * "..._b1_2024-01-18.pt"), so using it directly as a filename makes the
 * browser/OS treat `.pt` as the extension and silently drop the real
 * `.jpg`. Prefer the actual indexed file's path (which has the real
 * extension) when available, and only fall back to the patch ID — with a
 * forced `.jpg` — when no file path is known.
 */
function resolvePatchOriginalDownloadName(patch?: PatchEntity): string {
  const filePath = patch?.imageFile?.path?.trim()
  if (filePath) {
    const basename = filePath.replaceAll('\\', '/').split('/').pop()
    if (basename) return basename
  }

  const fallbackBase = (patch?.name ?? 'patch').replace(/\.(pt|pth|onnx)$/i, '')
  return `${fallbackBase}.jpg`
}
