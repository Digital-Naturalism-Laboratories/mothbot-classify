import fuzzysort from 'fuzzysort'
import { speciesListsStore, type SpeciesList } from './species-list.store'
import { stableTaxonKey, dedupeByTaxonKey } from '~/models/taxonomy/keys'
import type { TaxonRecord } from '~/models/taxonomy/types'

export function invalidateSpeciesIndexForListId(listId: string) {
  if (!listId) return
  delete speciesIndexCache[listId]
  delete speciesExactIndexCache[listId]
  delete largeListIndexCache[listId]
}

type SpeciesIndexItem = { ref: TaxonRecord; search: any }
const speciesIndexCache: Record<string, SpeciesIndexItem[] | undefined> = {}
const speciesExactIndexCache: Record<string, Record<string, TaxonRecord[]> | undefined> = {}

/**
 * Above this many taxa (the ~790k-taxon worldwide insect list) fuzzysort's
 * prepared index runs the tab out of memory, so large lists use a compact
 * substring index instead: no typo tolerance from fuzzysort (the approximate
 * fallback below still catches misspellings), but a few MB rather than GBs.
 */
export const LARGE_SPECIES_LIST = 150_000

type LargeListIndex = { names: string[]; refs: TaxonRecord[] }
const largeListIndexCache: Record<string, LargeListIndex | undefined> = {}

const OWN_RANK_ORDER = ['species', 'genus', 'family', 'order', 'class', 'phylum', 'kingdom'] as const

/** A record's own name at its own rank (the species for a species record, etc.). */
function ownRankName(r: TaxonRecord): string {
  const rank = (r?.taxonRank ?? '').toLowerCase() as (typeof OWN_RANK_ORDER)[number]
  const own = OWN_RANK_ORDER.includes(rank) ? (r as any)?.[rank] : undefined
  return String(own || r?.scientificName || '')
}

function ensureLargeListIndex(list: SpeciesList): LargeListIndex {
  const cached = largeListIndexCache[list.id]
  if (cached) return cached

  const names: string[] = []
  const refs: TaxonRecord[] = []
  const exactIndex: Record<string, TaxonRecord[]> = {}
  for (const r of list.records) {
    const isUnranked = (r?.taxonRank ?? '').toLowerCase() === 'unranked'
    const status = (r?.taxonomicStatus ?? '').toLowerCase()
    if (isUnranked || (status && status !== 'accepted')) continue
    const own = ownRankName(r)
    if (!own) continue
    names.push(r.vernacularName ? `${own} ${r.vernacularName}`.toLowerCase() : own.toLowerCase())
    refs.push(r)
    // Exact matches keyed only by the record's own name — keying every record
    // by its class/order too would put ~all 790k records in one bucket.
    addExact(exactIndex, own, r)
  }

  const index = { names, refs }
  largeListIndexCache[list.id] = index
  speciesExactIndexCache[list.id] = exactIndex
  return index
}

/** Substring search for large lists: whole-name prefix, then word prefix, then anywhere. */
function searchLargeList(index: LargeListIndex, query: string, limit: number): TaxonRecord[] {
  const q = query.toLowerCase()
  const tiers: TaxonRecord[][] = [[], [], []]
  const want = limit * 4
  for (let i = 0; i < index.names.length; i++) {
    const name = index.names[i]
    const at = name.indexOf(q)
    if (at < 0) continue
    const tier = at === 0 ? 0 : name[at - 1] === ' ' ? 1 : 2
    if (tiers[tier].length < want) tiers[tier].push(index.refs[i])
  }
  // Shorter names first within a tier: "Hypercompe" before "Hypercompe albescens".
  for (const tier of tiers) tier.sort((a, b) => ownRankName(a).length - ownRankName(b).length)
  return tiers.flat()
}

function ensureSpeciesIndexForList(list: SpeciesList | undefined): SpeciesIndexItem[] {
  if (!list) return []
  const cached = speciesIndexCache[list.id]
  if (cached) return cached

  const items: SpeciesIndexItem[] = []
  const exactIndex: Record<string, TaxonRecord[]> = {}

  for (const r of list.records) {
    const combined = [r.species, r.genus, r.family, r.order, r.class, r.phylum, r.kingdom, r.vernacularName].filter(Boolean).join(' | ')
    const prepared = fuzzysort.prepare(combined)
    items.push({ ref: r, search: prepared })

    const isUnranked = (r?.taxonRank ?? '').toLowerCase() === 'unranked'
    const status = (r?.taxonomicStatus ?? '').toLowerCase()
    const statusOk = !status || status === 'accepted'
    if (!isUnranked && statusOk) {
      addExact(exactIndex, r.species, r)
      addExact(exactIndex, r.genus, r)
      addExact(exactIndex, r.family, r)
      addExact(exactIndex, r.order, r)
      addExact(exactIndex, r.class, r)
      addExact(exactIndex, r.phylum, r)
      addExact(exactIndex, r.kingdom, r)
    }
  }

  speciesIndexCache[list.id] = items
  speciesExactIndexCache[list.id] = exactIndex
  return items
}

export function searchSpecies(params: { speciesListId?: string; query: string; limit?: number }) {
  const { speciesListId, query, limit = 20 } = params
  const trimmed = (query ?? '').trim()
  if (!trimmed) return [] as TaxonRecord[]

  const allLists = speciesListsStore.get() || {}
  const list = speciesListId ? allLists[speciesListId] : undefined
  const isLarge = (list?.records?.length ?? 0) > LARGE_SPECIES_LIST

  let mapped: TaxonRecord[]
  if (list && isLarge) {
    mapped = searchLargeList(ensureLargeListIndex(list), trimmed, limit)
  } else {
    const index = ensureSpeciesIndexForList(list)
    if (!index.length) return []

    const results = fuzzysort.go(trimmed, index as any, {
      key: 'search' as any,
      limit,
      threshold: -10000,
    }) as unknown as Array<{ obj: SpeciesIndexItem }>

    mapped = results.map((r) => r.obj.ref)
  }

  const exactIndex = speciesExactIndexCache[list?.id || ''] || {}
  const exactLower = trimmed.toLowerCase()
  let exactMatches = (exactIndex[exactLower] ?? []) as TaxonRecord[]

  const acceptFilter = (r: TaxonRecord) => {
    const isUnranked = (r?.taxonRank ?? '').toLowerCase() === 'unranked'
    const status = (r?.taxonomicStatus ?? '').toLowerCase()
    const statusOk = !status || status === 'accepted'
    return !isUnranked && statusOk
  }
  exactMatches = exactMatches.filter(acceptFilter)
  mapped = mapped.filter(acceptFilter)

  const combinedPre: TaxonRecord[] = dedupeByTaxonKey([...exactMatches, ...mapped])

  const rankOrder: Record<string, number> = {
    genus: 0,
    species: 1,
    family: 2,
    order: 3,
    class: 4,
    phylum: 5,
    kingdom: 6,
  }

  function matchedRankFor(record: TaxonRecord, qLower: string): string | undefined {
    if ((record?.genus ?? '').toLowerCase() === qLower) return 'genus'
    if ((record?.species ?? '').toLowerCase() === qLower) return 'species'
    if ((record?.family ?? '').toLowerCase() === qLower) return 'family'
    if ((record?.order ?? '').toLowerCase() === qLower) return 'order'
    if ((record?.class ?? '').toLowerCase() === qLower) return 'class'
    if ((record?.phylum ?? '').toLowerCase() === qLower) return 'phylum'
    if ((record?.kingdom ?? '').toLowerCase() === qLower) return 'kingdom'
    return undefined
  }

  const exactSet = new Set<string>((exactMatches || []).map((r) => stableTaxonKey(r)))
  const combined = [...combinedPre].sort((a, b) => {
    const aKey = String(a?.taxonID ?? a?.scientificName ?? '').toLowerCase()
    const bKey = String(b?.taxonID ?? b?.scientificName ?? '').toLowerCase()
    const aExact = exactSet.has(aKey)
    const bExact = exactSet.has(bKey)
    if (aExact && !bExact) return -1
    if (!aExact && bExact) return 1
    if (aExact && bExact) {
      const ar = matchedRankFor(a, exactLower)
      const br = matchedRankFor(b, exactLower)
      const ai = ar != null ? rankOrder[ar] ?? 99 : 99
      const bi = br != null ? rankOrder[br] ?? 99 : 99
      if (ai !== bi) return ai - bi
      // Prefer records whose taxonRank exactly equals the matched rank (e.g., ORDER row for "Hemiptera")
      const aRankMatches = (a?.taxonRank ?? '').toLowerCase() === (ar ?? '')
      const bRankMatches = (b?.taxonRank ?? '').toLowerCase() === (br ?? '')
      if (aRankMatches && !bRankMatches) return -1
      if (!aRankMatches && bRankMatches) return 1
      return (a?.scientificName || '').localeCompare(b?.scientificName || '')
    }
    return 0
  })

  const take = limit

  let finalResults = combined.slice(0, take)

  // Normalize results: if query matches a genus/family/order exactly, promote that rank
  finalResults = finalResults.map((record) => {
    const qLower = trimmed.toLowerCase()
    const recordGenus = (record?.genus ?? '').toLowerCase()
    const recordFamily = (record?.family ?? '').toLowerCase()
    const recordOrder = (record?.order ?? '').toLowerCase()
    
    let normalized = record
    
    // If query matches genus exactly, normalize to genus rank
    if (recordGenus === qLower && record?.taxonRank !== 'genus') {
      normalized = {
        ...record,
        taxonRank: 'genus',
        scientificName: '', // scientificName only for species level
        acceptedScientificName: undefined, // Clear species-level fields
        acceptedTaxonKey: undefined,
        species: undefined, // Clear lower-rank fields
      }
    }
    // If query matches family exactly, normalize to family rank
    else if (recordFamily === qLower && record?.taxonRank !== 'family') {
      normalized = {
        ...record,
        taxonRank: 'family',
        scientificName: '', // scientificName only for species level
        acceptedScientificName: undefined, // Clear species-level fields
        acceptedTaxonKey: undefined,
        genus: undefined, // Clear lower-rank fields
        species: undefined,
      }
    }
    // If query matches order exactly, normalize to order rank
    else if (recordOrder === qLower && record?.taxonRank !== 'order') {
      normalized = {
        ...record,
        taxonRank: 'order',
        scientificName: '', // scientificName only for species level
        acceptedScientificName: undefined, // Clear species-level fields
        acceptedTaxonKey: undefined,
        family: undefined, // Clear lower-rank fields
        genus: undefined,
        species: undefined,
      }
    }
    
    // Clean up: ensure fields match the taxonRank
    const rank = String(normalized?.taxonRank ?? '').trim().toLowerCase()
    if (rank !== 'species') {
      if (normalized.acceptedScientificName !== undefined || normalized.acceptedTaxonKey !== undefined) {
        normalized = {
          ...normalized,
          acceptedScientificName: undefined,
          acceptedTaxonKey: undefined,
        }
      }
    }
    // Clear lower-rank fields based on taxonRank
    if (rank === 'order') {
      if (normalized.family !== undefined || normalized.genus !== undefined || normalized.species !== undefined) {
        normalized = {
          ...normalized,
          family: undefined,
          genus: undefined,
          species: undefined,
        }
      }
    } else if (rank === 'family') {
      if (normalized.genus !== undefined || normalized.species !== undefined) {
        normalized = {
          ...normalized,
          genus: undefined,
          species: undefined,
        }
      }
    } else if (rank === 'genus') {
      if (normalized.species !== undefined) {
        normalized = {
          ...normalized,
          species: undefined,
        }
      }
    }
    
    return normalized
  })

  // Deduplicate again after normalization (normalization may have changed taxonRank, creating new duplicates)
  finalResults = dedupeByTaxonKey(finalResults)

  if (finalResults.length === 0 && (list?.records?.length ?? 0) > 0 && trimmed.length >= 4) {
    const approx = approximateSearch({
      records: (list?.records as TaxonRecord[]) ?? [],
      query: trimmed,
      limit: take,
      maxDistance: 2,
      ownRankOnly: isLarge,
    })
    if (approx.length) {
      finalResults = approx.map((record) => {
        const qLower = trimmed.toLowerCase()
        const recordGenus = (record?.genus ?? '').toLowerCase()
        const recordFamily = (record?.family ?? '').toLowerCase()
        const recordOrder = (record?.order ?? '').toLowerCase()
        
        let normalized = record
        
        if (recordGenus === qLower && record?.taxonRank !== 'genus') {
          normalized = { ...record, taxonRank: 'genus', scientificName: '', acceptedScientificName: undefined, acceptedTaxonKey: undefined, species: undefined }
        } else if (recordFamily === qLower && record?.taxonRank !== 'family') {
          normalized = { ...record, taxonRank: 'family', scientificName: '', acceptedScientificName: undefined, acceptedTaxonKey: undefined, genus: undefined, species: undefined }
        } else if (recordOrder === qLower && record?.taxonRank !== 'order') {
          normalized = { ...record, taxonRank: 'order', scientificName: '', acceptedScientificName: undefined, acceptedTaxonKey: undefined, family: undefined, genus: undefined, species: undefined }
        }
        
        // Clean up: ensure fields match the taxonRank
        const rank = String(normalized?.taxonRank ?? '').trim().toLowerCase()
        if (rank !== 'species') {
          if (normalized.acceptedScientificName !== undefined || normalized.acceptedTaxonKey !== undefined) {
            normalized = {
              ...normalized,
              acceptedScientificName: undefined,
              acceptedTaxonKey: undefined,
            }
          }
        }
        // Clear lower-rank fields based on taxonRank
        if (rank === 'order') {
          if (normalized.family !== undefined || normalized.genus !== undefined || normalized.species !== undefined) {
            normalized = {
              ...normalized,
              family: undefined,
              genus: undefined,
              species: undefined,
            }
          }
        } else if (rank === 'family') {
          if (normalized.genus !== undefined || normalized.species !== undefined) {
            normalized = {
              ...normalized,
              genus: undefined,
              species: undefined,
            }
          }
        } else if (rank === 'genus') {
          if (normalized.species !== undefined) {
            normalized = {
              ...normalized,
              species: undefined,
            }
          }
        }
        
        return normalized
      })
      // Deduplicate after approximate search normalization too
      finalResults = dedupeByTaxonKey(finalResults)
    }
  }

  return finalResults
}

function addExact(index: Record<string, TaxonRecord[]>, value: string | undefined, ref: TaxonRecord) {
  const key = (value ?? '').trim().toLowerCase()
  if (!key) return
  const bucket = index[key] || (index[key] = [])
  bucket.push(ref)
}

// Fallback approximate matching for misspellings (e.g., 'hempitera' -> 'Hemiptera').
// This runs only when primary fuzzy search yields no results.
type ApproxParams = { records: TaxonRecord[]; query: string; limit: number; maxDistance: number; ownRankOnly?: boolean }

function approximateSearch(params: ApproxParams) {
  const { records, query, limit, maxDistance, ownRankOnly } = params
  const q = (query || '').trim().toLowerCase()
  if (!q) return [] as TaxonRecord[]

  const rankOrder: Record<string, number> = {
    genus: 0,
    species: 1,
    family: 2,
    order: 3,
    class: 4,
    phylum: 5,
    kingdom: 6,
  }

  type Candidate = { rec: TaxonRecord; distance: number; rank?: keyof typeof rankOrder }
  const out: Candidate[] = []

  for (const rec of records) {
    let best: Candidate | undefined
    // Large lists: compare each record only at its own rank (1 comparison, not 7).
    const ranks = ownRankOnly
      ? OWN_RANK_ORDER.filter((rank) => rank === (rec?.taxonRank ?? '').toLowerCase())
      : (['species', 'genus', 'family', 'order', 'class', 'phylum', 'kingdom'] as const)
    for (const rank of ranks) {
      const val = String((rec as any)?.[rank] || '')
        .trim()
        .toLowerCase()
      if (!val) continue
      const d = damerauLevenshtein(q, val, maxDistance)
      if (d > maxDistance) continue
      if (!best || d < best.distance || (d === best.distance && (rankOrder[rank] ?? 99) < (rankOrder[best.rank || 'genus'] ?? 99))) {
        best = { rec, distance: d, rank }
      }
    }
    if (!best && (rec?.scientificName || rec?.vernacularName)) {
      const val = String(rec.scientificName || rec.vernacularName || '')
        .trim()
        .toLowerCase()
      if (val) {
        const d = damerauLevenshtein(q, val, maxDistance)
        if (d <= maxDistance) best = { rec, distance: d }
      }
    }
    if (best) out.push(best)
  }

  out.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance
    const ar = a.rank ? rankOrder[a.rank] ?? 99 : 99
    const br = b.rank ? rankOrder[b.rank] ?? 99 : 99
    if (ar !== br) return ar - br
    return (a.rec?.scientificName || '').localeCompare(b.rec?.scientificName || '')
  })

  return out.slice(0, limit).map((c) => c.rec)
}

// Damerau–Levenshtein with early exit when distance exceeds max
function damerauLevenshtein(a: string, b: string, max: number) {
  const al = a.length
  const bl = b.length
  if (a === b) return 0
  if (!al) return Math.min(bl, max + 1)
  if (!bl) return Math.min(al, max + 1)

  const prev = new Array<number>(bl + 1)
  const curr = new Array<number>(bl + 1)
  const prev2 = new Array<number>(bl + 1)

  for (let j = 0; j <= bl; j++) prev[j] = j

  for (let i = 1; i <= al; i++) {
    curr[0] = i
    let rowMin = curr[0]
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= bl; j++) {
      const bj = b.charCodeAt(j - 1)
      const cost = ai === bj ? 0 : 1
      let val = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      )
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        val = Math.min(val, prev2[j - 2] + 1) // transposition
      }
      curr[j] = val
      if (val < rowMin) rowMin = val
    }
    if (rowMin > max) return max + 1
    for (let j = 0; j <= bl; j++) {
      prev2[j] = prev[j]
      prev[j] = curr[j]
    }
  }
  return prev[bl]
}
