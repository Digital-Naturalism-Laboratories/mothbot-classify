import type { SpeciesListDoiStatus, TaxonIDSource } from '~/models/taxonomy/species-list-source'
import type { TaxonRecord } from '~/models/taxonomy/types'
import type { SpeciesListValidation } from '~/models/taxonomy/species-list-validation'

export type SpeciesCsvWorkerRequest = {
  requestId: string
  /** The CSV file — streamed by the worker, never read into one string. */
  file?: Blob
  /** Alternative to `file` for callers that already have the text. */
  csvText?: string
  fileId: string
  fileName: string
  sourcePath: string
}

export type SpeciesCsvWorkerResponse = {
  requestId: string
  id: string
  name: string
  doi: string
  doiStatus: SpeciesListDoiStatus
  downloadKey?: string
  pendingRef?: string
  taxonIDSource?: TaxonIDSource
  fileName: string
  sourcePath: string
  records: TaxonRecord[]
  recordCount: number
  validation: SpeciesListValidation
}
