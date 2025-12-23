import { PropsWithChildren, ReactNode, useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import { nightsStore } from '~/stores/entities/4.nights'
import { detectionsStore, type DetectionEntity } from '~/stores/entities/detections'
import { useObjectUrl } from '~/utils/use-object-url'
import { aggregateTaxonomyFromDetections } from '~/models/taxonomy/extract'
import { ImageWithDownloadName } from '~/components/atomic/image-with-download-name'
import { usePreviewFile } from '~/features/catalogues/shared/use-preview-file'
import { TaxonomyDisplay, UsageStatsDisplay, ProjectsListDisplay, NightsListDisplay } from '~/features/catalogues/shared/details-common'
import { parseNightIdParts } from '~/features/catalogues/shared/catalog-utils'

export type SpeciesDetailsDialogProps = PropsWithChildren<{
  speciesName: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onNavigate?: () => void
}> & { trigger?: ReactNode }

export function SpeciesDetailsDialog(props: SpeciesDetailsDialogProps) {
  const { speciesName, children, open, onOpenChange, onNavigate } = props
  const summaries = useStore(nightSummariesStore)
  const nights = useStore(nightsStore)
  const allDetections = useStore(detectionsStore)

  const usage = useMemo(() => {
    const nightIds: string[] = []
    const projectIds = new Set<string>()
    const previewPairs: Array<{ nightId: string; patchId: string }> = []

    for (const det of Object.values(allDetections ?? {})) {
      if (det?.detectedBy !== 'user') continue
      if (det?.morphospecies) continue

      const detSpecies = det?.taxon?.species
      if (!detSpecies || String(detSpecies).trim() !== speciesName) continue

      if (det?.nightId) {
        if (!nightIds.includes(det.nightId)) {
          nightIds.push(det.nightId)
        }

        const night = nights?.[det.nightId]
        if (night?.projectId) {
          projectIds.add(night.projectId)
        }

        if (det?.patchId && previewPairs.length === 0) {
          previewPairs.push({ nightId: det.nightId, patchId: String(det.patchId) })
        }
      }
    }

    return { nightIds, projectIds: Array.from(projectIds), previewPairs }
  }, [allDetections, nights, speciesName])

  const taxonomy = useMemo(() => {
    const speciesDetections = Object.values(allDetections ?? {}).filter((det) => {
      if (det?.detectedBy !== 'user') return false
      if (det?.morphospecies) return false

      const detSpecies = det?.taxon?.species
      return detSpecies && String(detSpecies).trim() === speciesName
    })

    if (!speciesDetections.length) return null

    const aggregatedTaxonomy = aggregateTaxonomyFromDetections({ detections: speciesDetections })
    return aggregatedTaxonomy
  }, [allDetections, speciesName])

  const instanceCount = useMemo(() => {
    let count = 0

    for (const det of Object.values(allDetections ?? {})) {
      if (det?.detectedBy !== 'user') continue
      if (det?.morphospecies) continue

      const detSpecies = det?.taxon?.species
      if (detSpecies && String(detSpecies).trim() === speciesName) {
        count++
      }
    }

    return count
  }, [allDetections, speciesName])

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

        <UsageStatsDisplay projectCount={usage.projectIds.length} nightCount={usage.nightIds.length} instanceCount={instanceCount} />

        {taxonomy ? <TaxonomyDisplay taxonomy={taxonomy} /> : null}

        <ProjectsListDisplay projectIds={usage.projectIds} />

        <NightsListDisplay
          nightIds={usage.nightIds}
          onNavigate={() => {
            onOpenChange?.(false)
            onNavigate?.()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

