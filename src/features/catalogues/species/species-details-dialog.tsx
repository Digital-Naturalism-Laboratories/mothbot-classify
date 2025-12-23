import { PropsWithChildren, ReactNode, useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { nightsStore } from '~/stores/entities/4.nights'
import { detectionsStore } from '~/stores/entities/detections'
import { useObjectUrl } from '~/utils/use-object-url'
import { aggregateTaxonomyFromDetections } from '~/models/taxonomy/extract'
import { ImageWithDownloadName } from '~/components/atomic/image-with-download-name'
import { usePreviewFile } from '~/features/catalogues/shared/use-preview-file'
import { TaxonomyDisplay, UsageStatsDisplay, ProjectsListDisplay, NightsListDisplay } from '~/features/catalogues/shared/details-common'

export type SpeciesDetailsDialogProps = PropsWithChildren<{
  speciesName: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}> & { trigger?: ReactNode }

export function SpeciesDetailsDialog(props: SpeciesDetailsDialogProps) {
  const { speciesName, children, open, onOpenChange } = props
  const nights = useStore(nightsStore)
  const patches = useStore(patchesStore)
  const patchMapByNight = useStore(patchFileMapByNightStore)
  const allDetections = useStore(detectionsStore)

  const usage = useMemo(() => {
    const nightIds = new Set<string>()
    const projectIds = new Set<string>()
    const previewPairs: Array<{ nightId: string; patchId: string }> = []

    for (const d of Object.values(allDetections ?? {})) {
      const det = d as any
      if (det?.detectedBy !== 'user') continue
      if (det?.morphospecies) continue
      const detSpecies = det?.taxon?.species as string | undefined
      if (!detSpecies || String(detSpecies).trim() !== speciesName) continue

      const nightId = det?.nightId as string | undefined
      if (nightId) {
        nightIds.add(nightId)
        const projectId = (nights?.[nightId] as any)?.projectId
        if (projectId) projectIds.add(projectId)
        if (det?.patchId && !previewPairs.find((p) => p.nightId === nightId)) {
          previewPairs.push({ nightId, patchId: String(det.patchId) })
        }
      }
    }

    return { nightIds: Array.from(nightIds), projectIds: Array.from(projectIds), previewPairs }
  }, [allDetections, nights, speciesName])

  const taxonomy = useMemo(() => {
    const speciesDetections = Object.values(allDetections ?? {}).filter((d) => {
      const det = d as any
      if (det?.detectedBy !== 'user') return false
      if (det?.morphospecies) return false
      const detSpecies = det?.taxon?.species as string | undefined
      return detSpecies && String(detSpecies).trim() === speciesName
    })

    if (!speciesDetections.length) return null

    const aggregatedTaxonomy = aggregateTaxonomyFromDetections({ detections: speciesDetections })
    return aggregatedTaxonomy
  }, [allDetections, speciesName])

  const previewFile = usePreviewFile({ previewPairs: usage.previewPairs })
  const previewUrl = useObjectUrl(previewFile)

  const matchingInfo = useMemo(() => {
    const detectionIds: string[] = []
    const nightIds = new Set<string>()

    for (const [id, detection] of Object.entries(allDetections ?? {})) {
      const det = detection as any
      if (det?.detectedBy !== 'user') continue
      if (det?.morphospecies) continue
      const detSpecies = det?.taxon?.species as string | undefined
      if (!detSpecies || String(detSpecies).trim() !== speciesName) continue

      detectionIds.push(id)
      if (det?.nightId) nightIds.add(det.nightId)
    }

    return { detectionIds, nightIds }
  }, [allDetections, speciesName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent align='max'>
        <DialogTitle>Species: {speciesName}</DialogTitle>

        <div className='mt-8'>
          <ImageWithDownloadName src={previewUrl} alt={speciesName} downloadName={speciesName} className='max-h-[240px] rounded border' />
        </div>

        <UsageStatsDisplay
          projectCount={usage.projectIds.length}
          nightCount={usage.nightIds.length}
          instanceCount={matchingInfo.detectionIds.length}
        />

        {taxonomy ? <TaxonomyDisplay taxonomy={taxonomy} /> : null}

        <ProjectsListDisplay projectIds={usage.projectIds} />

        <NightsListDisplay nightIds={usage.nightIds} />
      </DialogContent>
    </Dialog>
  )
}

