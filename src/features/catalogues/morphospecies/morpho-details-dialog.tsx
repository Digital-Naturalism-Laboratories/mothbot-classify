import { PropsWithChildren, ReactNode, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import { nightsStore } from '~/stores/entities/4.nights'
import { detectionsStore, findDetectionsByMorphoKey, bulkIdentifyMorphospecies } from '~/stores/entities/detections'
import { useObjectUrl } from '~/utils/use-object-url'
import { morphoCoversStore } from '~/features/data-flow/3.persist/covers'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { Button } from '~/components/ui/button'
import { aggregateTaxonomyFromDetections } from '~/models/taxonomy/extract'
import { ImageWithDownloadName } from '~/components/atomic/image-with-download-name'
import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { useConfirmDialog } from '~/components/dialogs/ConfirmDialog'
import { toast } from 'sonner'
import type { TaxonRecord } from '~/models/taxonomy/types'
import { usePreviewFile } from '~/features/catalogues/shared/use-preview-file'
import { TaxonomyDisplay, UsageStatsDisplay, ProjectsListDisplay, NightsListDisplay } from '~/features/catalogues/shared/details-common'

export type MorphoSpeciesDetailsDialogProps = PropsWithChildren<{
  morphoKey: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onNavigate?: () => void
}> & { trigger?: ReactNode }

export function MorphoSpeciesDetailsDialog(props: MorphoSpeciesDetailsDialogProps) {
  const { morphoKey, children, open, onOpenChange, onNavigate } = props
  const summaries = useStore(nightSummariesStore)
  const nights = useStore(nightsStore)
  const covers = useStore(morphoCoversStore)
  const allDetections = useStore(detectionsStore)

  const [identifyDialogOpen, setIdentifyDialogOpen] = useState(false)
  const [pendingTaxon, setPendingTaxon] = useState<{ label: string; taxon?: TaxonRecord } | null>(null)
  const { setConfirmDialog } = useConfirmDialog()

  const usage = useMemo(() => {
    const nightIds: string[] = []
    const projectIds = new Set<string>()
    const previewPairs: Array<{ nightId: string; patchId: string }> = []

    const override = covers?.[normalizeMorphoKey(morphoKey)]
    if (override?.nightId && override?.patchId) previewPairs.push({ nightId: override.nightId, patchId: override.patchId })

    for (const [nightId, s] of Object.entries(summaries ?? {})) {
      const count = (s as any)?.morphoCounts?.[morphoKey]
      if (!count) continue
      nightIds.push(nightId)
      const projectId = (nights?.[nightId] as any)?.projectId
      if (projectId) projectIds.add(projectId)
      const previewId = (s as any)?.morphoPreviewPatchIds?.[morphoKey]
      if (previewId) previewPairs.push({ nightId, patchId: String(previewId) })
    }
    return { nightIds, projectIds: Array.from(projectIds), previewPairs }
  }, [summaries, nights, morphoKey, covers])

  const taxonomy = useMemo(() => {
    const morphoDetections = Object.values(allDetections ?? {}).filter((d) => {
      const morpho = typeof d?.morphospecies === 'string' ? d.morphospecies : ''
      return normalizeMorphoKey(morpho) === normalizeMorphoKey(morphoKey) && d?.detectedBy === 'user'
    })

    if (!morphoDetections.length) return null

    const aggregatedTaxonomy = aggregateTaxonomyFromDetections({ detections: morphoDetections })
    return aggregatedTaxonomy
  }, [allDetections, morphoKey])

  const previewFile = usePreviewFile({ previewPairs: usage.previewPairs })
  const previewUrl = useObjectUrl(previewFile)

  const matchingInfo = useMemo(() => {
    const result = findDetectionsByMorphoKey({ morphoKey })
    return result
  }, [morphoKey, allDetections])

  const primaryProjectId = useMemo(() => {
    return usage.projectIds?.[0]
  }, [usage.projectIds])

  function handleIdentifyDialogSubmit(label: string, taxon?: TaxonRecord) {
    if (!taxon) {
      toast.error('Please select a species or higher taxon to identify this morphospecies')
      return
    }

    setPendingTaxon({ label, taxon })

    const { detectionIds, nightIds } = matchingInfo
    const count = detectionIds.length
    const nightCount = nightIds.size

    if (count === 0) {
      toast.warning('No instances of this morphospecies found')
      return
    }

    setConfirmDialog({
      content: `Update ${count} instance${count !== 1 ? 's' : ''} across ${nightCount} night${nightCount !== 1 ? 's' : ''}?`,
      confirmText: 'Update All',
      onConfirm: () => {
        executeBulkIdentification({ taxon })
      },
      closeAfterConfirm: true,
    })
  }

  function executeBulkIdentification(params: { taxon: TaxonRecord }) {
    const { taxon } = params

    const result = bulkIdentifyMorphospecies({ morphoKey, taxon })

    if (result.updatedCount > 0) {
      toast.success(
        `✅ Updated ${result.updatedCount} instance${result.updatedCount !== 1 ? 's' : ''} across ${result.nightCount} night${
          result.nightCount !== 1 ? 's' : ''
        }`,
      )
      onOpenChange?.(false)
    } else {
      toast.warning('No instances were updated')
    }

    setPendingTaxon(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent align='max' className='w-[fit-content] max-w-4xl'>
        <DialogTitle>Morphospecies: {morphoKey}</DialogTitle>

        <div className='mt-8'>
          <ImageWithDownloadName src={previewUrl} alt={morphoKey} downloadName={morphoKey} className='max-h-[240px] rounded border' />
        </div>

        <div className='mt-12'>
          <Button variant='primary' size='sm' onClick={() => setIdentifyDialogOpen(true)}>
            Identify as Species
          </Button>
        </div>

        <UsageStatsDisplay
          projectCount={usage.projectIds.length}
          nightCount={usage.nightIds.length}
          instanceCount={matchingInfo.detectionIds.length}
        />

        {taxonomy ? <TaxonomyDisplay taxonomy={taxonomy} /> : null}

        <ProjectsListDisplay projectIds={usage.projectIds} />

        <NightsListDisplay
          nightIds={usage.nightIds}
          morphoKey={morphoKey}
          onNavigate={() => {
            onOpenChange?.(false)
            onNavigate?.()
          }}
        />

        <IdentifyDialog
          open={identifyDialogOpen}
          onOpenChange={setIdentifyDialogOpen}
          onSubmit={handleIdentifyDialogSubmit}
          projectId={primaryProjectId}
        />
      </DialogContent>
    </Dialog>
  )
}
