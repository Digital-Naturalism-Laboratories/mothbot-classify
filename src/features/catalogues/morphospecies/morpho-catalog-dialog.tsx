import { useStore } from '@nanostores/react'
import { useRouter, useRouterState } from '@tanstack/react-router'
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
import { computeAllowedNightIds, extractRouteIds } from '~/features/catalogues/shared/catalog-utils'
import { getLabelForMorphoKey } from '~/features/catalogues/shared/details-common'
import { ScopeFilters, type ScopeType } from '~/features/catalogues/shared/scope-filters'
import { usePreviewFile } from '~/features/catalogues/shared/use-preview-file'
import { morphoCoversStore } from '~/features/data-flow/3.persist/covers'
import { morphoLinksStore, setMorphoLink } from '~/features/data-flow/3.persist/links'
import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { CountsRow } from '~/features/left-panel/counts-row'
import type { TaxonomyNode } from '~/features/left-panel/left-panel.types'
import { TaxonomySection } from '~/features/left-panel/taxonomy-section'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import type { TaxonRecord } from '~/models/taxonomy/types'
import { nightsStore } from '~/stores/entities/4.nights'
import { detectionsStore, findDetectionsByMorphoKey, bulkIdentifyMorphospecies } from '~/stores/entities/detections'
import { nightSummariesStore } from '~/stores/entities/night-summaries'
import { Column, Row } from '~/styles'
import { useObjectUrl } from '~/utils/use-object-url'
import { MorphoSpeciesDetailsDialog } from './morpho-details-dialog'

export type MorphoCatalogDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MorphoCatalogDialog(props: MorphoCatalogDialogProps) {
  const { open, onOpenChange } = props

  const route = useRouterState({ select: (s) => s.location })
  const { projectId, siteId, deploymentId, nightId } = useMemo(() => extractRouteIds(route?.pathname || ''), [route?.pathname])
  const [usageScope, setUsageScope] = useState<ScopeType>('all')

  const summaries = useStore(nightSummariesStore)

  const scopeCounts = useMemo(() => {
    const counts: Record<ScopeType, number> = {
      all: 0,
      project: 0,
      site: 0,
      deployment: 0,
      night: 0,
    }
    counts.all = countMorphoKeysForNightIds({ summaries })
    if (projectId) counts.project = countMorphoKeysForNightIds({ summaries, startsWith: `${projectId}/` })
    if (projectId && siteId) counts.site = countMorphoKeysForNightIds({ summaries, startsWith: `${projectId}/${siteId}/` })
    if (projectId && siteId && deploymentId)
      counts.deployment = countMorphoKeysForNightIds({ summaries, startsWith: `${projectId}/${siteId}/${deploymentId}/` })
    if (projectId && siteId && deploymentId && nightId)
      counts.night = countMorphoKeysForNightIds({ summaries, equals: `${projectId}/${siteId}/${deploymentId}/${nightId}` })
    return counts
  }, [summaries, projectId, siteId, deploymentId, nightId])

  const allowedNightIds = useMemo(() => {
    return computeAllowedNightIds({ usageScope, summaries, projectId, siteId, deploymentId, nightId })
  }, [usageScope, summaries, projectId, siteId, deploymentId, nightId])

  const list = useMorphoIndexWithContext({ allowedNightIds })
  const detections = useStore(detectionsStore)

  const [selectedTaxon, setSelectedTaxon] = useState<
    { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string } | undefined
  >(undefined)

  const taxonomyTree = useMemo(() => {
    return buildMorphoTaxonomyTree({ morphoList: list, allowedNightIds, detections })
  }, [list, allowedNightIds, detections])

  const filtered = useMemo(() => {
    return filterMorphospeciesByTaxon({ morphoList: list, selectedTaxon, allowedNightIds, detections })
  }, [list, selectedTaxon, allowedNightIds, detections])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent align='vhSide' className='max-w-[1400px] col justify-start !p-0 gap-0 h-[90vh]'>
        <Column className='border-b p-16 gap-12 flex-shrink-0'>
          <Row className='items-center gap-20'>
            <h3 className='!text-16 font-medium'>Morphospecies</h3>
            <ScopeFilters
              scope={usageScope}
              onScopeChange={setUsageScope}
              hasProject={!!projectId}
              hasSite={!!(projectId && siteId)}
              hasDeployment={!!(projectId && siteId && deploymentId)}
              hasNight={!!(projectId && siteId && deploymentId && nightId)}
              counts={scopeCounts}
            />
          </Row>
        </Column>

        <Row className='flex-1 min-h-0 overflow-hidden gap-16'>
          <Column className='w-[300px] border-r overflow-y-auto px-16 py-20'>
            <CountsRow
              label='All morphospecies'
              count={list.length}
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
                  <MorphoCard key={it.key} morphoKey={it.key} count={it.count} onClose={() => onOpenChange(false)} />
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

type MorphoCardProps = { morphoKey: string; count: number; onClose?: () => void }

function MorphoCard(props: MorphoCardProps) {
  const { morphoKey, count, onClose } = props
  const previewUrl = useMorphoPreviewUrl({ morphoKey })
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
  const route = useRouterState({ select: (s) => s.location })
  const summaries = useStore(nightSummariesStore)
  const detections = useStore(detectionsStore)
  const nights = useStore(nightsStore)
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

    const matchingInfo = findDetectionsByMorphoKey({ morphoKey })
    const count = matchingInfo.detectionIds.length
    const nightCount = matchingInfo.nightIds.size

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
                routePathname: route?.pathname,
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
        projectId={primaryProjectId}
      />
    </>
  )
}

function handleLoadInNight(params: {
  router: ReturnType<typeof useRouter>
  routePathname: string | undefined
  summaries: ReturnType<typeof useStore<typeof nightSummariesStore>>
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

  const parsed = parseNightIdParts({ nightId: firstNightId })
  if (!parsed) {
    toast.warning('Could not navigate to night')
    return
  }

  router.navigate({
    to: '/projects/$projectId/sites/$siteId/deployments/$deploymentId/nights/$nightId',
    params: { projectId: parsed.projectId, siteId: parsed.siteId, deploymentId: parsed.deploymentId, nightId: parsed.nightId },
    search,
  })

  onClose?.()
}

function useMorphoIndexWithContext(params?: { allowedNightIds?: Set<string> | undefined }) {
  const { allowedNightIds } = params || {}
  const summaries = useStore(nightSummariesStore)
  const detections = useStore(detectionsStore)

  const contextByKey = useMemo(() => buildContextByMorphoKey({ detections, allowedNightIds }), [detections, allowedNightIds])

  const list = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [nid, s] of Object.entries(summaries ?? {})) {
      if (allowedNightIds && !allowedNightIds.has(nid)) continue
      const m = (s as any)?.morphoCounts as Record<string, number> | undefined
      if (!m) continue
      for (const [k, v] of Object.entries(m)) counts[k] = (counts[k] || 0) + (typeof v === 'number' ? v : 0)
    }
    const arr = Object.entries(counts)
      .map(([key, count]) => {
        const ctx = contextByKey.get(key) || { hasOrder: false, hasFamily: false, hasGenus: false }
        return { key, count, ...ctx }
      })
      .sort((a, b) => b.count - a.count)
    return arr
  }, [summaries, contextByKey, allowedNightIds])

  return list as Array<{ key: string; count: number; hasOrder: boolean; hasFamily: boolean; hasGenus: boolean }>
}

function useMorphoPreviewUrl(params: { morphoKey: string }) {
  const { morphoKey } = params
  const summaries = useStore(nightSummariesStore)
  const nights = useStore(nightsStore)
  const covers = useStore(morphoCoversStore)

  const previewPairs = useMemo(() => {
    const pairs: Array<{ nightId: string; patchId: string }> = []

    const override = covers?.[normalizeMorphoKey(morphoKey)]
    if (override?.nightId && override?.patchId) pairs.push({ nightId: override.nightId, patchId: override.patchId })

    for (const [nightId, s] of Object.entries(summaries ?? {})) {
      const countForKey = (s as any)?.morphoCounts?.[morphoKey]
      if (!countForKey) continue
      if (!nights?.[nightId]) continue
      const pid = (s as any)?.morphoPreviewPatchIds?.[morphoKey]
      if (pid) pairs.push({ nightId, patchId: String(pid) })
    }
    return pairs
  }, [summaries, nights, morphoKey, covers])

  const previewFile = usePreviewFile({ previewPairs })
  const previewUrl = useObjectUrl(previewFile)
  return previewUrl
}

function buildMorphoTaxonomyTree(params: {
  morphoList: Array<{ key: string; count: number; hasOrder: boolean; hasFamily: boolean; hasGenus: boolean }>
  allowedNightIds?: Set<string> | undefined
  detections?: Record<string, any>
}): TaxonomyNode[] {
  const { morphoList, allowedNightIds, detections } = params
  const roots: TaxonomyNode[] = []
  const UNASSIGNED_LABEL = 'Unassigned'

  function ensureChild(nodes: TaxonomyNode[], rank: TaxonomyNode['rank'], name: string, isMorphoSpecies?: boolean): TaxonomyNode {
    let node = nodes.find((n) => n.rank === rank && n.name === name)
    if (!node) {
      node = { rank, name, count: 0, children: [] }
      nodes.push(node)
    }
    node.count++
    if (rank === 'species' && isMorphoSpecies) node.isMorpho = true
    return node
  }

  const morphoKeyToTaxonomy = new Map<string, Array<{ rank: TaxonomyNode['rank']; name: string }>>()

  for (const morphoItem of morphoList) {
    const morphoKey = morphoItem.key
    let path: Array<{ rank: TaxonomyNode['rank']; name: string }> | undefined = morphoKeyToTaxonomy.get(morphoKey)

    if (!path) {
      let foundTaxonomy = false
      let klass: string | undefined
      let order: string | undefined
      let family: string | undefined
      let genus: string | undefined
      let species: string | undefined
      let morphospecies: string | undefined

      for (const d of Object.values(detections ?? {})) {
        const det = d as any
        if (det?.detectedBy !== 'user') continue
        if (typeof det?.morphospecies !== 'string' || !det?.morphospecies) continue
        if (allowedNightIds && det?.nightId && !allowedNightIds.has(det.nightId)) continue
        const label = (det?.morphospecies ?? '').trim()
        if (!label) continue
        const key = normalizeMorphoKey(label)
        if (key !== morphoKey) continue

        klass = klass || (det?.taxon?.class as string | undefined)
        order = order || (det?.taxon?.order as string | undefined)
        family = family || (det?.taxon?.family as string | undefined)
        genus = genus || (det?.taxon?.genus as string | undefined)
        species = species || (det?.taxon?.species as string | undefined)
        morphospecies = morphospecies || (det?.morphospecies as string | undefined)

        foundTaxonomy = true
      }

      if (!foundTaxonomy) continue

      path = []
      const hasSpecies = !!species || !!morphospecies
      const speciesName = morphospecies || species
      const hasGenus = !!genus
      const hasFamily = !!family
      const hasOrder = !!order
      const hasAnyLowerThanClass = hasOrder || hasFamily || hasGenus || hasSpecies

      if (klass) path.push({ rank: 'class', name: klass })
      const orderName = hasAnyLowerThanClass ? order || UNASSIGNED_LABEL : undefined
      const familyName = hasFamily || hasGenus || hasSpecies ? family || UNASSIGNED_LABEL : undefined
      const genusName = hasGenus || hasSpecies ? genus || UNASSIGNED_LABEL : undefined
      if (orderName) path.push({ rank: 'order', name: orderName })
      if (familyName) path.push({ rank: 'family', name: familyName })
      if (genusName) path.push({ rank: 'genus', name: genusName })
      if (hasSpecies && speciesName) path.push({ rank: 'species', name: speciesName })

      if (path.length === 0) continue
      morphoKeyToTaxonomy.set(morphoKey, path)
    }

    let currentLevel = roots
    for (const seg of path) {
      const node = ensureChild(currentLevel, seg.rank, seg.name, seg.rank === 'species')
      if (!node.children) node.children = []
      currentLevel = node.children
    }
  }

  function sortTree(nodes: TaxonomyNode[]) {
    nodes.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    for (const n of nodes) sortTree(n.children || [])
  }
  sortTree(roots)
  return roots
}

function filterMorphospeciesByTaxon(params: {
  morphoList: Array<{ key: string; count: number; hasOrder: boolean; hasFamily: boolean; hasGenus: boolean }>
  selectedTaxon?: { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string }
  allowedNightIds?: Set<string> | undefined
  detections?: Record<string, any>
}) {
  const { morphoList, selectedTaxon, allowedNightIds, detections } = params
  if (!selectedTaxon) return morphoList
  const result = morphoList.filter((morphoItem) => {
    const morphoKey = morphoItem.key
    for (const d of Object.values(detections ?? {})) {
      const det = d as any
      if (det?.detectedBy !== 'user') continue
      if (typeof det?.morphospecies !== 'string' || !det?.morphospecies) continue
      if (allowedNightIds && det?.nightId && !allowedNightIds.has(det.nightId)) continue
      const label = (det?.morphospecies ?? '').trim()
      if (!label) continue
      const key = normalizeMorphoKey(label)
      if (key !== morphoKey) continue

      const tax = det?.taxon
      const morphospecies = det?.morphospecies
      const speciesName = morphospecies || tax?.species
      let matches = false
      if (selectedTaxon.rank === 'class') matches = tax?.class === selectedTaxon.name
      else if (selectedTaxon.rank === 'order') matches = tax?.order === selectedTaxon.name
      else if (selectedTaxon.rank === 'family') matches = tax?.family === selectedTaxon.name
      else if (selectedTaxon.rank === 'genus') matches = tax?.genus === selectedTaxon.name
      else if (selectedTaxon.rank === 'species') matches = speciesName === selectedTaxon.name

      if (matches) return true
    }
    return false
  })

  return result
}

function buildContextByMorphoKey(params: { detections?: Record<string, any>; allowedNightIds?: Set<string> | undefined }) {
  const { detections, allowedNightIds } = params
  const map = new Map<string, { hasOrder: boolean; hasFamily: boolean; hasGenus: boolean }>()
  for (const d of Object.values(detections ?? {})) {
    const det = d as any
    if (det?.detectedBy !== 'user') continue
    if (typeof det?.morphospecies !== 'string' || !det?.morphospecies) continue
    if (allowedNightIds && det?.nightId && !allowedNightIds.has(det.nightId)) continue
    const label = (det?.morphospecies ?? '').trim()
    if (!label) continue
    const key = normalizeMorphoKey(label)
    const prev = map.get(key) || { hasOrder: false, hasFamily: false, hasGenus: false }
    const next = {
      hasOrder: prev.hasOrder || !!det?.taxon?.order,
      hasFamily: prev.hasFamily || !!det?.taxon?.family,
      hasGenus: prev.hasGenus || !!det?.taxon?.genus,
    }
    map.set(key, next)
  }
  return map
}

function parseNightIdParts(params: { nightId: string }) {
  const { nightId } = params
  const parts = nightId.split('/')
  const projectId = parts?.[0]
  const siteId = parts?.[1]
  const deploymentId = parts?.[2]
  const nightIdPart = parts?.[3]

  if (!projectId || !siteId || !deploymentId || !nightIdPart) return null

  return { projectId, siteId, deploymentId, nightId: nightIdPart }
}

function computePrimaryProjectIdForMorphoKey(params: { summaries?: Record<string, any>; nights?: Record<string, any>; morphoKey: string }) {
  const { summaries, nights, morphoKey } = params
  const projectIds = new Set<string>()

  for (const [nightId, s] of Object.entries(summaries ?? {})) {
    const count = (s as any)?.morphoCounts?.[morphoKey]
    if (!count) continue
    const projectId = (nights?.[nightId] as any)?.projectId
    if (projectId) projectIds.add(projectId)
  }

  return Array.from(projectIds)?.[0]
}

function findFirstNightForMorphoKey(params: { summaries?: Record<string, any>; morphoKey: string }) {
  const { summaries, morphoKey } = params
  const out: string[] = []
  for (const [nid, s] of Object.entries(summaries ?? {})) {
    const count = (s as any)?.morphoCounts?.[normalizeMorphoKey(morphoKey)]
    if (count && count > 0) out.push(nid)
  }
  out.sort()
  return out[0]
}

function countMorphoKeysForNightIds(params: { summaries?: Record<string, any>; startsWith?: string; equals?: string }) {
  const { summaries, startsWith, equals } = params
  const keys = new Set<string>()
  for (const [nid, s] of Object.entries(summaries || {})) {
    if (equals && nid !== equals) continue
    if (startsWith && !nid.startsWith(startsWith)) continue
    const m = (s as any)?.morphoCounts as Record<string, number> | undefined
    if (!m) continue
    for (const k of Object.keys(m)) keys.add(k)
  }
  return keys.size
}
