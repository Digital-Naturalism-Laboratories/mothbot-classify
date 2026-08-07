import { csvToObjects } from '~/utils/csv'
import { mapRowToTaxonRecords } from '~/models/taxonomy/csv-parser'
import { dedupeByTaxonKey } from '~/models/taxonomy/keys'
import { validateSpeciesListCsv } from '~/models/taxonomy/species-list-validation'
import type { SpeciesCsvWorkerRequest, SpeciesCsvWorkerResponse } from './species-csv.types'

self.onmessage = async (event: MessageEvent<SpeciesCsvWorkerRequest>) => {
  const { requestId, csvText, fileId, fileName, sourcePath } = event.data

  try {
    const rows = csvToObjects({ csvContent: csvText, hasHeaders: true }) as any[]
    if (!Array.isArray(rows) || rows.length === 0) {
      self.postMessage(null)
      return
    }

    const records = rows.flatMap((row) => mapRowToTaxonRecords(row))
    const unique = dedupeByTaxonKey(records)

    // Headers come from the first parsed row — PapaParse keys every row by header.
    const headers = Object.keys(rows[0] ?? {})
    const validation = validateSpeciesListCsv({ headers, recordCount: unique.length })

    const baseName = fileName?.replace('SpeciesList_', '').replace('SpeciesList_', '.csv').split('_') ?? []
    const doi = baseName[2] ?? ''
    const name = (baseName[0] ?? '') + ' - ' + (baseName[1] ?? '')

    const response: SpeciesCsvWorkerResponse = {
      requestId,
      id: fileId,
      name,
      doi,
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
