import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from '@tanstack/react-router'
import { expandMany, makeKey } from '~/features/left-panel/collapse.store'
import { ensureSpeciesListSelection } from '~/features/data-flow/2.identify/species-picker.state'
import { nightsStore } from '~/stores/entities/4.nights'
import type { PatchEntity } from '~/stores/entities/5.patches'
import { patchesStore } from '~/stores/entities/5.patches'
import type { DetectionEntity } from '~/stores/entities/detections'
import { acceptDetections, detectionsStore, labelDetections, resetDetections } from '~/stores/entities/detections'
import { photosStore } from '~/stores/entities/photos'
import { clearPatchSelection, selectedPatchIdsStore, setSelection, markNightAsActive, getActiveNightIds } from '~/stores/ui'
import { clearFileObjectsForInactiveNights } from '~/stores/entities'
import { Row } from '~/styles'
import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { useConfirmDialog } from '~/components/dialogs/ConfirmDialog'
import { NightLeftPanel } from '@/features/left-panel/night-left-panel'
import { PatchDetailDialog } from './patch-detail-dialog'
import { PatchGrid } from '~/features/patch-grid/patch-grid'
import { SelectionBar } from './selection-bar'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'

type TaxonSelection = { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string } | undefined

export function NightView(props: { nightId: string }) {
  const { nightId } = props

  const router = useRouter()
  const params = useParams({ from: '/projects/$projectId/sites/$siteId/deployments/$deploymentId/nights/$nightId' })
  const nights = useStore(nightsStore)
  const patches = useStore(patchesStore)
  const detections = useStore(detectionsStore)
  const photos = useStore(photosStore)
  const [selectedTaxon, setSelectedTaxon] = useState<TaxonSelection>(undefined)
  const [identifyOpen, setIdentifyOpen] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState<'auto' | 'user' | undefined>('auto')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailPatchId, setDetailPatchId] = useState<string | null>(null)
  const selected = useStore(selectedPatchIdsStore)
  const { setConfirmDialog } = useConfirmDialog()

  const night = nights[nightId]

  useEffect(() => {
    markNightAsActive({ nightId })
    const activeNightIds = getActiveNightIds()
    clearFileObjectsForInactiveNights({ activeNightIds })

    return () => {
      const activeNightIdsAfterUnmount = getActiveNightIds()
      clearFileObjectsForInactiveNights({ activeNightIds: activeNightIdsAfterUnmount })
    }
  }, [nightId])

  // Sync selection with URL search params (bucket, rank, name)
  const search = router.state.location.search as unknown as {
    bucket?: 'auto' | 'user'
    rank?: 'class' | 'order' | 'family' | 'genus' | 'species'
    name?: string
  }

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c0a2a6ae-86fa-4ed1-99f3-07b2d9004f41', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'night-view.tsx:61',
        message: 'Sync search params useEffect',
        data: { search, selectedBucket, nightId, detectionsCount: Object.keys(detections || {}).length },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'D',
      }),
    }).catch(() => {})
    // #endregion

    const nextBucket = search?.bucket === 'user' || search?.bucket === 'auto' ? search.bucket : undefined
    if (nextBucket && nextBucket !== selectedBucket) setSelectedBucket(nextBucket)

    const r = search?.rank
    const n = (search?.name ?? '').trim()
    const validRank = r === 'class' || r === 'order' || r === 'family' || r === 'genus' || r === 'species' ? r : undefined

    // #region agent log
    if (validRank === 'species' && n) {
      const allDetectionsInNight = Object.values(detections || {}).filter((d: any) => d?.nightId === nightId)
      const userDetectionsInNight = allDetectionsInNight.filter((d: any) => d?.detectedBy === 'user')
      const matchingDetections = userDetectionsInNight.filter((d: any) => {
        const morphospecies = d?.morphospecies
        const taxonSpecies = d?.taxon?.species
        // Use same logic as filter: check taxon.species first, then normalized morphospecies
        if (taxonSpecies && taxonSpecies === n) return true
        if (morphospecies && normalizeMorphoKey(morphospecies) === normalizeMorphoKey(n)) return true
        return false
      })
      fetch('http://127.0.0.1:7242/ingest/c0a2a6ae-86fa-4ed1-99f3-07b2d9004f41', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'night-view.tsx:69',
          message: 'Setting selectedTaxon from search - checking matching detections',
          data: {
            validRank,
            name: n,
            willSet: !!(validRank && n),
            nightId,
            allDetectionsInNightCount: allDetectionsInNight.length,
            userDetectionsInNightCount: userDetectionsInNight.length,
            matchingDetectionsCount: matchingDetections.length,
            sampleMatchingDetections: matchingDetections.slice(0, 3).map((d: any) => ({
              patchId: d?.patchId,
              morphospecies: d?.morphospecies,
              taxonSpecies: d?.taxon?.species,
            })),
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'D',
        }),
      }).catch(() => {})
    }
    // #endregion

    if (validRank && n) setSelectedTaxon({ rank: validRank, name: n })
    else if (!validRank || !n) setSelectedTaxon(undefined)

    // Expand left panel taxonomy path so the selected item is visible
    if (nextBucket && validRank && n) {
      expandLeftPanelPathForSelection({
        selectedBucket: nextBucket,
        selectedTaxon: { rank: validRank as any, name: n },
        nightId,
        detections,
      })
    }
  }, [search?.bucket, search?.rank, search?.name, nightId, detections, selectedBucket])

  const list = useMemo(() => {
    const filtered = Object.values(patches).filter((patch) => patch.nightId === nightId)
    // #region agent log
    if (selectedTaxon?.rank === 'species' && selectedBucket === 'user') {
      fetch('http://127.0.0.1:7242/ingest/c0a2a6ae-86fa-4ed1-99f3-07b2d9004f41', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'night-view.tsx:83',
          message: 'Filtering patches by nightId',
          data: {
            nightId,
            totalPatches: Object.values(patches).length,
            filteredPatches: filtered.length,
            samplePatchNightIds: Object.values(patches)
              .slice(0, 3)
              .map((p: any) => ({ id: p.id, nightId: p.nightId })),
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'D',
        }),
      }).catch(() => {})
    }
    // #endregion
    return filtered
  }, [patches, nightId, selectedTaxon?.rank, selectedBucket])
  const taxonomyAuto = useMemo(() => buildTaxonomyTreeForNight({ detections, nightId, bucket: 'auto' }), [detections, nightId])
  const taxonomyUser = useMemo(() => buildTaxonomyTreeForNight({ detections, nightId, bucket: 'user' }), [detections, nightId])
  const totalDetections = useMemo(() => Object.values(detections ?? {}).filter((d) => d.nightId === nightId).length, [detections, nightId])
  const totalIdentified = useMemo(
    () => Object.values(detections ?? {}).filter((d) => d.nightId === nightId && (d as any)?.detectedBy === 'user').length,
    [detections, nightId],
  )
  const filtered = useMemo(
    () => filterPatchesByTaxon({ patches: list, detections, selectedTaxon, selectedBucket }),
    [list, detections, selectedTaxon, selectedBucket],
  )
  const sorted = useMemo(() => sortPatchesByClusterThenArea({ patches: filtered, detections }), [filtered, detections])
  const totalPatches = list.length
  const selectedCount = useMemo(() => Array.from(selected ?? []).filter((id) => !!id).length, [selected])
  const selectedDetectionIds = useMemo(() => Array.from(selected ?? []), [selected])

  const nightWarnings = useMemo(() => {
    let jsonWithoutPhotoCount = 0
    let missingPatchImageCount = 0
    for (const p of Object.values(photos ?? {})) {
      if ((p as any)?.nightId !== nightId) continue
      const hasJson = !!(p as any)?.botDetectionFile
      const hasImage = !!(p as any)?.imageFile
      if (hasJson && !hasImage) jsonWithoutPhotoCount++
    }
    for (const d of Object.values(detections ?? {})) {
      if ((d as any)?.nightId !== nightId) continue
      const patchId = (d as any)?.patchId
      const patch = (patches as any)?.[patchId]
      const hasPatchImage = !!patch?.imageFile
      if (!hasPatchImage) missingPatchImageCount++
    }
    return { jsonWithoutPhotoCount, missingPatchImageCount }
  }, [photos, detections, patches, nightId])

  function onIdentify() {
    if (selectedCount === 0) return
    ensureSpeciesListSelection({ projectId: (night as any)?.projectId, onReady: () => setIdentifyOpen(true) })
  }

  function onAccept() {
    if (selectedDetectionIds.length === 0) return
    acceptDetections({ detectionIds: selectedDetectionIds })
    clearPatchSelection()
  }

  function onSubmitLabel(label: string, taxon?: any) {
    if (!label) return
    if (selectedDetectionIds.length === 0) return

    labelDetections({ detectionIds: selectedDetectionIds, label, taxon })
    clearPatchSelection()
  }

  function onUnselect() {
    if (selectedCount === 0) return
    clearPatchSelection()
  }

  function onSelectAll() {
    const allPatchIds = filtered.map((p) => p.id)
    setSelection({ nightId, patchIds: allPatchIds })
  }

  async function onResetToAuto() {
    if (selectedDetectionIds.length === 0) return

    setConfirmDialog({
      content: (
        <div>
          <div className='text-ink-primary'>Reset selected items to auto?</div>
          <div className='mt-8 text-ink-secondary text-13'>This will remove your identifications and revert to the automatic labels.</div>
        </div>
      ),
      confirmText: 'Reset to auto',
      confirmVariant: 'destructive',
      cancelText: 'Cancel',
      closeAfterConfirm: true,
      onConfirm: async () => {
        await resetDetections({ detectionIds: selectedDetectionIds })
        clearPatchSelection()
      },
    })
  }

  function onOpenPatchDetail(id: string) {
    if (!id) return
    setDetailPatchId(id)
    setDetailOpen(true)
  }

  if (!night) return <p className='text-sm text-neutral-500'>Night not found</p>

  return (
    <Row className='w-full h-full overflow-hidden gap-x-4'>
      <NightLeftPanel
        taxonomyAuto={taxonomyAuto}
        taxonomyUser={taxonomyUser}
        totalPatches={totalPatches}
        totalDetections={totalDetections}
        totalIdentified={totalIdentified}
        warnings={nightWarnings}
        selectedTaxon={selectedTaxon as any}
        selectedBucket={selectedBucket}
        onSelectTaxon={({ taxon, bucket }) => {
          setSelectedTaxon(taxon as any)
          setSelectedBucket(bucket)

          const search: { bucket?: 'auto' | 'user'; rank?: 'class' | 'order' | 'family' | 'genus' | 'species'; name?: string } = {
            bucket,
          }

          if (taxon) {
            search.rank = taxon.rank
            search.name = taxon.name
          }

          router.navigate({
            to: '/projects/$projectId/sites/$siteId/deployments/$deploymentId/nights/$nightId',
            params: {
              projectId: params.projectId,
              siteId: params.siteId,
              deploymentId: params.deploymentId,
              nightId: params.nightId,
            },
            search,
          })
        }}
        className='w-[300px] overflow-y-auto'
      />
      <div className='relative flex-1 min-h-0 overflow-hidden'>
        <PatchGrid
          patches={sorted}
          nightId={nightId}
          className='h-full'
          onOpenPatchDetail={onOpenPatchDetail}
          selectedTaxon={selectedTaxon as any}
          selectedBucket={selectedBucket}
        />
        <SelectionBar
          selectedCount={selectedCount}
          onIdentify={onIdentify}
          onAccept={onAccept}
          onUnselect={onUnselect}
          onSelectAll={onSelectAll}
          onResetToAuto={onResetToAuto}
        />
      </div>
      <IdentifyDialog
        open={identifyOpen}
        onOpenChange={setIdentifyOpen}
        onSubmit={onSubmitLabel}
        projectId={(night as any)?.projectId}
        detectionIds={selectedDetectionIds}
      />
      <PatchDetailDialog open={detailOpen} onOpenChange={setDetailOpen} patchId={detailPatchId} />
    </Row>
  )
}

type TaxonomyNode = {
  rank: 'class' | 'order' | 'family' | 'genus' | 'species'
  name: string
  count: number
  children?: TaxonomyNode[]
  isMorpho?: boolean
}

const UNASSIGNED_LABEL = 'Unassigned'

function buildTaxonomyTreeForNight(params: { detections: Record<string, any>; nightId: string; bucket: 'auto' | 'user' }) {
  const { detections, nightId, bucket } = params
  const onlyUser = bucket === 'user'
  const roots: TaxonomyNode[] = []
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
  for (const d of Object.values(detections ?? {})) {
    if ((d as any)?.nightId !== nightId) continue
    const detectedBy = (d as any)?.detectedBy === 'user' ? 'user' : 'auto'
    if ((onlyUser && detectedBy !== 'user') || (!onlyUser && detectedBy !== 'auto')) continue
    // Skip error items from taxonomy tree; they are shown as a separate "Errors" row
    if (onlyUser && (d as any)?.isError) continue
    const klass = (d as any)?.taxon?.class as string | undefined
    const order = (d as any)?.taxon?.order as string | undefined
    const family = (d as any)?.taxon?.family as string | undefined
    const genus = (d as any)?.taxon?.genus as string | undefined
    const species = (d as any)?.taxon?.species as string | undefined
    const morphospecies = (d as any)?.morphospecies as string | undefined
    const hasSpecies = !!species || !!morphospecies
    const speciesName = morphospecies || species
    const hasGenus = !!genus
    const hasFamily = !!family
    const hasOrder = !!order
    const hasAnyLowerThanClass = hasOrder || hasFamily || hasGenus || hasSpecies
    const path: Array<{ rank: TaxonomyNode['rank']; name: string }> = []
    if (onlyUser) {
      // Identified: include class when present; use placeholders for lower ranks when deeper info exists
      if (klass) path.push({ rank: 'class', name: klass })
      const orderName = hasAnyLowerThanClass ? order || UNASSIGNED_LABEL : undefined
      const familyName = hasFamily || hasGenus || hasSpecies ? family || UNASSIGNED_LABEL : undefined
      const genusName = hasGenus || hasSpecies ? genus || UNASSIGNED_LABEL : undefined
      if (orderName) path.push({ rank: 'order', name: orderName })
      if (familyName) path.push({ rank: 'family', name: familyName })
      if (genusName) path.push({ rank: 'genus', name: genusName })
      if (hasSpecies && speciesName) path.push({ rank: 'species', name: speciesName })
    } else {
      // Auto: include only known ranks without placeholders
      if (klass) path.push({ rank: 'class', name: klass })
      if (order) path.push({ rank: 'order', name: order })
      if (family) path.push({ rank: 'family', name: family })
      if (genus) path.push({ rank: 'genus', name: genus })
      if (speciesName) path.push({ rank: 'species', name: speciesName })
    }
    if (path.length === 0) continue
    let currentLevel = roots
    for (const seg of path) {
      const node = ensureChild(
        currentLevel,
        seg.rank,
        seg.name,
        seg.rank === 'species' ? typeof (d as any)?.morphospecies === 'string' && !!(d as any)?.morphospecies : undefined,
      )
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

function filterPatchesByTaxon(params: {
  patches: PatchEntity[]
  detections: Record<string, DetectionEntity>
  selectedTaxon: TaxonSelection
  selectedBucket?: 'auto' | 'user'
}) {
  const { patches, detections, selectedTaxon, selectedBucket } = params
  // Special handling: selecting 'ERROR' (species-level placeholder) under Identified filters by isError
  if (selectedBucket === 'user' && selectedTaxon?.name === 'ERROR') {
    const result = patches.filter((p) => (detections?.[p.id] as any)?.isError === true)
    return result
  }
  if (!selectedTaxon && selectedBucket) {
    const result = patches.filter((p) => {
      const det = detections?.[p.id]
      const detectedBy = det?.detectedBy === 'user' ? 'user' : 'auto'
      return detectedBy === selectedBucket
    })
    return result
  }
  if (!selectedTaxon) return patches
  const result = patches.filter((p) => {
    const det = detections?.[p.id]
    const tax = det?.taxon
    const morphospecies = det?.morphospecies
    // Use same logic as getLabelForMorphoKey: prefer taxon.species, fallback to morphospecies
    const speciesName = tax?.species || morphospecies
    let matches = false
    if (selectedTaxon?.rank === 'class') matches = tax?.class === selectedTaxon?.name
    else if (selectedTaxon?.rank === 'order') matches = tax?.order === selectedTaxon?.name
    else if (selectedTaxon?.rank === 'family') matches = tax?.family === selectedTaxon?.name
    else if (selectedTaxon?.rank === 'genus') matches = tax?.genus === selectedTaxon?.name
    else if (selectedTaxon?.rank === 'species') {
      // Match detections where:
      // 1. taxon.species equals the search name (if taxon.species exists)
      // 2. OR normalized morphospecies equals normalized search name
      // This handles both cases: search name could be taxon.species or morphospecies (from getLabelForMorphoKey)
      const searchName = selectedTaxon?.name
      if (tax?.species && tax.species === searchName) {
        matches = true
      } else if (morphospecies && normalizeMorphoKey(morphospecies) === normalizeMorphoKey(searchName)) {
        matches = true
      } else {
        matches = false
      }
      // #region agent log
      if (selectedTaxon?.rank === 'species' && selectedBucket === 'user') {
        fetch('http://127.0.0.1:7242/ingest/c0a2a6ae-86fa-4ed1-99f3-07b2d9004f41', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'night-view.tsx:357',
            message: 'Species comparison',
            data: {
              patchId: p.id,
              speciesName: speciesName ?? null,
              selectedTaxonName: selectedTaxon?.name,
              matches,
              morphospecies: morphospecies ?? null,
              taxonSpecies: tax?.species ?? null,
              detectedBy: det?.detectedBy ?? null,
              selectedBucket,
              willPassBucketCheck: !selectedBucket || (det?.detectedBy === 'user' ? 'user' : 'auto') === selectedBucket,
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'D',
          }),
        }).catch(() => {})
      }
      // #endregion
    }
    if (!matches) return false
    if (!selectedBucket) return true
    const detectedBy = det?.detectedBy === 'user' ? 'user' : 'auto'
    return detectedBy === selectedBucket
  })
  return result
}

function sortPatchesByClusterThenArea(params: { patches: PatchEntity[]; detections: Record<string, DetectionEntity> }) {
  const { patches, detections } = params
  if (!Array.isArray(patches) || patches.length === 0) return patches
  const withKeys = patches.map((p) => {
    const det = detections?.[p.id]
    const clusterId = typeof (det as any)?.clusterId === 'number' ? (det as any)?.clusterId : undefined
    const area = computeDetectionArea({ detection: det })
    return { patch: p, clusterId, area }
  })
  withKeys.sort((a, b) => {
    const aClusterId = a.clusterId
    const bClusterId = b.clusterId
    const aIsValid = typeof aClusterId === 'number' && aClusterId >= 0
    const bIsValid = typeof bClusterId === 'number' && bClusterId >= 0
    const aIsUnclustered = aClusterId === -1
    const bIsUnclustered = bClusterId === -1

    if (aIsValid && bIsValid) return aClusterId - bClusterId
    if (aIsValid && bIsUnclustered) return -1
    if (aIsValid && bClusterId === undefined) return -1
    if (aIsUnclustered && bIsValid) return 1
    if (aIsUnclustered && bIsUnclustered) {
      if (b.area !== a.area) return b.area - a.area
      const byName = (a.patch?.name || '').localeCompare(b.patch?.name || '')
      return byName
    }
    if (aIsUnclustered && bClusterId === undefined) return -1
    if (aClusterId === undefined && bIsValid) return 1
    if (aClusterId === undefined && bIsUnclustered) return 1
    if (aClusterId === undefined && bClusterId === undefined) {
      if (b.area !== a.area) return b.area - a.area
      const byName = (a.patch?.name || '').localeCompare(b.patch?.name || '')
      return byName
    }
    return 0
  })
  const result = withKeys.map((x) => x.patch)
  return result
}

function expandLeftPanelPathForSelection(params: {
  selectedBucket?: 'auto' | 'user'
  selectedTaxon?: TaxonSelection
  nightId: string
  detections: Record<string, DetectionEntity>
}) {
  const { selectedBucket, selectedTaxon, nightId, detections } = params
  if (!selectedBucket || !selectedTaxon) return
  if (selectedTaxon.rank === 'class') return

  let match: DetectionEntity | undefined
  for (const d of Object.values(detections || {})) {
    const det = d as DetectionEntity
    if ((det as any)?.nightId !== nightId) continue
    const detectedBy = det?.detectedBy === 'user' ? 'user' : 'auto'
    if (selectedBucket && detectedBy !== selectedBucket) continue
    const t = det?.taxon
    if (!t) continue
    const name = selectedTaxon?.name
    let ok = false
    if (selectedTaxon.rank === 'order') ok = t?.order === name
    else if (selectedTaxon.rank === 'family') ok = t?.family === name
    else if (selectedTaxon.rank === 'genus') ok = t?.genus === name
    else if (selectedTaxon.rank === 'species') ok = t?.species === name
    if (ok) {
      match = det
      break
    }
  }
  if (!match) return

  const t = match?.taxon || ({} as any)
  const keys: string[] = []

  if (selectedTaxon.rank === 'order') {
    const orderName = t?.order
    if (orderName) keys.push(makeKey({ bucket: selectedBucket, rank: 'order', path: orderName }))
  } else if (selectedTaxon.rank === 'family') {
    const orderName = selectedBucket === 'user' ? t?.order || UNASSIGNED_LABEL : t?.order
    const familyName = t?.family
    if (orderName) keys.push(makeKey({ bucket: selectedBucket, rank: 'order', path: orderName }))
    if (orderName && familyName) keys.push(makeKey({ bucket: selectedBucket, rank: 'family', path: `${orderName}/${familyName}` }))
  } else if (selectedTaxon.rank === 'genus') {
    const orderName = selectedBucket === 'user' ? t?.order || UNASSIGNED_LABEL : t?.order
    const familyName = selectedBucket === 'user' ? t?.family || UNASSIGNED_LABEL : t?.family
    const genusName = t?.genus
    if (orderName) keys.push(makeKey({ bucket: selectedBucket, rank: 'order', path: orderName }))
    if (orderName && familyName) keys.push(makeKey({ bucket: selectedBucket, rank: 'family', path: `${orderName}/${familyName}` }))
    if (orderName && familyName && genusName)
      keys.push(makeKey({ bucket: selectedBucket, rank: 'genus', path: `${orderName}/${familyName}/${genusName}` }))
  } else if (selectedTaxon.rank === 'species') {
    const orderName = selectedBucket === 'user' ? t?.order || UNASSIGNED_LABEL : t?.order
    const familyName = selectedBucket === 'user' ? t?.family || UNASSIGNED_LABEL : t?.family
    const genusName = selectedBucket === 'user' ? t?.genus || UNASSIGNED_LABEL : t?.genus
    if (orderName) keys.push(makeKey({ bucket: selectedBucket, rank: 'order', path: orderName }))
    if (orderName && familyName) keys.push(makeKey({ bucket: selectedBucket, rank: 'family', path: `${orderName}/${familyName}` }))
    if (orderName && familyName && genusName)
      keys.push(makeKey({ bucket: selectedBucket, rank: 'genus', path: `${orderName}/${familyName}/${genusName}` }))
  }

  if (keys.length) expandMany(keys)
}

function computeDetectionArea(params: { detection?: DetectionEntity }) {
  const { detection } = params
  const points = detection?.points
  if (!Array.isArray(points) || points.length === 0) return 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const pt of points) {
    const x = typeof pt?.[0] === 'number' ? pt[0] : null
    const y = typeof pt?.[1] === 'number' ? pt[1] : null
    if (x == null || y == null) continue
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const width = Math.max(0, maxX - minX)
  const height = Math.max(0, maxY - minY)
  const area = width * height
  return area
}
