import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
import { detectionsStore } from '~/stores/entities/detections'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { useObjectUrl } from '~/utils/use-object-url'
import { SpeciesDetailsDialog } from './species-details-dialog'
import { Column, Row } from '~/styles'
import { ImageWithDownloadName } from '~/components/atomic/image-with-download-name'
import { TaxonomySection } from '~/features/left-panel/taxonomy-section'
import { CountsRow } from '~/features/left-panel/counts-row'
import { ScopeFilters, type ScopeType } from '~/features/catalogues/shared/scope-filters'
import { useCatalogScopeContext } from '~/features/catalogues/shared/catalog-scope-context'
import { usePreviewFile } from '~/features/catalogues/shared/use-preview-file'
import { buildSpeciesCatalogView } from './species-catalog-model'
import {
  buildSpeciesTaxonomyTree,
  filterSpeciesByTaxon,
  type SpeciesPreviewPair,
  type SpeciesTaxonSelection,
} from './species-data'

export type SpeciesCatalogDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectIdOverride?: string
  initialScope?: ScopeType
}

export function SpeciesCatalogDialog(props: SpeciesCatalogDialogProps) {
  const { open, onOpenChange, projectIdOverride, initialScope } = props
  const { projectId, siteId, deploymentId, leafGroupId, usageScope, setUsageScope, hasProject, hasSite, hasDeployment, hasNight } =
    useCatalogScopeContext({
      open,
      projectIdOverride,
      initialScope,
    })

  const summaries = useStore(leafGroupSummariesStore)
  const detections = useStore(detectionsStore)
  const nights = useStore(leafGroupsStore)

  const catalogView = useMemo(() => {
    return buildSpeciesCatalogView({
      summaries,
      detections,
      nights,
      usageScope,
      scope: { projectId, siteId, deploymentId, leafGroupId },
    })
  }, [summaries, detections, nights, usageScope, projectId, siteId, deploymentId, leafGroupId])

  const { scopeCounts, list, taxonomyByName, allowedLeafGroupIds } = catalogView

  const [selectedTaxon, setSelectedTaxon] = useState<SpeciesTaxonSelection | undefined>(undefined)

  const taxonomyTree = useMemo(() => {
    return buildSpeciesTaxonomyTree({ speciesList: list, taxonomyByName })
  }, [list, taxonomyByName])

  const filtered = useMemo(() => {
    return filterSpeciesByTaxon({ speciesList: list, selectedTaxon, taxonomyByName })
  }, [list, selectedTaxon, taxonomyByName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent align='vhSide' className='max-w-[1400px] col justify-start !p-0 gap-0 h-[90vh]'>
        <Column className='border-b p-16 gap-12 flex-shrink-0'>
          <Row className='items-center gap-20'>
            <h3 className='!text-16 font-medium'>Species</h3>
            <ScopeFilters
              scope={usageScope}
              onScopeChange={setUsageScope}
              hasProject={hasProject}
              hasSite={hasSite}
              hasDeployment={hasDeployment}
              hasNight={hasNight}
              counts={scopeCounts}
            />
          </Row>
        </Column>

        <Row className='flex-1 min-h-0 overflow-hidden gap-16'>
          <Column className='w-[300px] border-r overflow-y-auto px-16 py-20'>
            <CountsRow
              label='All species'
              count={scopeCounts[usageScope]}
              selected={!selectedTaxon}
              onSelect={() => {
                setSelectedTaxon(undefined)
              }}
            />
            <TaxonomySection
              title='Taxonomy'
              nodes={taxonomyTree}
              bucket='user'
              selectedTaxon={selectedTaxon}
              selectedBucket={selectedTaxon ? 'user' : undefined}
              onSelectTaxon={(params) => {
                setSelectedTaxon(params.taxon)
              }}
              emptyText='No taxonomy data'
              className='mt-16'
            />
          </Column>

          <Column className='flex-1 min-h-0 overflow-y-auto p-16'>
            {!filtered.length ? (
              <p className='text-sm text-neutral-500'>No species found.</p>
            ) : (
              <ul className='grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-12'>
                {filtered.map((it) => (
                  <SpeciesCard
                    key={it.speciesName}
                    speciesName={it.speciesName}
                    count={it.count}
                    previewPairs={it.previewPairs}
                    allowedLeafGroupIds={allowedLeafGroupIds}
                  />
                ))}
              </ul>
            )}
          </Column>
        </Row>
      </DialogContent>
    </Dialog>
  )
}

type SpeciesCardProps = {
  speciesName: string
  count: number
  previewPairs: SpeciesPreviewPair[]
  allowedLeafGroupIds?: Set<string>
}

function SpeciesCard(props: SpeciesCardProps) {
  const { speciesName, count, previewPairs, allowedLeafGroupIds } = props
  const previewUrl = useSpeciesPreviewUrl({ previewPairs })

  return (
    <li className='rounded-md border bg-white p-12'>
      <div className='-mt-12 -mx-12 mb-8'>
        <ImageWithDownloadName
          src={previewUrl}
          alt={speciesName}
          downloadName={speciesName}
          className='w-full h-[200px] object-contain rounded'
        />
      </div>
      <div className='flex items-center gap-8'>
        <span className='font-medium text-ink-primary truncate'>{speciesName}</span>
        <span className='ml-auto text-12 text-neutral-600'>{count}</span>
      </div>

      <Row className='mt-8 gap-4 justify-end'>
        <SpeciesDetailsDialog speciesName={speciesName} allowedLeafGroupIds={allowedLeafGroupIds}>
          <Button size='xsm'>View usage</Button>
        </SpeciesDetailsDialog>
      </Row>
    </li>
  )
}

function useSpeciesPreviewUrl(params: { previewPairs: SpeciesPreviewPair[] }) {
  const { previewPairs } = params
  const previewFile = usePreviewFile({ previewPairs })
  const previewUrl = useObjectUrl(previewFile)
  return previewUrl
}
