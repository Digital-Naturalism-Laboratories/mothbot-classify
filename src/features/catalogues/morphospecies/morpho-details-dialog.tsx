import { PropsWithChildren, ReactNode, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { bulkIdentifyMorphospecies, detectionsStore, findMorphoUsageByKey } from '~/stores/entities/detections'
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
import { buildMorphoBulkIdentifyConfirmText, buildMorphoBulkIdentifySuccessText } from './morpho-bulk-identify-copy'
import { buildFallbackPreviewPairs, buildSummaryPreviewPairs, selectMorphoPreviewPairs } from './morpho-preview'
import { resolveDatasetId } from '~/features/mothbox-next/dataset-scope'

export type MorphoSpeciesDetailsDialogProps = PropsWithChildren<{
  morphoKey: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onNavigate?: () => void
}> & { trigger?: ReactNode }

export function MorphoSpeciesDetailsDialog(props: MorphoSpeciesDetailsDialogProps) {
  const { morphoKey, children, open, onOpenChange, onNavigate } = props
  const summaries = useStore(leafGroupSummariesStore)
  const nights = useStore(leafGroupsStore)
  const covers = useStore(morphoCoversStore)
  const allDetections = useStore(detectionsStore)
  const normalizedMorphoKey = useMemo(() => normalizeMorphoKey(morphoKey), [morphoKey])

  const [identifyDialogOpen, setIdentifyDialogOpen] = useState(false)
  const { setConfirmDialog } = useConfirmDialog()

  const usage = useMemo(() => {
    const leafGroupIds: string[] = []
    const projectIds = new Set<string>()
    const summaryPreviewPairs = buildSummaryPreviewPairs({ morphoKey, summaries, nights, covers })
    const fallbackPreviewPairs = buildFallbackPreviewPairs({ morphoKey, detections: allDetections })
    const previewPairs = selectMorphoPreviewPairs({ summaryPreviewPairs, fallbackPreviewPairs })

    for (const [leafGroupId, summary] of Object.entries(summaries ?? {})) {
      const count = summary?.morphoCounts?.[normalizedMorphoKey]
      if (!count) continue
      leafGroupIds.push(leafGroupId)
      const projectId = resolveDatasetId(nights?.[leafGroupId])
      if (projectId) projectIds.add(projectId)
    }
    return { leafGroupIds, projectIds: Array.from(projectIds), previewPairs }
  }, [summaries, nights, morphoKey, normalizedMorphoKey, covers, allDetections])

  const taxonomy = useMemo(() => {
    const morphoDetections = Object.values(allDetections ?? {}).filter((d) => {
      const morpho = typeof d?.morphospecies === 'string' ? d.morphospecies : ''
      return normalizeMorphoKey(morpho) === normalizedMorphoKey && d?.detectedBy === 'user'
    })

    if (!morphoDetections.length) return null

    const aggregatedTaxonomy = aggregateTaxonomyFromDetections({ detections: morphoDetections })
    return aggregatedTaxonomy
  }, [allDetections, normalizedMorphoKey])

  const previewFile = usePreviewFile({ previewPairs: usage.previewPairs })
  const previewUrl = useObjectUrl(previewFile)

  const usageSummary = useMemo(() => {
    return findMorphoUsageByKey({ morphoKey })
  }, [morphoKey, allDetections, summaries])

  const primaryProjectId = useMemo(() => {
    return usage.projectIds?.[0]
  }, [usage.projectIds])

  function handleIdentifyDialogSubmit(label: string, taxon?: TaxonRecord) {
    if (!taxon) {
      toast.error('Please select a species or higher taxon to identify this morphospecies')
      return
    }

    const count = usageSummary.instanceCount
    const leafGroupCount = usageSummary.leafGroupIds.size
    const projectCount = usageSummary.projectIds.size

    if (count === 0) {
      toast.warning('No instances of this morphospecies found')
      return
    }

    setConfirmDialog({
      content: buildMorphoBulkIdentifyConfirmText({ count, leafGroupCount, projectCount }),
      confirmText: 'Update All',
      onConfirm: () => {
        void executeBulkIdentification({ taxon })
      },
      closeAfterConfirm: true,
    })
  }

  async function executeBulkIdentification(params: { taxon: TaxonRecord }) {
    const { taxon } = params

    const result = await bulkIdentifyMorphospecies({ morphoKey, taxon })

    if (result.updatedCount > 0) {
      toast.success(buildMorphoBulkIdentifySuccessText({ count: result.updatedCount, leafGroupCount: result.leafGroupCount, projectCount: result.projectCount }))
      onOpenChange?.(false)
    } else {
      toast.warning('No instances were updated')
    }
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
          nightCount={usage.leafGroupIds.length}
          instanceCount={usageSummary.instanceCount}
        />

        {taxonomy ? <TaxonomyDisplay taxonomy={taxonomy} /> : null}

        <ProjectsListDisplay projectIds={usage.projectIds} />

        <NightsListDisplay
          leafGroupIds={usage.leafGroupIds}
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
          datasetId={primaryProjectId}
        />
      </DialogContent>
    </Dialog>
  )
}
