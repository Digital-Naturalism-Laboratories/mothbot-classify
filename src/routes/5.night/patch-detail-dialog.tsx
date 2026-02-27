import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'
import { TaxonRankBadge } from '~/components/taxon-rank-badge'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { detectionStoreById, labelDetections, type DetectionEntity } from '~/stores/entities/detections'
import { patchStoreById } from '~/stores/entities/patch-selectors'
import { photosStore } from '~/stores/entities/photos'
import type { PatchEntity } from '~/stores/entities/5.patches'
import type { PhotoEntity } from '~/stores/entities/photos'
import { useObjectUrl } from '~/utils/use-object-url'
import type { TaxonRecord } from '~/features/data-flow/2.identify/species-list.store'
import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { morphoLinksStore } from '~/features/data-flow/3.persist/links'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { deriveTaxonNameFromDetection } from '~/models/taxonomy/extract'
import { getProjectIdFromNightId } from '~/utils/paths'
import { ImageWithDownloadName } from '~/components/atomic/image-with-download-name'

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

  const projectId = useMemo(() => getProjectIdFromNightId(patch?.nightId), [patch?.nightId])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent align='vhSide' className='max-w-[900px]'>
        <DialogHeader className='grid grid-cols-2 gap-8 mb-8'>
          <DialogTitle>Patch details</DialogTitle>
          <DialogTitle>Source Photo</DialogTitle>
        </DialogHeader>

        <div className='grid grid-cols-1 gap-12 md:grid-cols-2'>
          <PatchDetails patch={patch} detection={detection} />
          <SourcePhoto photo={photo} />
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
              <span className='font-medium'>Night:</span> {patch?.nightId ?? '—'}
            </div>
            <div>
              <span className='font-medium'>Photo:</span> {patch?.photoId ?? '—'}
            </div>
            <div>
              <span className='font-medium'>Patch:</span> {patch?.name ?? '—'}
            </div>
          </div>
        </div>

        <IdentifyDialog open={identifyOpen} onOpenChange={setIdentifyOpen} onSubmit={onIdentifySubmit} projectId={projectId} />
      </DialogContent>
    </Dialog>
  )
}

function PatchDetails(props: { patch?: PatchEntity; detection?: DetectionEntity }) {
  const { patch, detection } = props

  const patchUrl = useObjectUrl(patch?.imageFile?.file, patch?.imageFile?.handle)

  const finestTaxonLevel = detection ? deriveTaxonNameFromDetection({ detection }) : undefined

  return (
    <div className='space-y-8'>
      <ImageWithDownloadName
        src={patchUrl}
        alt={finestTaxonLevel ?? patch?.name ?? 'patch'}
        downloadName={finestTaxonLevel ?? patch?.name ?? undefined}
        className='w-full max-h-[300px] object-contain rounded-md border border-black/10'
        fallback={<div className='w-full h-[300px] rounded-md border border-black/10 bg-neutral-50' />}
      />
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
    </div>
  )
}

function SourcePhoto(props: { photo?: PhotoEntity }) {
  const { photo } = props

  const photoUrl = useObjectUrl(photo?.imageFile?.file, photo?.imageFile?.handle)

  return (
    <div className='space-y-8'>
      <ImageWithDownloadName
        src={photoUrl}
        alt={photo?.name ?? 'photo'}
        downloadName={photo?.name ?? undefined}
        className='w-full max-h-[300px] object-contain rounded-md border border-black/10'
        fallback={<div className='w-full h-[300px] rounded-md border border-black/10 bg-neutral-50' />}
      />
      <div className='flex flex-wrap gap-8'>
        {photoUrl ? (
          <a href={photoUrl} target='_blank' rel='noreferrer'>
            <Button size='xsm' variant='outline'>
              Open photo
            </Button>
          </a>
        ) : null}
        <Button size='xsm' variant='outline' onClick={() => copyToClipboard(photo?.imageFile?.path)}>
          Copy photo path
        </Button>
      </div>
      <div className='text-12 text-neutral-700 break-all mt-12'>
        <div>
          <span className='font-medium'>Photo ID:</span> {photo?.id}
        </div>
        <div className='mt-4'>
          <span className='font-medium'>File path:</span> {photo?.imageFile?.path ?? '—'}
        </div>
      </div>
    </div>
  )
}

function copyToClipboard(text?: string) {
  const value = (text ?? '').trim()
  if (!value) return
  void navigator?.clipboard?.writeText?.(value)
}
