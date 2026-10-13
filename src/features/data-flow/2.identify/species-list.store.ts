import { atom } from 'nanostores'
import type { GbifDownloadInfo, SpeciesListDoiStatus, TaxonIDSource } from '~/models/taxonomy/species-list-source'

// Re-export TaxonRecord from centralized taxonomy module
export type { TaxonRecord } from '~/models/taxonomy/types'

export type SpeciesList = {
  id: string
  fileName: string
  name: string
  /**
   * The reference stored on every ID made with this list: the DOI URL; or, for a
   * GBIF download whose DOI hasn't been fetched yet (offline), its download page
   * URL; or '' when the list has neither.
   */
  doi: string
  doiStatus?: SpeciesListDoiStatus
  /** GBIF download key (`0024609-260928105237408`), when known. */
  downloadKey?: string
  /** GBIF download page URL — what IDs referenced while the DOI was pending. */
  pendingRef?: string
  /** e.g. "Insecta · Panama, Costa Rica", from the GBIF download's filter. */
  description?: string
  /** ID system of the list's taxon keys: GBIF Backbone (old lists) or Catalogue of Life. */
  taxonIDSource?: TaxonIDSource
  gbif?: GbifDownloadInfo
  sourcePath: string
  recordCount: number
  records: import('~/models/taxonomy/types').TaxonRecord[]
  /** Result of checking the CSV's headers — drives the picker's warnings. */
  validation?: import('~/models/taxonomy/species-list-validation').SpeciesListValidation
}

export const speciesListsStore = atom<Record<string, SpeciesList>>({})
export const speciesListsLoadingStore = atom<boolean>(false)
