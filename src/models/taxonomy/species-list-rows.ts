/**
 * Species-list CSV helpers that run before rows become TaxonRecords.
 */

import {
  type SpeciesListDoiStatus,
  doiUrlFromFileName,
  downloadKeyFromFileName,
  gbifDownloadPageUrl,
  speciesListNameFromFileName,
} from './species-list-source'

/**
 * Orders rows so the best row for each taxon comes first — dedupeByTaxonKey
 * keeps the first record per taxon, and species-level metadata (status,
 * accepted name and key) comes from whichever row that was.
 *
 * Catalogue of Life lists are mostly BOLD BIN rows (`BOLD:AAC2117`, rank
 * UNRANKED) that also name a species; without this, a species could carry the
 * BIN as its accepted name. Order: accepted named taxa, then synonyms etc.,
 * then BIN rows. Stable within each group.
 */
export function orderRowsForDedupe<T>(rows: T[]): T[] {
  const priority = (row: any) => {
    const name = String(row?.scientificName ?? '')
    const rank = String(row?.taxonRank ?? '').toUpperCase()
    if (name.startsWith('BOLD:') || rank === 'UNRANKED') return 2
    const status = String(row?.taxonomicStatus ?? '').toUpperCase()
    return !status || status === 'ACCEPTED' ? 0 : 1
  }
  const groups: T[][] = [[], [], []]
  for (const row of rows) groups[priority(row)].push(row)
  return groups.flat()
}

/** List identity from the file name alone — GBIF metadata (if any) is applied later. */
export function identifySpeciesListFromFileName(fileName: string): {
  name: string
  doi: string
  doiStatus: SpeciesListDoiStatus
  downloadKey?: string
  pendingRef?: string
} {
  const name = speciesListNameFromFileName(fileName)
  const fileDoi = doiUrlFromFileName(fileName)
  if (fileDoi) return { name, doi: fileDoi, doiStatus: 'filename' }

  const downloadKey = downloadKeyFromFileName(fileName)
  if (downloadKey) {
    const pendingRef = gbifDownloadPageUrl(downloadKey)
    return { name, doi: pendingRef, doiStatus: 'pending', downloadKey, pendingRef }
  }

  return { name, doi: '', doiStatus: 'none' }
}
