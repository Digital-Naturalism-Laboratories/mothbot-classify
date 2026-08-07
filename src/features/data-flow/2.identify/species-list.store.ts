import { atom } from 'nanostores'

// Re-export TaxonRecord from centralized taxonomy module
export type { TaxonRecord } from '~/models/taxonomy/types'

export type SpeciesList = {
  id: string
  fileName: string
  name: string
  doi: string
  sourcePath: string
  recordCount: number
  records: import('~/models/taxonomy/types').TaxonRecord[]
  /** Result of checking the CSV's headers — drives the picker's warnings. */
  validation?: import('~/models/taxonomy/species-list-validation').SpeciesListValidation
}

export const speciesListsStore = atom<Record<string, SpeciesList>>({})
export const speciesListsLoadingStore = atom<boolean>(false)
