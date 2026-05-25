import { useStore } from '@nanostores/react'
import { useRouter } from '@tanstack/react-router'
import { EllipsisVertical } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { INaturalistLogo } from '~/assets/iNaturalist-logo'
import { ImageWithDownloadName } from '~/components/atomic/image-with-download-name'
import { closeGlobalDialog, openGlobalDialog } from '~/components/dialogs/global-dialog'
import { useConfirmDialog } from '~/components/dialogs/ConfirmDialog'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent } from '~/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { buildLeafGroupLinkParams, isSingleLeafHierarchy } from '~/features/mothbox-next/hierarchy-routes'
import { useCatalogScopeContext } from '~/features/catalogues/shared/catalog-scope-context'
import { getLabelForMorphoKey } from '~/features/catalogues/shared/details-common'
import { ScopeFilters, type ScopeType } from '~/features/catalogues/shared/scope-filters'
import { usePreviewFile } from '~/features/catalogues/shared/use-preview-file'
import { morphoCoversStore } from '~/features/data-flow/3.persist/covers'
import { morphoLinksStore, setMorphoLink } from '~/features/data-flow/3.persist/links'
import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { CountsRow } from '~/features/left-panel/counts-row'
import { TaxonomySection } from '~/features/left-panel/taxonomy-section'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import type { TaxonRecord } from '~/models/taxonomy/types'
import { leafGroupsStore, type LeafGroupEntity } from '~/stores/entities/leaf-groups'
import { bulkIdentifyMorphospecies, detectionsStore, findMorphoUsageByKey } from '~/stores/entities/detections'
import { leafGroupSummariesStore, type LeafGroupSummaryEntity } from '~/stores/entities/night-summaries'
import { Column, Row } from '~/styles'
import { useObjectUrl } from '~/utils/use-object-url'
import { buildMorphoBulkIdentifyConfirmText, buildMorphoBulkIdentifySuccessText } from './morpho-bulk-identify-copy'
import { MorphoSpeciesDetailsDialog } from './morpho-details-dialog'
import { buildFallbackPreviewPairs, buildSummaryPreviewPairs, selectMorphoPreviewPairs, type MorphoPreviewPair } from './morpho-preview'
import { buildMorphoCatalogView } from './morpho-catalog-model'
import { buildMorphoTaxonomyTree, filterMorphospeciesByTaxon, type MorphoTaxonSelection } from './morpho-taxonomy'
import { useMorphoIndexedFallback } from './use-morpho-indexed-fallback'

export type MorphoCatalogDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectIdOverride?: string
  initialScope?: ScopeType
}

export function MorphoCatalogDialog(props: MorphoCatalogDialogProps) {
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

  const leafGroupIds = useMemo(() => Object.keys(nights ?? {}), [nights])
  const indexedFallbackForScope = useMorphoIndexedFallback({
    open,
    summaries,
    leafGroupIds,
    usageScope,
    projectId,
    siteId,
    deploymentId,
    leafGroupId,
  })

  const catalogView = useMemo(() => {
    return buildMorphoCatalogView({
      summaries,
      detections,
      nights,
      usageScope,
      scope: { projectId, siteId, deploymentId, leafGroupId },
      indexedFallback: {
        counts: indexedFallbackForScope.counts,
        taxonomyByKey: indexedFallbackForScope.taxonomyByKey,
      },
    })
  }, [
    summaries,
    detections,
    nights,
    usageScope,
    projectId,
    siteId,
    deploymentId,
    leafGroupId,
    indexedFallbackForScope,
  ])

  const { scopeCounts, list, taxonomyByKey } = catalogView

  const [selectedTaxon, setSelectedTaxon] = useState<MorphoTaxonSelection | undefined>(undefined)

  const taxonomyTree = useMemo(() => {
    return buildMorphoTaxonomyTree({ morphoList: list, taxonomyByKey })
  }, [list, taxonomyByKey])

  const filtered = useMemo(() => {
    return filterMorphospeciesByTaxon({ morphoList: list, selectedTaxon, taxonomyByKey })
  }, [list, selectedTaxon, taxonomyByKey])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent align='vhSide' className='max-w-[1400px] col justify-start !p-0 gap-0 h-[90vh]'>
        <Column className='border-b p-16 gap-12 flex-shrink-0'>
          <Row className='items-center gap-20'>
            <h3 className='!text-16 font-medium'>Morphospecies</h3>
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
              label='All morphospecies'
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
              <p className='text-sm text-neutral-500'>No morphospecies found.</p>
            ) : (
              <ul className='grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-12'>
                {filtered.map((it) => (
                  <MorphoCard
                    key={it.key}
                    morphoKey={it.key}
                    count={it.count}
                    indexedPreviewPairs={indexedFallbackForScope.previewPairsByKey[it.key] || []}
                    onClose={() => onOpenChange(false)}
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

function INatLinkDialogContent(props: { morphoKey: string }) {
  const { morphoKey } = props
  const links = useStore(morphoLinksStore)
  const current = links?.[normalizeMorphoKey(morphoKey)] || ''
  const [value, setValue] = useState<string>(current)

  function onSave() {
    if (!morphoKey) return
    void setMorphoLink({ morphoKey, url: value })
    closeGlobalDialog()
  }

  return (
    <div className='w-[480px]'>
      <h3 className='text-16 font-medium'>Add iNaturalist link</h3>
      <p className='mt-8 text-13 text-neutral-600'>Morphospecies: {morphoKey}</p>
      <div className='mt-12'>
        <input
          className='w-full rounded border px-8 py-6 text-13 outline-none ring-1 ring-inset ring-black/10 focus:ring-black/30'
          placeholder='https://www.inaturalist.org/taxa/...'
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className='mt-12 flex justify-end gap-8'>
        <Button size='xsm' variant='ghost' onClick={() => closeGlobalDialog()}>
          Cancel
        </Button>
        <Button size='xsm' variant='primary' onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  )
}

type MorphoCardProps = {
  morphoKey: string
  count: number
  indexedPreviewPairs?: MorphoPreviewPair[]
  onClose?: () => void
}

function MorphoCard(props: MorphoCardProps) {
  const { morphoKey, count, indexedPreviewPairs, onClose } = props
  const previewUrl = useMorphoPreviewUrl({ morphoKey, indexedPreviewPairs })
  const links = useStore(morphoLinksStore)
  const link = links?.[normalizeMorphoKey(morphoKey)]
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)

  return (
    <li className='rounded-md border bg-white p-12'>
      <div className='-mt-12 -mx-12 mb-8'>
        <ImageWithDownloadName
          src={previewUrl}
          alt={morphoKey}
          downloadName={morphoKey}
          className='w-full h-[200px] object-contain rounded'
        />
      </div>
      <div className='flex items-center gap-8'>
        <span className='font-medium text-ink-primary truncate'>{morphoKey}</span>
        <span className='ml-auto text-12 text-neutral-600'>{count}</span>
      </div>

      <Row className='mt-8 gap-4 justify-end'>
        {link && (
          <Button size='xsm' onClick={() => window.open(link, '_blank')} aria-label='Open iNaturalist'>
            <INaturalistLogo height={16} className=' fill-[#86A91D]' />
          </Button>
        )}

        <MorphoSpeciesDetailsDialog
          morphoKey={morphoKey}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          onNavigate={() => {
            setDetailsDialogOpen(false)
            onClose?.()
          }}
        >
          <Button size='xsm'>View usage</Button>
        </MorphoSpeciesDetailsDialog>

        <MorphoCardActions morphoKey={morphoKey} onClose={onClose} />
      </Row>
    </li>
  )
}

function MorphoCardActions(props: { morphoKey: string; onClose?: () => void }) {
  const { morphoKey, onClose } = props
  const router = useRouter()
  const summaries = useStore(leafGroupSummariesStore)
  const detections = useStore(detectionsStore)
  const nights = useStore(leafGroupsStore)
  const [identifyDialogOpen, setIdentifyDialogOpen] = useState(false)
  const { setConfirmDialog } = useConfirmDialog()

  const primaryProjectId = useMemo(() => {
    return computePrimaryProjectIdForMorphoKey({ summaries, nights, morphoKey })
  }, [summaries, nights, morphoKey])

  function handleIdentifyDialogSubmit(label: string, taxon?: TaxonRecord) {
    if (!taxon) {
      toast.error('Please select a species or higher taxon to identify this morphospecies')
      return
    }

    const usage = findMorphoUsageByKey({ morphoKey })
    const count = usage.instanceCount
    const leafGroupCount = usage.leafGroupIds.size
    const projectCount = usage.projectIds.size

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
      setIdentifyDialogOpen(false)
    } else {
      toast.warning('No instances were updated')
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size='icon-sm' className='-mr-4' aria-label='More actions'>
            <EllipsisVertical size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='bottom' align='end' className='min-w-[220px] p-4'>
          <DropdownMenuItem
            className='text-13'
            onSelect={(e) => e.preventDefault()}
            onClick={() =>
              openGlobalDialog({
                component: INatLinkDialogContent as any,
                props: { morphoKey },
                align: 'center',
              })
            }
          >
            Add iNaturalist link
          </DropdownMenuItem>

          <DropdownMenuItem
            className='text-13'
            onSelect={(e) => e.preventDefault()}
            onClick={() => {
              handleLoadInNight({
                router,
                summaries,
                detections,
                morphoKey,
                onClose,
              })
            }}
          >
            Load in night
          </DropdownMenuItem>

          <DropdownMenuItem className='text-13' onSelect={(e) => e.preventDefault()} onClick={() => setIdentifyDialogOpen(true)}>
            Identify as Species
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <IdentifyDialog
        open={identifyDialogOpen}
        onOpenChange={setIdentifyDialogOpen}
        onSubmit={handleIdentifyDialogSubmit}
        datasetId={primaryProjectId}
      />
    </>
  )
}

function handleLoadInNight(params: {
  router: ReturnType<typeof useRouter>
  summaries: ReturnType<typeof useStore<typeof leafGroupSummariesStore>>
  detections: ReturnType<typeof useStore<typeof detectionsStore>>
  morphoKey: string
  onClose?: () => void
}) {
  const { router, summaries, detections, morphoKey, onClose } = params

  const label = getLabelForMorphoKey({ detections, morphoKey })
  const search = { bucket: 'user' as const, rank: 'species' as const, name: label }

  const firstNightId = findFirstNightForMorphoKey({ summaries, morphoKey })

  if (!firstNightId) {
    toast.warning('No nights contain this morphospecies')
    return
  }

  const nightEntity = leafGroupsStore.get()?.[firstNightId]
  if (!nightEntity) {
    toast.warning('Could not navigate to night')
    return
  }

  const link = buildLeafGroupLinkParams({
    folderName: activeDatasetFolderNameStore.get(),
    projectId: nightEntity.projectId,
    deploymentId: nightEntity.deploymentId,
    night: nightEntity,
    singleLeafDataset: isSingleLeafHierarchy(activeHierarchyStore.get()),
  })

  router.navigate({
    to: link.to,
    params: link.params,
    search,
  })

  onClose?.()
}

function useMorphoPreviewUrl(params: { morphoKey: string; indexedPreviewPairs?: MorphoPreviewPair[] }) {
  const { morphoKey, indexedPreviewPairs = [] } = params
  const summaries = useStore(leafGroupSummariesStore)
  const nights = useStore(leafGroupsStore)
  const covers = useStore(morphoCoversStore)
  const detections = useStore(detectionsStore)

  const summaryPreviewPairs = useMemo(() => {
    return buildSummaryPreviewPairs({ morphoKey, summaries, nights, covers })
  }, [summaries, nights, morphoKey, covers])

  const fallbackPreviewPairs = useMemo(() => {
    return buildFallbackPreviewPairs({ morphoKey, detections })
  }, [detections, morphoKey])

  const previewPairs = useMemo(() => {
    const selected = selectMorphoPreviewPairs({ summaryPreviewPairs, fallbackPreviewPairs })
    if (selected.length > 0) return selected
    return indexedPreviewPairs
  }, [summaryPreviewPairs, fallbackPreviewPairs, indexedPreviewPairs])

  const previewFile = usePreviewFile({ previewPairs })
  const previewUrl = useObjectUrl(previewFile)

  return previewUrl
}

function computePrimaryProjectIdForMorphoKey(params: {
  summaries?: Record<string, LeafGroupSummaryEntity>
  nights?: Record<string, LeafGroupEntity>
  morphoKey: string
}) {
  const { summaries, nights, morphoKey } = params
  const normalizedMorphoKey = normalizeMorphoKey(morphoKey)
  const projectIds = new Set<string>()

  for (const [leafGroupId, summary] of Object.entries(summaries ?? {})) {
    const count = summary?.morphoCounts?.[normalizedMorphoKey]
    if (!count) continue

    const projectId = nights?.[leafGroupId]?.projectId
    if (projectId) projectIds.add(projectId)
  }

  return Array.from(projectIds)?.[0]
}

function findFirstNightForMorphoKey(params: { summaries?: Record<string, LeafGroupSummaryEntity>; morphoKey: string }) {
  const { summaries, morphoKey } = params
  const out: string[] = []

  for (const [nid, summary] of Object.entries(summaries ?? {})) {
    const count = summary?.morphoCounts?.[normalizeMorphoKey(morphoKey)]
    if (count && count > 0) out.push(nid)
  }

  out.sort()
  return out[0]
}

