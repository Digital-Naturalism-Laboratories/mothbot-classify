import { csvToObjects } from '~/utils/csv'
import { mapRowToTaxonRecords } from '~/models/taxonomy/csv-parser'
import { dedupeByTaxonKey } from '~/models/taxonomy/keys'
import { validateSpeciesListCsv } from '~/models/taxonomy/species-list-validation'
import { identifySpeciesListFromFileName, orderRowsForDedupe } from '~/models/taxonomy/species-list-rows'
import { detectTaxonIDSource } from '~/models/taxonomy/species-list-source'
import type { SpeciesCsvWorkerRequest, SpeciesCsvWorkerResponse } from './species-csv.types'

self.onmessage = async (event: MessageEvent<SpeciesCsvWorkerRequest>) => {
  const { requestId, csvText, fileId, fileName, sourcePath } = event.data

  try {
    const rows = csvToObjects({ csvContent: csvText, hasHeaders: true }) as any[]
    if (!Array.isArray(rows) || rows.length === 0) {
      self.postMessage(null)
      return
    }

    // Backbone keys are integers, Catalogue of Life keys alphanumeric; a sample decides.
    const taxonIDSource = detectTaxonIDSource(rows.slice(0, 2000).map((r) => r?.taxonKey ?? r?.taxonID))

    const records = orderRowsForDedupe(rows).flatMap((row) => mapRowToTaxonRecords(row))
    const unique = dedupeByTaxonKey(records)
    if (taxonIDSource) {
      for (const record of unique) if (record.taxonID != null && record.taxonID !== '') record.taxonIDSource = taxonIDSource
    }

    // Headers come from the first parsed row — PapaParse keys every row by header.
    const headers = Object.keys(rows[0] ?? {})
    const validation = validateSpeciesListCsv({ headers, recordCount: unique.length })

    const identity = identifySpeciesListFromFileName(fileName ?? '')

    const response: SpeciesCsvWorkerResponse = {
      requestId,
      id: fileId,
      ...identity,
      taxonIDSource,
      fileName,
      sourcePath,
      records: unique,
      recordCount: unique.length,
      validation,
    }

    self.postMessage(response)
  } catch (err) {
    console.error('🚨 species worker: failed to parse species list', { path: sourcePath, err })
    self.postMessage(null)
  }
}
