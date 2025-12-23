import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/components/ui/command'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'
import { searchSpecies } from './species-search'
import { TaxonRecord, speciesListsLoadingStore } from './species-list.store'

import { useStore } from '@nanostores/react'
import { DialogTitle } from '@radix-ui/react-dialog'
import { TaxonRankBadge, TaxonRankLetterBadge } from '~/components/taxon-rank-badge'
import { detectionsStore, type DetectionEntity } from '~/stores/entities/detections'
import { Column } from '~/styles'
import { deriveTaxonNameFromDetection } from '~/models/taxonomy/extract'
import { openGlobalDialog } from '~/components/dialogs/global-dialog'
import { TaxonKeyDialogContent } from './taxon-key-dialog'
import { useConfirmDialog } from '~/components/dialogs/ConfirmDialog'
import { detectMissingRanks } from '~/models/taxonomy/rank'
import { TaxonomyGapFillDialogContent } from './taxonomy-gap-fill-dialog'
import { CenteredLoader } from '~/components/atomic/CenteredLoader'

const MAX_SPECIES_UI_RESULTS = 50

export type IdentifyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (label: string, taxon?: TaxonRecord) => void
  projectId?: string
  detectionIds?: string[]
}

export function IdentifyDialog(props: IdentifyDialogProps) {
  const { open, onOpenChange, onSubmit, projectId, detectionIds } = props

  const [query, setQuery] = useState('')
  const selection = useStore(projectSpeciesSelectionStore)
  const detections = useStore(detectionsStore)
  const isSpeciesLoading = useStore(speciesListsLoadingStore)
  const listRef = useRef<HTMLDivElement>(null)
  const { setConfirmDialog } = useConfirmDialog()

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  useLayoutEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [query])

  useEffect(() => {
    if (!listRef.current) return

    // Double-check scroll position after React has finished rendering
    // This catches any cmdk internal scrolling that happens after layout
    const timeoutId = setTimeout(() => {
      if (listRef.current && listRef.current.scrollTop !== 0) {
        listRef.current.scrollTop = 0
      }
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [query])

  const speciesOptions = useMemo(() => {
    const res = getSpeciesOptions({ selection, projectId, query })
    return res
  }, [selection, projectId, query])

  const speciesOptionsLimited = useMemo(() => {
    const list = speciesOptions || []
    const limited = limitOptions(list)
    return limited
  }, [speciesOptions, query])

  const recentOptions = useMemo(() => {
    return getRecentOptions({ detections })
  }, [detections])

  const filteredRecentOptions = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    if (!q) return recentOptions
    return (recentOptions || []).filter((r) => (r?.label || '').toLowerCase().includes(q))
  }, [recentOptions, query])

  const morphoOptions = useMemo(() => {
    return getMorphoOptions({ detections, projectId, query })
  }, [detections, projectId, query])

  const morphoOptionsLimited = useMemo(() => {
    return limitOptions(morphoOptions || [])
  }, [morphoOptions])

  function handleSelect(label: string) {
    const value = (label ?? '').trim()
    if (!value) return
    logIdentificationResult({ detectionIds, label: value })
    onSubmit(value)
    onOpenChange(false)
  }

  function handleSelectRecentTaxon(t: TaxonRecord) {
    if (!t) return
    const preferred = (t?.scientificName ?? '').trim()
    const label = preferred || getDisplayLabelForTaxon(t)
    if (!label) return

    logIdentificationResult({ detectionIds, label, taxon: t })
    onSubmit(label, t)
    onOpenChange(false)
  }

  function handleSelectTaxon(t: TaxonRecord) {
    if (!t) return
    const preferred = (t?.scientificName ?? '').trim()
    const label = preferred || getDisplayLabelForTaxon(t)
    if (!label) return

    const missingRanks = detectMissingRanks(t)
    if (missingRanks.length > 0) {
      const existingTaxon = getExistingTaxonFromDetections({ detectionIds, detections })
      onOpenChange(false)
      openTaxonomyGapFillDialog({
        taxon: t,
        missingRanks,
        existingTaxon,
        onSubmit: (filledTaxon) => {
          const filledLabel = (filledTaxon?.scientificName ?? '').trim() || getDisplayLabelForTaxon(filledTaxon)
          logIdentificationResult({ detectionIds, label: filledLabel, taxon: filledTaxon })
          onSubmit(filledLabel, filledTaxon)
        },
        onSkip: () => {
          logIdentificationResult({ detectionIds, label, taxon: t })
          onSubmit(label, t)
        },
      })
      return
    }

    logIdentificationResult({ detectionIds, label, taxon: t })
    onSubmit(label, t)
    onOpenChange(false)
  }

  function handleSubmitFreeText() {
    const value = query.trim()
    if (!value) return
    logIdentificationResult({ detectionIds, label: value })
    onSubmit(value)
    onOpenChange(false)
  }

  function finalizeTaxonIdentification(partialTaxon: TaxonRecord, taxonID: string | number | undefined) {
    const completeTaxon: TaxonRecord = {
      ...partialTaxon,
      ...(taxonID !== undefined && { taxonID }),
    }
    handleSelectTaxon(completeTaxon)
  }

  function handleSubmitClass() {
    const value = (query ?? '').trim()
    if (!value) return
    const partialTaxon: TaxonRecord = { scientificName: value, taxonRank: 'class', class: value }
    openTaxonKeyDialog({ partialTaxon, onConfirm: (taxonID) => finalizeTaxonIdentification(partialTaxon, taxonID) })
  }

  function handleSubmitOrder() {
    const value = (query ?? '').trim()
    if (!value) return
    const partialTaxon: TaxonRecord = { scientificName: value, taxonRank: 'order', order: value }
    openTaxonKeyDialog({
      partialTaxon,
      onConfirm: (taxonID) => {
        finalizeTaxonIdentification(partialTaxon, taxonID)
      },
    })
  }

  function handleSubmitGenus() {
    const value = (query ?? '').trim()
    if (!value) return
    const partialTaxon: TaxonRecord = { scientificName: value, taxonRank: 'genus', genus: value }
    openTaxonKeyDialog({ partialTaxon, onConfirm: (taxonID) => finalizeTaxonIdentification(partialTaxon, taxonID) })
  }

  function handleSubmitFamily() {
    const value = (query ?? '').trim()
    if (!value) return
    const partialTaxon: TaxonRecord = { scientificName: value, taxonRank: 'family', family: value }
    openTaxonKeyDialog({ partialTaxon, onConfirm: (taxonID) => finalizeTaxonIdentification(partialTaxon, taxonID) })
  }

  function submitRankWithParentValidation(params: {
    value: string
    rank: 'tribe' | 'subfamily' | 'suborder'
    requiredParentRank: 'order' | 'family'
    parentRankLabel: string
  }) {
    const { value, rank, requiredParentRank, parentRankLabel } = params

    const hasParent = checkParentRankExists({ detectionIds, detections, requiredRank: requiredParentRank })
    if (!hasParent) {
      showParentRankMissingDialog({ setConfirmDialog, parentRankLabel })
      return
    }

    const partialTaxon: TaxonRecord = { scientificName: value, taxonRank: rank }
    logIdentificationResult({ detectionIds, label: value, taxon: partialTaxon })
    onSubmit(value, partialTaxon)
    onOpenChange(false)
  }

  function handleSubmitTribe() {
    const value = (query ?? '').trim()
    if (!value) return
    submitRankWithParentValidation({
      value,
      rank: 'tribe',
      requiredParentRank: 'family',
      parentRankLabel: 'family',
    })
  }

  function handleSubmitSubfamily() {
    const value = (query ?? '').trim()
    if (!value) return
    submitRankWithParentValidation({
      value,
      rank: 'subfamily',
      requiredParentRank: 'family',
      parentRankLabel: 'family',
    })
  }

  function handleSubmitSuborder() {
    const value = (query ?? '').trim()
    if (!value) return
    submitRankWithParentValidation({
      value,
      rank: 'suborder',
      requiredParentRank: 'order',
      parentRankLabel: 'order',
    })
  }

  function handleSubmitSpecies() {
    const value = (query ?? '').trim()
    if (!value) return
    const partialTaxon: TaxonRecord = { scientificName: value, taxonRank: 'species', species: value }
    openTaxonKeyDialog({ partialTaxon, onConfirm: (taxonID) => finalizeTaxonIdentification(partialTaxon, taxonID) })
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} className='max-w-[520px] !p-0'>
      <DialogTitle className='hidden'>Identitfy</DialogTitle>
      {isSpeciesLoading ? (
        <div className='p-40'>
          <CenteredLoader>🌀 Loading species lists…</CenteredLoader>
        </div>
      ) : (
        <Command shouldFilter={false}>
          <CommandInput
            placeholder='Type a label (species, genus, family, ...)'
            value={query}
            onValueChange={setQuery as any}
            withSearchIcon
            onKeyDown={(e: any) => {
              const hasAnyResults = (speciesOptions?.length ?? 0) > 0
              if (e.key === 'Enter' && query.trim() && !hasAnyResults) {
                e.preventDefault()
                handleSubmitFreeText()
              }
            }}
          ></CommandInput>
          <CommandList ref={listRef}>
            <CommandEmpty>No matches. Press Enter to use your text.</CommandEmpty>

            {query.trim().toUpperCase() === 'ERROR' ? (
              <CommandGroup heading='Actions'>
                <CommandItem onSelect={() => handleSelect('ERROR')}>
                  <div className='flex items-center justify-between w-full'>
                    <span className='text-13 text-red-700'>ERROR</span>
                    <span className='text-11 text-neutral-500'>Mark as error</span>
                  </div>
                </CommandItem>
              </CommandGroup>
            ) : null}

            {(!query.trim() && recentOptions.length > 0) || (query.trim() && filteredRecentOptions.length > 0) ? (
              <CommandGroup heading='Recent'>
                {(query.trim() ? filteredRecentOptions : recentOptions).map((r) => (
                  <SpeciesOptionRow
                    key={r.label}
                    label={r.label}
                    taxon={r.taxon}
                    isMorphospecies={r.isMorphospecies}
                    onSelect={() => (r.taxon ? handleSelectRecentTaxon(r.taxon) : handleSelect(r.label))}
                    subtitleClassName='text-11 text-neutral-500 flex items-center gap-4'
                  />
                ))}
              </CommandGroup>
            ) : null}

            {morphoOptionsLimited?.length ? (
              <CommandGroup heading='Morphospecies'>
                {morphoOptionsLimited.map((r) => (
                  <SpeciesOptionRow
                    key={'morpho:' + r.label}
                    label={r.label}
                    taxon={r.taxon}
                    onSelect={() => handleSelect(r.label)}
                    itemClassName='row gap-x-8 !py-8'
                  />
                ))}
              </CommandGroup>
            ) : null}

            {speciesOptionsLimited?.length ? (
              <CommandGroup heading='Species'>
                {speciesOptionsLimited.map((t) => (
                  <SpeciesOptionRow
                    key={(t.taxonID as any) ?? t.scientificName}
                    label={getDisplayLabelForTaxon(t)}
                    taxon={t}
                    onSelect={() => handleSelectTaxon(t)}
                    itemClassName='row gap-x-8 !py-8'
                  />
                ))}
              </CommandGroup>
            ) : null}

            {query && (
              <CommandGroup>
                <CommandItem key='morphospecies' onSelect={() => handleSubmitFreeText()} className='aria-selected:bg-brand/20 '>
                  <span className={`${rankToTextClass('morphospecies')} font-medium flex items-center gap-8`}>
                    <TaxonRankLetterBadge rank='morphospecies' size='xsm' />
                    Add morpho species: "{query}"
                  </span>
                </CommandItem>

                <CommandItem key='species' onSelect={() => handleSubmitSpecies()} className='aria-selected:bg-brand/20 '>
                  <span className={`${rankToTextClass('species')} font-medium flex items-center gap-8`}>
                    <TaxonRankLetterBadge rank='species' size='xsm' />
                    Add Species "{query}"
                  </span>
                </CommandItem>

                <CommandItem key='genus' onSelect={() => handleSubmitGenus()} className='aria-selected:bg-brand/20 '>
                  <span className={`${rankToTextClass('genus')} font-medium flex items-center gap-8`}>
                    <TaxonRankLetterBadge rank='genus' size='xsm' />
                    Add Genus "{query}"
                  </span>
                </CommandItem>

                <CommandItem key='tribe' onSelect={() => handleSubmitTribe()} className='aria-selected:bg-brand/20 '>
                  <span className={`${rankToTextClass('tribe')} font-medium flex items-center gap-8`}>
                    <TaxonRankLetterBadge rank='tribe' size='xsm' />
                    Add Tribe "{query}"
                  </span>
                </CommandItem>

                <CommandItem key='subfamily' onSelect={() => handleSubmitSubfamily()} className='aria-selected:bg-brand/20 '>
                  <span className={`${rankToTextClass('subfamily')} font-medium flex items-center gap-8`}>
                    <TaxonRankLetterBadge rank='subfamily' size='xsm' />
                    Add Subfamily "{query}"
                  </span>
                </CommandItem>

                <CommandItem key='family' onSelect={() => handleSubmitFamily()} className='aria-selected:bg-brand/20 '>
                  <span className={`${rankToTextClass('family')} font-medium flex items-center gap-8`}>
                    <TaxonRankLetterBadge rank='family' size='xsm' />
                    Add Family "{query}"
                  </span>
                </CommandItem>

                <CommandItem key='order' onSelect={() => handleSubmitOrder()} className='aria-selected:bg-brand/20 '>
                  <span className={`${rankToTextClass('order')} font-medium flex items-center gap-8`}>
                    <TaxonRankLetterBadge rank='order' size='xsm' />
                    Add Order "{query}"
                  </span>
                </CommandItem>

                <CommandItem key='suborder' onSelect={() => handleSubmitSuborder()} className='aria-selected:bg-brand/20 '>
                  <span className={`${rankToTextClass('suborder')} font-medium flex items-center gap-8`}>
                    <TaxonRankLetterBadge rank='suborder' size='xsm' />
                    Add Suborder "{query}"
                  </span>
                </CommandItem>

                <CommandItem key='class' onSelect={() => handleSubmitClass()} className='aria-selected:bg-brand/20 '>
                  <span className={`${rankToTextClass('class')} font-medium flex items-center gap-8`}>
                    <TaxonRankLetterBadge rank='class' size='xsm' />
                    Add Class "{query}"
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {/* No legacy suggestions rendered */}
          </CommandList>
        </Command>
      )}
    </CommandDialog>
  )
}

type RankLettersInlineProps = {
  taxon?: TaxonRecord
}

function RankLettersInline(props: RankLettersInlineProps) {
  const { taxon } = props

  const ranks: string[] = []

  if (taxon?.genus) ranks.push('genus')
  if (taxon?.family) ranks.push('family')
  if (taxon?.order) ranks.push('order')

  if (!ranks.length) return null

  return (
    <span className='flex items-center gap-4'>
      {ranks.map((r) => (
        <TaxonRankLetterBadge key={r} rank={r} size='xsm' />
      ))}
    </span>
  )
}

type SpeciesOptionRowProps = {
  label: string
  taxon?: TaxonRecord
  isMorphospecies?: boolean
  onSelect: () => void
  itemClassName?: string
  subtitleClassName?: string
}

function SpeciesOptionRow(props: SpeciesOptionRowProps) {
  const { label, taxon, isMorphospecies, onSelect, itemClassName, subtitleClassName } = props

  const rankToShow = isMorphospecies ? 'morphospecies' : taxon?.taxonRank

  return (
    <CommandItem onSelect={onSelect} className={itemClassName}>
      <Column className='gap-0 flex-1'>
        <span className='text-14 line-clamp-1'>{label}</span>
        {taxon && (
          <span className={subtitleClassName ?? 'text-11 text-ink-secondary flex items-center gap-4'}>
            <RankLettersInline taxon={taxon} />
            {taxon.vernacularName || [taxon.genus, taxon.family, taxon.order].filter(Boolean).join(' • ')}
          </span>
        )}
      </Column>

      {rankToShow && <TaxonRankBadge rank={rankToShow} />}
    </CommandItem>
  )
}

function getDisplayLabelForTaxon(t: TaxonRecord) {
  const rank = (t?.taxonRank ?? '').toLowerCase()
  if (rank === 'species') return t.species || t.scientificName
  if (rank === 'genus') return t.genus || t.scientificName
  if (rank === 'family') return t.family || t.scientificName
  if (rank === 'order') return t.order || t.scientificName
  if (rank === 'class') return (t as any)?.class || t.scientificName
  if (rank === 'phylum') return t.phylum || t.scientificName
  if (rank === 'kingdom') return t.kingdom || t.scientificName
  return t.scientificName || t.species || t.genus || t.family || t.order || t.phylum || t.kingdom || ''
}

// Helpers (atomic) — keep at bottom

function limitOptions<T>(list: T[]): T[] {
  return list.slice(0, MAX_SPECIES_UI_RESULTS)
}

type OpenTaxonKeyDialogParams = {
  partialTaxon: TaxonRecord
  onConfirm: (taxonID: string | number) => void
}

function openTaxonKeyDialog(params: OpenTaxonKeyDialogParams) {
  const { partialTaxon, onConfirm } = params
  openGlobalDialog({
    component: TaxonKeyDialogContent as any,
    props: {
      taxon: partialTaxon,
      onConfirm,
    },
    align: 'center',
  })
}

type OpenTaxonomyGapFillDialogParams = {
  taxon: TaxonRecord
  missingRanks: Array<{ rank: string; missingName: boolean; missingId: boolean }>
  existingTaxon?: TaxonRecord
  onSubmit: (filledTaxon: TaxonRecord) => void
  onSkip: () => void
}

function openTaxonomyGapFillDialog(params: OpenTaxonomyGapFillDialogParams) {
  const { taxon, missingRanks, existingTaxon, onSubmit, onSkip } = params
  openGlobalDialog({
    component: TaxonomyGapFillDialogContent as any,
    props: {
      taxon,
      missingRanks,
      existingTaxon,
      onSubmit,
      onSkip,
    },
    align: 'center',
  })
}

type GetExistingTaxonFromDetectionsParams = {
  detectionIds?: string[]
  detections?: Record<string, DetectionEntity>
}

function getExistingTaxonFromDetections(params: GetExistingTaxonFromDetectionsParams): TaxonRecord | undefined {
  const { detectionIds, detections } = params
  if (!detectionIds || detectionIds.length === 0) return undefined
  if (!detections) return undefined

  for (const id of detectionIds) {
    const detection = detections[id]
    if (!detection?.taxon) continue
    return detection.taxon
  }

  return undefined
}

type ShowParentRankMissingDialogParams = {
  setConfirmDialog: (dialog: any) => void
  parentRankLabel: string
}

function showParentRankMissingDialog(params: ShowParentRankMissingDialogParams) {
  const { setConfirmDialog, parentRankLabel } = params
  const article = parentRankLabel === 'order' ? 'an' : 'a'
  setConfirmDialog({
    content: `You need to add ${article} ${parentRankLabel} first: OK`,
    confirmText: 'OK',
    onConfirm: () => {},
    closeAfterConfirm: true,
  })
}

function buildStableKeyForTaxon(taxon: TaxonRecord): string {
  const parts: string[] = []
  const kingdom = String(taxon?.kingdom ?? '')
    .trim()
    .toLowerCase()
  if (!kingdom) return ''
  parts.push(kingdom)

  const rank = String(taxon?.taxonRank ?? '')
    .trim()
    .toLowerCase()
  if (rank === 'kingdom') return parts.join(':')

  const phylum = String(taxon?.phylum ?? '')
    .trim()
    .toLowerCase()
  if (phylum) parts.push(phylum)
  if (rank === 'phylum') return parts.join(':')

  const className = String(taxon?.class ?? '')
    .trim()
    .toLowerCase()
  if (className) parts.push(className)
  if (rank === 'class') return parts.join(':')

  const order = String(taxon?.order ?? '')
    .trim()
    .toLowerCase()
  if (order) parts.push(order)
  if (rank === 'order') return parts.join(':')

  const family = String(taxon?.family ?? '')
    .trim()
    .toLowerCase()
  if (family) parts.push(family)
  if (rank === 'family') return parts.join(':')

  const genus = String(taxon?.genus ?? '')
    .trim()
    .toLowerCase()
  if (genus) parts.push(genus)
  if (rank === 'genus') return parts.join(':')

  const species = String(taxon?.species ?? '')
    .trim()
    .toLowerCase()
  if (species) parts.push(species)
  if (rank === 'species') return parts.join(':')

  return parts.join(':')
}

type CheckParentRankExistsParams = {
  detectionIds?: string[]
  detections?: Record<string, DetectionEntity>
  requiredRank: 'order' | 'family'
}

function checkParentRankExists(params: CheckParentRankExistsParams) {
  const { detectionIds, detections, requiredRank } = params

  if (!detectionIds || detectionIds.length === 0) return false
  if (!detections) return false

  for (const id of detectionIds) {
    const detection = detections[id]
    if (!detection) continue

    const taxon = detection.taxon
    if (!taxon) continue

    if (requiredRank === 'order' && taxon.order) return true
    if (requiredRank === 'family' && taxon.family) return true
  }

  return false
}

type LogIdentificationResultParams = {
  detectionIds?: string[]
  label?: string
  taxon?: TaxonRecord
}

function logIdentificationResult(params: LogIdentificationResultParams) {
  const { detectionIds, label, taxon } = params
  if (!detectionIds || detectionIds.length === 0) return

  const prevState = detectionsStore.get() || {}
  const prevEntities = detectionIds.map((id) => prevState?.[id]).filter(Boolean) as DetectionEntity[]

  // Use setTimeout to ensure store has been updated after onSubmit callback
  setTimeout(() => {
    const updated = detectionsStore.get() || {}
    const identifiedEntities = detectionIds.map((id) => updated?.[id]).filter(Boolean) as DetectionEntity[]

    if (identifiedEntities.length > 0) {
      console.log('✅ identify: stored entities', {
        count: identifiedEntities.length,
        action: { label, taxon },
        prevEntities: prevEntities.map((e) => e?.taxon),
        identifiedEntities: identifiedEntities.map((e) => e?.taxon),
      })
    }
  }, 0)
}

type GetSpeciesOptionsParams = {
  selection?: Record<string, string>
  projectId?: string
  query: string
}

function getSpeciesOptions(params: GetSpeciesOptionsParams) {
  const { selection, projectId, query } = params

  const listId = projectId ? selection?.[projectId] : undefined
  if (!listId) {
    return []
  }

  return searchSpecies({ speciesListId: listId, query, limit: 20 })
}

type GetRecentOptionsParams = {
  detections?: Record<string, DetectionEntity>
}

function getRecentOptions(params: GetRecentOptionsParams) {
  const { detections } = params

  const all = Object.values(detections ?? {})
    .filter(
      (d: DetectionEntity | undefined) => d?.detectedBy === 'user' && (!!d?.taxon?.scientificName || !!d?.label || !!d?.morphospecies),
    )
    .sort((a, b) => ((b?.identifiedAt ?? 0) as number) - ((a?.identifiedAt ?? 0) as number))

  const unique: Array<{ label: string; taxon?: TaxonRecord; isMorphospecies?: boolean }> = []
  const seen = new Set<string>()
  for (const d of all) {
    if (!d) continue
    const text = deriveTaxonNameFromDetection({ detection: d }).trim()
    const key = text.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push({ label: text, taxon: d?.taxon, isMorphospecies: !!d?.morphospecies })
    if (unique.length >= 10) break
  }

  return unique
}

function rankToTextClass(rank?: string | null) {
  const value = (rank ?? '').toString().trim().toLowerCase()
  if (value === 'kingdom') return 'text-ink-primary'
  if (value === 'phylum') return 'text-ink-primary'
  if (value === 'class') return 'text-orange-700'
  if (value === 'order') return 'text-yellow-700'
  if (value === 'suborder') return 'text-yellow-700' // skip gbif keys
  if (value === 'genus') return 'text-teal-700'
  if (value === 'family') return 'text-green-700'
  if (value === 'subfamily') return 'text-green-700' // skip gbif keys
  if (value === 'tribe') return 'text-teal-700' // skip gbif keys
  if (value === 'species') return 'text-blue-700'
  if (value === 'morphospecies') return 'text-indigo-700'
  return 'text-brand'
}

type GetMorphoOptionsParams = {
  detections?: Record<string, DetectionEntity>
  projectId?: string
  query: string
}

function getMorphoOptions(params: GetMorphoOptionsParams) {
  const { detections, projectId, query } = params

  const q = (query ?? '').trim().toLowerCase()
  const map = new Map<string, { label: string; taxon?: TaxonRecord; count: number; last: number }>()

  for (const d of Object.values(detections ?? {})) {
    const det = d as DetectionEntity | undefined
    if (!det) continue
    if (det.detectedBy !== 'user') continue
    const nightId = (det.nightId ?? '').trim()
    if (projectId && nightId && !nightId.startsWith(projectId + '/')) continue
    const raw = typeof det.morphospecies === 'string' ? det.morphospecies : ''
    const label = (raw ?? '').trim()
    if (!label) continue
    if (q && !label.toLowerCase().includes(q)) continue
    const key = label.toLowerCase()
    const prev = map.get(key)
    const count = (prev?.count ?? 0) + 1
    const last = Math.max(prev?.last ?? 0, det.identifiedAt ?? 0)
    const taxon = prev?.taxon || det.taxon
    map.set(key, { label, taxon, count, last })
  }

  return Array.from(map.values())
    .sort((a, b) => b.last - a.last || b.count - a.count || a.label.localeCompare(b.label))
    .map((it) => ({ label: it.label, taxon: it.taxon }))
}
