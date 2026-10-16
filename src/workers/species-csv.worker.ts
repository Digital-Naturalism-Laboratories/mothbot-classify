import Papa from 'papaparse'
import { validateSpeciesListCsv } from '~/models/taxonomy/species-list-validation'
import { createSpeciesListAccumulator, identifySpeciesListFromFileName } from '~/models/taxonomy/species-list-rows'
import type { SpeciesCsvWorkerRequest, SpeciesCsvWorkerResponse } from './species-csv.types'

/** Rows parsed per chunk; the file is never read into one string. */
const CHUNK_BYTES = 8 * 1024 * 1024

self.onmessage = async (event: MessageEvent<SpeciesCsvWorkerRequest>) => {
  const { requestId, file, csvText, fileId, fileName, sourcePath } = event.data

  try {
    const accumulator = createSpeciesListAccumulator()
    await streamCsvRows(file ?? csvText ?? '', (row) => accumulator.addRow(row))
    const { records, headers, rowCount, taxonIDSource } = accumulator.finish()
    if (rowCount === 0) {
      self.postMessage({ requestId, empty: true })
      return
    }

    const validation = validateSpeciesListCsv({ headers, recordCount: records.length })
    const identity = identifySpeciesListFromFileName(fileName ?? '')

    const response: SpeciesCsvWorkerResponse = {
      requestId,
      id: fileId,
      ...identity,
      taxonIDSource,
      fileName,
      sourcePath,
      records,
      recordCount: records.length,
      validation,
    }

    self.postMessage(response)
  } catch (err) {
    console.error('🚨 species worker: failed to parse species list', { path: sourcePath, err })
    self.postMessage({ requestId, failed: true })
  }
}

function streamCsvRows(input: Blob | string, onRow: (row: any) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    Papa.parse(input as any, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true, // numbers stay numbers (numberOfOccurrences, backbone keys)
      chunkSize: CHUNK_BYTES,
      chunk: (results: Papa.ParseResult<any>) => {
        for (const row of results.data) onRow(row)
      },
      complete: () => resolve(),
      error: (err: unknown) => reject(err),
    })
  })
}
