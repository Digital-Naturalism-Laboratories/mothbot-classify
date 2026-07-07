import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { expandMany, makeKey } from '~/features/left-panel/collapse.store'
import { ensureSpeciesListSelection } from '~/features/data-flow/2.identify/species-picker.state'
import { buildLeafGroupLinkParams, isSingleLeafHierarchy } from '~/features/mothbox-next/hierarchy-routes'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import type { PatchEntity } from '~/stores/entities/5.patches'
import { patchesStore } from '~/stores/entities/5.patches'
import type { DetectionEntity } from '~/stores/entities/detections'
import { acceptDetections, detectionsStore, labelDetections, resetDetections } from '~/stores/entities/detections'
import { photosStore } from '~/stores/entities/photos'
import { clearPatchSelection, selectedPatchIdsStore, setSelection, markLeafGroupAsActive, getActiveLeafGroupIds, activeNightIdsStore, setActiveNightIds } from '~/stores/ui'
import { clearFileObjectsForInactiveLeafGroups } from '~/stores/entities'
import { Row } from '~/styles'
import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { useConfirmDialog } from '~/components/dialogs/ConfirmDialog'
import { LeafGroupLeftPanel } from '@/features/left-panel/night-left-panel'
import { PatchDetailDialog } from './patch-detail-dialog'
import { PatchGrid } from '~/features/patch-grid/patch-grid'
import { SelectionBar } from './selection-bar'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { computeDetectionLongestDimension } from '~/features/patch-grid/grid-utils'
import { countUnassignedDetectionsForNight, nightHasMachineIdentification } from '~/features/labeling/night-labeling-mode'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { flattenClassificationFiles, resolveCurrentClassifications } from '~/features/mothbox-next/resolve-classifications'
import { detectionFromClassification } from '~/features/mothbox-next/classification-to-detection'
import { rebuildLeafGroupSummariesFromDetections } from '~/features/mothbox-next/rebuild-night-summaries'

type TaxonSelection = { rank: 'class' | 'order' | 'family' | 'genus' | 'species'; name: string } | undefined

export function NightView(props: { leafGroupId: string }) {
  const { leafGroupId } = props

  const router = useRouter()
  const folderName = useStore(activeDatasetFolderNameStore)
  const resolvedHierarchy = useStore(activeHierarchyStore)
  const singleLeafDataset = isSingleLeafHierarchy(resolvedHierarchy)
  const nights = useStore(leafGroupsStore)
  const patches = useStore(patchesStore)
  const detections = useStore(detectionsStore)
  const photos = useStore(photosStore)
  const [selectedTaxon, setSelectedTaxon] = useState<TaxonSelection>(undefined)
  const [identifyOpen, setIdentifyOpen] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState<'auto' | 'user' | undefined>('auto')
  const [sizeThreshold, setSizeThreshold] = useState(0)
  const [sortByClusters, setSortByClusters] = useState(false)
  const [selectedBotAlgorithm, setSelectedBotAlgorithm] = useState<string | undefined>(undefined)
  const [selectedDetectorId, setSelectedDetectorId] = useState<string | undefined>(undefined)
  const allDetectionsRef = useRef<Record<string, DetectionEntity>>({})
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailPatchId, setDetailPatchId] = useState<string | null>(null)
  const hasAppliedDefaultFallbackRef = useRef(false)
  const selected = useStore(selectedPatchIdsStore)
  const { setConfirmDialog } = useConfirmDialog()

  const activeNightIds = useStore(activeNightIdsStore)
  const activePackage = useStore(mothboxNextPackageStore)
  const night = nights[leafGroupId]

  const availableBotAlgorithms = useMemo(() => {
    const files = activePackage?.loaded?.classificationFiles
    if (!files) return []
    const algSet = new Set<string>()
    for (const file of files) {
      for (const row of file.rows) {
        // Exclude detector model names (end in .pt) — they aren't species-ID algorithms
        if (row.classifier_type === 'bot' && row.classifier_id && !row.classifier_id.endsWith('.pt')) algSet.add(row.classifier_id)
      }
    }
    return [...algSet].sort()
  }, [activePackage])

  // When dataset changes, set default algorithm: prefer the row marked classified_at=1
  // (AMI convention), otherwise fall back to the first valid bot classifier found
  // (Mothbot data, which has only one algorithm and doesn't use the marker).
  useEffect(() => {
    const files = activePackage?.loaded?.classificationFiles
    if (!files) { setSelectedBotAlgorithm(undefined); return }
    let fallback: string | undefined
    for (const file of files) {
      for (const row of file.rows) {
        if (row.classifier_type === 'bot' && row.classifier_id && !row.classifier_id.endsWith('.pt')) {
          if (row.classified_at === 1) {
            setSelectedBotAlgorithm(row.classifier_id)
            return
          }
          fallback ??= row.classifier_id
        }
      }
    }
    setSelectedBotAlgorithm(fallback)
  }, [activePackage])

  // Detector versions — derived from unique detectorId values across all loaded patches.
  const availableDetectorIds = useMemo(() => {
    const ids = new Set<string>()
    for (const patch of Object.values(patches)) {
      if (patch.detectorId) ids.add(patch.detectorId)
    }
    return [...ids].sort()
  }, [activePackage, patches])

  // When the package loads, snapshot all detections so detector switching can
  // restore them without a full reload. Also set the default detector (prefer
  // bot runs over human).
  useEffect(() => {
    allDetectionsRef.current = { ...(detectionsStore.get() || {}) }
    if (availableDetectorIds.length > 1) {
      const defaultDetector = availableDetectorIds.find((id) => id !== 'HumanDetection') ?? availableDetectorIds[0]
      setSelectedDetectorId(defaultDetector)
    } else {
      setSelectedDetectorId(availableDetectorIds[0])
    }
  }, [activePackage])
  const routeContext = useMemo(
    () => ({
      folderName,
      projectId: night?.datasetId ?? '',
      deploymentId: night?.deploymentId ?? '',
      leafGroupId,
      nightName: night?.name ?? leafGroupId,
    }),
    [folderName, night?.datasetId, night?.deploymentId, night?.name, leafGroupId],
  )

  // Reset to single-night view when navigating to a new night
  useEffect(() => {
    setActiveNightIds([leafGroupId])
  }, [leafGroupId])

  useEffect(() => {
    markLeafGroupAsActive({ leafGroupId })
    const activeLeafGroupIds = getActiveLeafGroupIds()
    clearFileObjectsForInactiveLeafGroups({ activeLeafGroupIds })

    return () => {
      const activeLeafGroupIdsAfterUnmount = getActiveLeafGroupIds()
      clearFileObjectsForInactiveLeafGroups({ activeLeafGroupIds: activeLeafGroupIdsAfterUnmount })
    }
  }, [leafGroupId])

  // Sync selection with URL search params (bucket, rank, name)
  const search = router.state.location.search as unknown as {
    bucket?: 'auto' | 'user'
    rank?: 'class' | 'order' | 'family' | 'genus' | 'species'
    name?: string
  }

  useEffect(() => {
    const nextBucket = parseBucketFromSearch({ search })
    if (nextBucket && nextBucket !== selectedBucket) setSelectedBucket(nextBucket)

    const { validRank, name } = parseTaxonFromSearch({ search })

    if (validRank && name) setSelectedTaxon({ rank: validRank, name })
    else setSelectedTaxon(undefined)

    if (nextBucket && validRank && name) {
      expandLeftPanelPathForSelection({
        selectedBucket: nextBucket,
        selectedTaxon: { rank: validRank, name },
        leafGroupIds: activeNightIdsStore.get(),
        detections,
      })
    }
  }, [search, leafGroupId, detections, selectedBucket])

  const fallbackSnapshot = useMemo(() => {
    return buildDefaultFallbackSnapshot({ detections, leafGroupId })
  }, [detections, leafGroupId])

  useEffect(() => {
    hasAppliedDefaultFallbackRef.current = false
  }, [leafGroupId])

  useEffect(() => {
    setSizeThreshold(0)
  }, [leafGroupId])

  useEffect(() => {
    if (hasAppliedDefaultFallbackRef.current) return

    const hasExplicitSearch = !!search?.bucket || !!search?.rank || !!search?.name
    if (hasExplicitSearch) return

    if (selectedBucket !== 'auto') return
    if (selectedTaxon) return
    if (fallbackSnapshot.autoDetectionsCount > 0) return
    if (fallbackSnapshot.userDetectionsCount === 0) return

    hasAppliedDefaultFallbackRef.current = true

    const fallbackTaxon = fallbackSnapshot.hasUserInsecta ? ({ rank: 'class', name: 'Insecta' } as const) : undefined
    setSelectedBucket('user')
    setSelectedTaxon(fallbackTaxon)
    navigateToTaxonSelection({ router, routeContext, taxon: fallbackTaxon, bucket: 'user', singleLeafDataset })
  }, [fallbackSnapshot, search, selectedBucket, selectedTaxon, router, routeContext, singleLeafDataset])

  const list = useMemo(() => {
    return Object.values(patches).filter((patch) => activeNightIds.has(patch.leafGroupId))
  }, [patches, activeNightIds])
  const taxonomyAuto = useMemo(() => buildTaxonomyTreeForLeafGroup({ detections, leafGroupIds: activeNightIds, bucket: 'auto' }), [detections, activeNightIds])
  const taxonomyUser = useMemo(() => buildTaxonomyTreeForLeafGroup({ detections, leafGroupIds: activeNightIds, bucket: 'user' }), [detections, activeNightIds])
  const totalDetections = useMemo(() => Object.values(detections ?? {}).filter((d) => activeNightIds.has(d.leafGroupId)).length, [detections, activeNightIds])
  const totalIdentified = useMemo(
    () => Object.values(detections ?? {}).filter((d) => activeNightIds.has(d.leafGroupId) && (d as any)?.detectedBy === 'user').length,
    [detections, activeNightIds],
  )
  const sizeThresholdMax = useMemo(() => {
    return getMaxDetectionLongestDimension({ patches: list, detections })
  }, [list, detections])
  const clampedSizeThreshold = clampSizeThreshold({ value: sizeThreshold, max: sizeThresholdMax })

  const filtered = useMemo(
    () => filterPatches({ patches: list, detections, selectedTaxon, selectedBucket, sizeThreshold: clampedSizeThreshold }),
    [list, detections, selectedTaxon, selectedBucket, clampedSizeThreshold],
  )
  const totalPatches = list.length
  const selectedCount = useMemo(() => Array.from(selected ?? []).filter((id) => !!id).length, [selected])
  const selectedDetectionIds = useMemo(() => Array.from(selected ?? []), [selected])

  const leafGroupWarnings = useMemo(
    () => computeLeafGroupWarnings({ photos, detections, patches, leafGroupId }),
    [photos, detections, patches, leafGroupId],
  )
  const hasMachineIdentification = useMemo(
    () => Array.from(activeNightIds).some((id) => nightHasMachineIdentification({ photos, detections, leafGroupId: id })),
    [photos, detections, activeNightIds],
  )
  const unassignedCount = useMemo(
    () => Array.from(activeNightIds).reduce((sum, id) => sum + countUnassignedDetectionsForNight({ detections, leafGroupId: id }), 0),
    [detections, activeNightIds],
  )

  function onIdentify() {
    if (selectedCount === 0) return
    ensureSpeciesListSelection({ projectId: night?.datasetId, onReady: () => setIdentifyOpen(true) })
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
    if (activeNightIds.size > 1) {
      selectedPatchIdsStore.set(new Set(allPatchIds))
    } else {
      setSelection({ leafGroupId, patchIds: allPatchIds })
    }
  }

  function onBotAlgorithmChange(algorithm: string) {
    const files = activePackage?.loaded?.classificationFiles
    if (!files) return

    setSelectedBotAlgorithm(algorithm)

    // Filter to only the selected algorithm's bot rows (keep all human rows intact)
    const filteredFiles = files.map((file) => ({
      ...file,
      rows: file.rows.filter((row) => row.classifier_type !== 'bot' || row.classifier_id === algorithm),
    }))

    const flattened = flattenClassificationFiles({ files: filteredFiles })
    const resolvedClassifications = resolveCurrentClassifications({ rows: flattened })
    const classificationByPatch = new Map(resolvedClassifications.map((r) => [r.patch_id, r]))

    const currentDetections = detectionsStore.get() || {}
    const updatedDetections: Record<string, DetectionEntity> = {}

    for (const [patchId, detection] of Object.entries(currentDetections)) {
      const classification = classificationByPatch.get(patchId)
      if (classification) {
        updatedDetections[patchId] = {
          ...detection,
          ...detectionFromClassification({
            row: classification,
            leafGroupId: detection.leafGroupId,
            photoId: detection.photoId,
          }),
          // Preserve geometry fields that come from patchSource, not classification
          direction: detection.direction,
          shapeType: detection.shapeType,
          points: detection.points,
          clusterId: detection.clusterId,
        }
      } else {
        updatedDetections[patchId] = {
          ...detection,
          label: undefined,
          taxon: undefined,
          detectedBy: 'auto',
          botClassifierId: undefined,
          score: undefined,
          classificationType: undefined,
          humanClassifierId: undefined,
          morphospecies: undefined,
        }
      }
    }

    detectionsStore.set(updatedDetections)
    rebuildLeafGroupSummariesFromDetections(updatedDetections)
  }

  function onDetectorChange(detectorId: string) {
    const allDetections = allDetectionsRef.current
    const currentPatches = Object.values(patchesStore.get())
    const detectorPatchIds = new Set(currentPatches.filter((p) => p.detectorId === detectorId).map((p) => p.id))
    const filtered = Object.fromEntries(Object.entries(allDetections).filter(([id]) => detectorPatchIds.has(id)))
    detectionsStore.set(filtered)
    rebuildLeafGroupSummariesFromDetections(filtered)
    setSelectedDetectorId(detectorId)
    setSelectedBotAlgorithm(undefined)
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
      <LeafGroupLeftPanel
        leafGroupId={leafGroupId}
        hasMachineIdentification={hasMachineIdentification}
        unassignedCount={unassignedCount}
        taxonomyAuto={taxonomyAuto}
        taxonomyUser={taxonomyUser}
        totalPatches={totalPatches}
        totalDetections={totalDetections}
        totalIdentified={totalIdentified}
        sizeThreshold={clampedSizeThreshold}
        sizeThresholdMax={sizeThresholdMax}
        warnings={leafGroupWarnings}
        sortByClusters={sortByClusters}
        onSizeThresholdChange={(value) => setSizeThreshold(clampSizeThreshold({ value, max: sizeThresholdMax }))}
        onSortByClustersChange={setSortByClusters}
        availableDetectorIds={availableDetectorIds.length > 1 ? availableDetectorIds : undefined}
        selectedDetectorId={selectedDetectorId}
        onDetectorChange={onDetectorChange}
        availableBotAlgorithms={availableBotAlgorithms.length > 0 ? availableBotAlgorithms : undefined}
        selectedBotAlgorithm={selectedBotAlgorithm}
        onBotAlgorithmChange={onBotAlgorithmChange}
        selectedTaxon={selectedTaxon as any}
        selectedBucket={selectedBucket}
        onSelectTaxon={({ taxon, bucket }) => {
          setSelectedTaxon(taxon as any)
          setSelectedBucket(bucket)
          navigateToTaxonSelection({ router, routeContext, taxon, bucket, singleLeafDataset })
        }}
        className='w-[300px] overflow-y-auto'
      />
      <div className='relative flex-1 min-h-0 overflow-hidden'>
        <PatchGrid
          patches={filtered}
          leafGroupId={leafGroupId}
          className='h-full'
          onOpenPatchDetail={onOpenPatchDetail}
          selectedTaxon={selectedTaxon as any}
          selectedBucket={selectedBucket}
          sortByClusters={sortByClusters}
          hasMachineIdentification={hasMachineIdentification}
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
        datasetId={night?.datasetId}
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

function buildTaxonomyTreeForLeafGroup(params: { detections: Record<string, any>; leafGroupIds: Set<string>; bucket: 'auto' | 'user' }) {
  const { detections, leafGroupIds, bucket } = params
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
    if (!leafGroupIds.has((d as any)?.leafGroupId)) continue
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
      matches = matchesSpeciesName({ taxon: tax, morphospecies, searchName: selectedTaxon.name })
    }
    if (!matches) return false
    if (!selectedBucket) return true
    const detectedBy = det?.detectedBy === 'user' ? 'user' : 'auto'
    return detectedBy === selectedBucket
  })
  return result
}

function filterPatches(params: {
  patches: PatchEntity[]
  detections: Record<string, DetectionEntity>
  selectedTaxon: TaxonSelection
  selectedBucket?: 'auto' | 'user'
  sizeThreshold: number
}) {
  const { patches, detections, selectedTaxon, selectedBucket, sizeThreshold } = params
  const taxonFilteredPatches = filterPatchesByTaxon({ patches, detections, selectedTaxon, selectedBucket })
  if (sizeThreshold <= 0) return taxonFilteredPatches

  const result = taxonFilteredPatches.filter((patch) => {
    const detection = detections?.[patch.id]
    const longestDimension = computeDetectionLongestDimension({ detection })
    return longestDimension >= sizeThreshold
  })
  return result
}

function getMaxDetectionLongestDimension(params: { patches: PatchEntity[]; detections: Record<string, DetectionEntity> }) {
  const { patches, detections } = params
  let maxLongestDimension = 0

  for (const patch of patches) {
    const detection = detections?.[patch.id]
    const longestDimension = computeDetectionLongestDimension({ detection })
    if (longestDimension > maxLongestDimension) maxLongestDimension = longestDimension
  }

  const result = Math.ceil(maxLongestDimension)
  return result
}

function clampSizeThreshold(params: { value: number; max: number }) {
  const { value, max } = params
  const result = Math.max(0, Math.min(value, max))
  return result
}

function expandLeftPanelPathForSelection(params: {
  selectedBucket?: 'auto' | 'user'
  selectedTaxon?: TaxonSelection
  leafGroupIds: Set<string>
  detections: Record<string, DetectionEntity>
}) {
  const { selectedBucket, selectedTaxon, leafGroupIds, detections } = params
  if (!selectedBucket || !selectedTaxon) return
  if (selectedTaxon.rank === 'class') return

  let match: DetectionEntity | undefined
  for (const d of Object.values(detections || {})) {
    const det = d as DetectionEntity
    if (!leafGroupIds.has((det as any)?.leafGroupId)) continue
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
    if (genusName) {
      // Build the collapse key to match GenusNode: order/family/genus when all present,
      // order/genus when family absent, or just genus when both are absent (StandaloneGenusNode).
      const genusPath =
        orderName && familyName
          ? `${orderName}/${familyName}/${genusName}`
          : orderName
            ? `${orderName}/${genusName}`
            : genusName
      keys.push(makeKey({ bucket: selectedBucket, rank: 'genus', path: genusPath }))
    }
  } else if (selectedTaxon.rank === 'species') {
    const orderName = selectedBucket === 'user' ? t?.order || UNASSIGNED_LABEL : t?.order
    const familyName = selectedBucket === 'user' ? t?.family || UNASSIGNED_LABEL : t?.family
    const genusName = selectedBucket === 'user' ? t?.genus || UNASSIGNED_LABEL : t?.genus
    if (orderName) keys.push(makeKey({ bucket: selectedBucket, rank: 'order', path: orderName }))
    if (orderName && familyName) keys.push(makeKey({ bucket: selectedBucket, rank: 'family', path: `${orderName}/${familyName}` }))
    if (genusName) {
      const genusPath =
        orderName && familyName
          ? `${orderName}/${familyName}/${genusName}`
          : orderName
            ? `${orderName}/${genusName}`
            : genusName
      keys.push(makeKey({ bucket: selectedBucket, rank: 'genus', path: genusPath }))
    }
  }

  if (keys.length) expandMany(keys)
}

function parseBucketFromSearch(params: {
  search?: { bucket?: 'auto' | 'user'; rank?: string; name?: string }
}): 'auto' | 'user' | undefined {
  const { search } = params
  return search?.bucket === 'user' || search?.bucket === 'auto' ? search.bucket : undefined
}

function parseTaxonFromSearch(params: { search?: { bucket?: 'auto' | 'user'; rank?: string; name?: string } }): {
  validRank: 'class' | 'order' | 'family' | 'genus' | 'species' | undefined
  name: string
} {
  const { search } = params
  const rank = search?.rank
  const name = (search?.name ?? '').trim()
  const validRank =
    rank === 'class' || rank === 'order' || rank === 'family' || rank === 'genus' || rank === 'species'
      ? (rank as 'class' | 'order' | 'family' | 'genus' | 'species')
      : undefined
  return { validRank, name }
}

function navigateToTaxonSelection(params: {
  router: ReturnType<typeof useRouter>
  routeContext: {
    folderName?: string | null
    projectId: string
    deploymentId: string
    leafGroupId: string
    nightName: string
  }
  taxon?: TaxonSelection
  bucket: 'auto' | 'user'
  singleLeafDataset?: boolean
}) {
  const { router, routeContext, taxon, bucket, singleLeafDataset } = params
  const search: { bucket?: 'auto' | 'user'; rank?: 'class' | 'order' | 'family' | 'genus' | 'species'; name?: string } = {
    bucket,
  }

  if (taxon) {
    search.rank = taxon.rank
    search.name = taxon.name
  }

  const link = buildLeafGroupLinkParams({
    folderName: routeContext.folderName,
    projectId: routeContext.projectId,
    deploymentId: routeContext.deploymentId,
    night: { id: routeContext.leafGroupId, name: routeContext.nightName },
    singleLeafDataset,
  })

  router.navigate({
    to: link.to,
    params: link.params,
    search,
  })
}

function computeLeafGroupWarnings(params: {
  photos: Record<string, any>
  detections: Record<string, DetectionEntity>
  patches: Record<string, PatchEntity>
  leafGroupId: string
}) {
  const { photos, detections, patches, leafGroupId } = params
  let jsonWithoutPhotoCount = 0
  let missingPatchImageCount = 0

  for (const photo of Object.values(photos ?? {})) {
    if ((photo as any)?.leafGroupId !== leafGroupId) continue
    const hasJson = !!(photo as any)?.botDetectionFile
    const hasImage = !!(photo as any)?.imageFile
    if (hasJson && !hasImage) jsonWithoutPhotoCount++
  }

  for (const detection of Object.values(detections ?? {})) {
    if ((detection as any)?.leafGroupId !== leafGroupId) continue
    const patchId = (detection as any)?.patchId
    const patch = patches?.[patchId]
    const hasPatchImage = !!patch?.imageFile
    if (!hasPatchImage) missingPatchImageCount++
  }

  return { jsonWithoutPhotoCount, missingPatchImageCount }
}

function matchesSpeciesName(params: { taxon?: { species?: string }; morphospecies?: string; searchName: string }) {
  const { taxon, morphospecies, searchName } = params
  if (taxon?.species && taxon.species === searchName) return true
  if (morphospecies && normalizeMorphoKey(morphospecies) === normalizeMorphoKey(searchName)) return true
  return false
}

function buildDefaultFallbackSnapshot(params: {
  detections: Record<string, DetectionEntity>
  leafGroupId: string
}) {
  const { detections, leafGroupId } = params
  let autoDetectionsCount = 0
  let userDetectionsCount = 0
  let hasUserInsecta = false

  for (const detection of Object.values(detections ?? {})) {
    if (detection?.leafGroupId !== leafGroupId) continue
    if (detection?.detectedBy === 'user') {
      userDetectionsCount++
      if (detection?.taxon?.class === 'Insecta') hasUserInsecta = true
      continue
    }
    autoDetectionsCount++
  }

  return { autoDetectionsCount, userDetectionsCount, hasUserInsecta }
}
