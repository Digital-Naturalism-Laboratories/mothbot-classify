/**
 * Species-list CSV helpers that run before rows become TaxonRecords.
 */

import type { TaxonRecord } from './types'
import { mapRowToTaxonRecords } from './csv-parser'
import { stableTaxonKey } from './keys'
import {
  type SpeciesListDoiStatus,
  detectTaxonIDSource,
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
  const groups: T[][] = [[], [], []]
  for (const row of rows) groups[speciesListRowPriority(row)].push(row)
  return groups.flat()
}

/** 0 = accepted named taxon, 1 = synonym etc., 2 = BOLD BIN / unranked. Lower wins. */
export function speciesListRowPriority(row: any): 0 | 1 | 2 {
  const name = String(row?.scientificName ?? '')
  const rank = String(row?.taxonRank ?? '').toUpperCase()
  if (name.startsWith('BOLD:') || rank === 'UNRANKED') return 2
  const status = String(row?.taxonomicStatus ?? '').toUpperCase()
  return !status || status === 'ACCEPTED' ? 0 : 1
}

/**
 * Builds a list's unique TaxonRecords one row at a time, so even the
 * 1.6-million-row worldwide list never holds all its rows (or the ~10M
 * per-rank records they expand to) in memory at once.
 *
 * Gives the same result as orderRowsForDedupe → mapRowToTaxonRecords →
 * dedupeByTaxonKey: per taxon, the record from the best-priority row, earliest
 * first among equals.
 */
export function createSpeciesListAccumulator() {
  const best = new Map<string, { record: TaxonRecord; priority: number }>()
  const idSample: unknown[] = []
  let headers: string[] | null = null
  let rowCount = 0

  return {
    addRow(row: any) {
      if (!row || typeof row !== 'object') return
      if (!headers) headers = Object.keys(row)
      rowCount++
      if (idSample.length < 2000) idSample.push(row.taxonKey ?? row.taxonID)
      const priority = speciesListRowPriority(row)
      for (const record of mapRowToTaxonRecords(row)) {
        const key = stableTaxonKey(record)
        if (!key) continue
        const current = best.get(key)
        if (!current || priority < current.priority) best.set(key, { record, priority })
      }
    },
    finish() {
      const records = Array.from(best.values(), (entry) => entry.record)
      // Backbone keys are integers, Catalogue of Life keys alphanumeric; a sample decides.
      const taxonIDSource = detectTaxonIDSource(idSample)
      if (taxonIDSource) {
        for (const record of records) if (record.taxonID != null && record.taxonID !== '') record.taxonIDSource = taxonIDSource
      }
      return { records, headers: headers ?? [], rowCount, taxonIDSource }
    },
  }
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
