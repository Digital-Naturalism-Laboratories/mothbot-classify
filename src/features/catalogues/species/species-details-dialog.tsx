import { PropsWithChildren, ReactNode, useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { detectionsStore } from '~/stores/entities/detections'
import { useObjectUrl } from '~/utils/use-object-url'
import { ImageWithDownloadName } from '~/components/atomic/image-with-download-name'
import { usePreviewFile } from '~/features/catalogues/shared/use-preview-file'
import { TaxonomyDisplay, UsageStatsDisplay, ProjectsListDisplay, NightsListDisplay } from '~/features/catalogues/shared/details-common'
import { buildSpeciesTaxonomyIndex, buildSpeciesUsageSummary } from './species-data'

export type SpeciesDetailsDialogProps = PropsWithChildren<{
  speciesName: string
  allowedLeafGroupIds?: Set<string>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onNavigate?: () => void
}> & { trigger?: ReactNode }

export function SpeciesDetailsDialog(props: SpeciesDetailsDialogProps) {
  const { speciesName, allowedLeafGroupIds, children, open, onOpenChange, onNavigate } = props
  const summaries = useStore(leafGroupSummariesStore)
  const nights = useStore(leafGroupsStore)
  const allDetections = useStore(detectionsStore)

  const usage = useMemo(() => {
    return buildSpeciesUsageSummary({
      speciesName,
      summaries,
      nights,
      allowedLeafGroupIds,
      detections: allDetections,
    })
  }, [speciesName, summaries, nights, allowedLeafGroupIds, allDetections])

  const taxonomy = useMemo(() => {
    const taxonomyByName = buildSpeciesTaxonomyIndex({
      summaries,
      allowedLeafGroupIds,
      detections: allDetections,
    })
    return taxonomyByName.get(speciesName) || null
  }, [summaries, allowedLeafGroupIds, allDetections, speciesName])

  const previewFile = usePreviewFile({ previewPairs: usage.previewPairs })
  const previewUrl = useObjectUrl(previewFile)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent align='max' className='w-[fit-content] max-w-4xl'>
        <DialogTitle>Species: {speciesName}</DialogTitle>

        <div className='mt-8'>
          <ImageWithDownloadName src={previewUrl} alt={speciesName} downloadName={speciesName} className='max-h-[240px] rounded border' />
        </div>

        <UsageStatsDisplay projectCount={usage.projectIds.length} nightCount={usage.leafGroupIds.length} instanceCount={usage.instanceCount} />

        {taxonomy ? <TaxonomyDisplay taxonomy={taxonomy} /> : null}

        <ProjectsListDisplay projectIds={usage.projectIds} />

        <NightsListDisplay
          leafGroupIds={usage.leafGroupIds}
          onNavigate={() => {
            onOpenChange?.(false)
            onNavigate?.()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

