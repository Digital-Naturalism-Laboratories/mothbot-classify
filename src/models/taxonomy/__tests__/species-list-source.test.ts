import { describe, expect, it } from 'vitest'
import {
  canonicalSpeciesListRef,
  describeGbifPredicate,
  detectTaxonIDSource,
  doiUrlFromFileName,
  downloadKeyFromFileName,
  gbifDownloadInfoFromApi,
  gbifSidecarPathForCsv,
  inferTaxonIDSource,
  speciesListNameFromFileName,
  speciesListNameFromGbif,
} from '../species-list-source'
import { identifySpeciesListFromFileName, orderRowsForDedupe } from '../species-list-rows'
import { mapRowToTaxonRecords } from '../csv-parser'
import { dedupeByTaxonKey } from '../keys'

const OLD_NAME = 'SpeciesList_CountryPanamaCostaRica_TaxaInsecta_doi.org10.15468dl.6nxkw6.csv'
const NEW_NAME = '0024609-260928105237408.csv'

// Trimmed from GET api.gbif.org/v1/occurrence/download/0024609-260928105237408
const API_RESPONSE = {
  key: '0024609-260928105237408',
  doi: '10.15468/dl.x3qf72',
  license: 'http://creativecommons.org/licenses/by-nc/4.0/legalcode',
  created: '2026-10-13T19:20:54.376+00:00',
  totalRecords: 209479,
  request: {
    format: 'SPECIES_LIST',
    checklistKey: '7ddf754f-d193-4cc9-b351-99906754a03b',
    predicate: {
      type: 'and',
      predicates: [
        { type: 'in', key: 'TAXON_KEY', values: ['H6'], checklistKey: '7ddf754f-d193-4cc9-b351-99906754a03b' },
        { type: 'in', key: 'COUNTRY', values: ['PA', 'CR'] },
      ],
    },
  },
}

describe('species list file names', () => {
  it('reads the DOI from hand-renamed lists (both spellings)', () => {
    expect(doiUrlFromFileName(OLD_NAME)).toBe('https://doi.org/10.15468/dl.6nxkw6')
    expect(doiUrlFromFileName('SpeciesList_X_Y_doi.org.10.15468.dl.pkbmuj.csv')).toBe('https://doi.org/10.15468/dl.pkbmuj')
    expect(doiUrlFromFileName(NEW_NAME)).toBeUndefined()
  })

  it('reads the GBIF download key from GBIF file names, even inside a longer name or path', () => {
    expect(downloadKeyFromFileName(NEW_NAME)).toBe('0024609-260928105237408')
    expect(downloadKeyFromFileName('Species/Panama_0024609-260928105237408.csv')).toBe('0024609-260928105237408')
    expect(downloadKeyFromFileName(OLD_NAME)).toBeUndefined()
  })

  it('names lists from the file name', () => {
    expect(speciesListNameFromFileName(OLD_NAME)).toBe('CountryPanamaCostaRica - TaxaInsecta')
    expect(speciesListNameFromFileName(NEW_NAME)).toBe('GBIF download 0024609-260928105237408')
    expect(speciesListNameFromFileName('my_moths.csv')).toBe('my_moths')
  })

  it('identifies a download-key list as DOI-pending, referenced by its download page', () => {
    expect(identifySpeciesListFromFileName(NEW_NAME)).toEqual({
      name: 'GBIF download 0024609-260928105237408',
      doi: 'https://www.gbif.org/occurrence/download/0024609-260928105237408',
      doiStatus: 'pending',
      downloadKey: '0024609-260928105237408',
      pendingRef: 'https://www.gbif.org/occurrence/download/0024609-260928105237408',
    })
    expect(identifySpeciesListFromFileName(OLD_NAME)).toMatchObject({ doi: 'https://doi.org/10.15468/dl.6nxkw6', doiStatus: 'filename' })
    expect(identifySpeciesListFromFileName('my_moths.csv')).toMatchObject({ doi: '', doiStatus: 'none' })
  })

  it('puts the sidecar next to the CSV', () => {
    expect(gbifSidecarPathForCsv('Species/0024609-260928105237408.csv')).toBe('Species/0024609-260928105237408.gbif.json')
  })
})

describe('canonicalSpeciesListRef', () => {
  it('maps every historical DOI spelling to one URL', () => {
    const want = 'https://doi.org/10.15468/dl.6nxkw6'
    for (const ref of [
      'https://doi.org/10.15468/dl.6nxkw6',
      'doi.org/10.15468/dl.6nxkw6',
      'doi:10.15468/dl.6nxkw6',
      '10.15468/dl.6nxkw6',
      'doi.org10.15468dl.6nxkw6.csv', // what older Classify versions stored
      'https://doi.org/10.15468/dl.6nxkw6.csv',
    ]) {
      expect(canonicalSpeciesListRef(ref)).toBe(want)
    }
  })

  it('maps download keys and page URLs to the page URL', () => {
    const want = 'https://www.gbif.org/occurrence/download/0024609-260928105237408'
    expect(canonicalSpeciesListRef('0024609-260928105237408')).toBe(want)
    expect(canonicalSpeciesListRef(want)).toBe(want)
  })

  it('leaves other refs alone', () => {
    expect(canonicalSpeciesListRef('no_doi')).toBe('no_doi')
    expect(canonicalSpeciesListRef('')).toBe('')
  })
})

describe('taxon ID systems', () => {
  it('detects backbone (integer) vs Catalogue of Life (alphanumeric) keys', () => {
    expect(detectTaxonIDSource(['1090772', 5128005, '', '1341976'])).toBe('gbif-backbone')
    expect(detectTaxonIDSource(['BOLD.AAA1580', 'B6L67', 'NSKVB', '1234'])).toBe('col')
    expect(detectTaxonIDSource([])).toBeUndefined()
  })

  it('infers a single ID', () => {
    expect(inferTaxonIDSource(797)).toBe('gbif-backbone')
    expect(inferTaxonIDSource('L9SZG')).toBe('col')
    expect(inferTaxonIDSource('')).toBeUndefined()
  })
})

describe('GBIF download metadata', () => {
  it('converts the API response into the sidecar shape', () => {
    const info = gbifDownloadInfoFromApi(API_RESPONSE)!
    expect(info).toMatchObject({
      source: 'gbif-download',
      downloadKey: '0024609-260928105237408',
      doi: '10.15468/dl.x3qf72',
      doiUrl: 'https://doi.org/10.15468/dl.x3qf72',
      checklist: 'Catalogue of Life (COL XR)',
      description: 'Insecta · Panama, Costa Rica',
    })
    expect(speciesListNameFromGbif(info, 'fallback')).toBe('Insecta · Panama, Costa Rica (GBIF 2026-10-13)')
  })

  it('rejects responses without a DOI', () => {
    expect(gbifDownloadInfoFromApi({ key: 'x' })).toBeUndefined()
    expect(gbifDownloadInfoFromApi(null)).toBeUndefined()
  })

  it('describes worldwide and backbone filters', () => {
    expect(describeGbifPredicate({ type: 'equals', key: 'TAXON_KEY', value: '216' })).toBe('Insecta · Worldwide')
  })
})

describe('orderRowsForDedupe', () => {
  const header = {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Insecta',
    order: 'Hymenoptera',
    family: 'Braconidae',
    genus: 'Apanteles',
    species: 'Apanteles lisabearssae',
    genusKey: '62CWH',
    speciesKey: 'L9SZG',
  }
  const binRow = {
    ...header,
    taxonKey: 'BOLD.AAC2117',
    scientificName: 'BOLD:AAC2117',
    acceptedTaxonKey: 'BOLD.AAC2117',
    acceptedScientificName: 'BOLD:AAC2117',
    taxonRank: 'UNRANKED',
    taxonomicStatus: 'ACCEPTED',
  }
  const synonymRow = {
    ...header,
    taxonKey: 'ZZZZ1',
    scientificName: 'Apanteles oldname Smith, 1900',
    acceptedTaxonKey: 'L9SZG',
    acceptedScientificName: 'Apanteles lisabearssae Fernandez-Triana, 2014',
    taxonRank: 'SPECIES',
    taxonomicStatus: 'SYNONYM',
  }
  const speciesRow = {
    ...header,
    taxonKey: 'L9SZG',
    scientificName: 'Apanteles lisabearssae Fernandez-Triana, 2014',
    acceptedTaxonKey: 'L9SZG',
    acceptedScientificName: 'Apanteles lisabearssae Fernandez-Triana, 2014',
    taxonRank: 'SPECIES',
    taxonomicStatus: 'ACCEPTED',
  }

  it('keeps the accepted species row, not a BOLD BIN or synonym row, as the species record', () => {
    const rows = orderRowsForDedupe([binRow, synonymRow, speciesRow])
    const species = dedupeByTaxonKey(rows.flatMap((r) => mapRowToTaxonRecords(r))).find((r) => r.taxonRank === 'species')!
    expect(species.acceptedScientificName).toBe('Apanteles lisabearssae Fernandez-Triana, 2014')
    expect(species.taxonomicStatus).toBe('ACCEPTED')
    expect(String(species.acceptedTaxonKey)).toBe('L9SZG')
  })

  it('is stable within each group', () => {
    const a = { scientificName: 'A', taxonomicStatus: 'ACCEPTED' }
    const b = { scientificName: 'B', taxonomicStatus: 'ACCEPTED' }
    expect(orderRowsForDedupe([binRow, a, synonymRow, b])).toEqual([a, b, synonymRow, binRow])
  })
})
