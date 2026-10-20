import { describe, expect, it } from 'vitest'
import { identifyDetection } from '~/features/data-flow/2.identify/identify'
import type { DetectionEntity } from '~/models/detection.types'
import type { TaxonRecord } from '~/models/taxonomy/types'
import { knownLineageForOrder, withKnownOrderLineage } from '../known-lineage'

const INSECTA = { kingdom: 'Animalia', phylum: 'Arthropoda', class: 'Insecta' }
const ARACHNIDA = { kingdom: 'Animalia', phylum: 'Arthropoda', class: 'Arachnida' }

function detectionWith(taxon: TaxonRecord): DetectionEntity {
  return { id: 'd', patchId: 'd', photoId: 'p', leafGroupId: 'n', detectedBy: 'user', taxon, label: taxon.scientificName }
}

function relabel(params: { from: TaxonRecord; to: TaxonRecord }) {
  return identifyDetection({ detection: detectionWith(params.from), input: { type: 'taxon', taxon: params.to } }).detection.taxon
}

const flies: TaxonRecord = { scientificName: '', taxonRank: 'order', ...INSECTA, order: 'Diptera' }
const spiders: TaxonRecord = { scientificName: '', taxonRank: 'order', ...ARACHNIDA, order: 'Araneae' }

describe('class follows the order when a detection is re-identified', () => {
  it('moves a fly re-identified as a spider to Arachnida', () => {
    expect(relabel({ from: flies, to: spiders })).toMatchObject({ class: 'Arachnida', order: 'Araneae' })
  })

  it('moves a spider re-identified as a fly to Insecta', () => {
    expect(relabel({ from: spiders, to: flies })).toMatchObject({ class: 'Insecta', order: 'Diptera' })
  })

  it('fills the class of a typed well-known order that carries no class', () => {
    const typedAraneae: TaxonRecord = { scientificName: 'Araneae', taxonRank: 'order', order: 'Araneae' }
    expect(relabel({ from: flies, to: typedAraneae })).toMatchObject({ class: 'Arachnida', order: 'Araneae' })
  })

  it('drops a stale class when the order changes to one it cannot place', () => {
    const typed: TaxonRecord = { scientificName: 'Notarealorder', taxonRank: 'order', order: 'Notarealorder' }
    const taxon = relabel({ from: flies, to: typed })
    expect(taxon?.order).toBe('Notarealorder')
    expect(taxon?.class).toBeUndefined()
  })

  it('keeps the class when refining within the same lineage', () => {
    const owlet: TaxonRecord = { scientificName: '', taxonRank: 'family', ...INSECTA, order: 'Lepidoptera', family: 'Noctuidae' }
    const typedFamily: TaxonRecord = { scientificName: 'Erebidae', taxonRank: 'family', family: 'Erebidae' }
    expect(relabel({ from: owlet, to: typedFamily })).toMatchObject({ class: 'Insecta', order: 'Lepidoptera', family: 'Erebidae' })
  })

  it('takes a picked species’ full lineage over the old one', () => {
    const wolfSpider: TaxonRecord = {
      scientificName: 'Pardosa lugubris',
      taxonRank: 'species',
      ...ARACHNIDA,
      order: 'Araneae',
      family: 'Lycosidae',
      genus: 'Pardosa',
      species: 'Pardosa lugubris',
    }
    expect(relabel({ from: flies, to: wolfSpider })).toMatchObject({ class: 'Arachnida', order: 'Araneae', family: 'Lycosidae' })
  })
})

describe('withKnownOrderLineage (repair on load)', () => {
  it('moves saved spiders out of Insecta', () => {
    expect(withKnownOrderLineage({ ...INSECTA, order: 'Araneae' })).toMatchObject({ class: 'Arachnida' })
  })

  it('moves saved insect orders out of Arachnida', () => {
    expect(withKnownOrderLineage({ ...ARACHNIDA, order: 'Diptera' })).toMatchObject({ class: 'Insecta' })
  })

  it('gives orders saved without a class their class', () => {
    expect(withKnownOrderLineage({ order: 'Hemiptera' })).toMatchObject(INSECTA)
  })

  it('leaves correct and unknown lineages untouched', () => {
    const correct = { ...INSECTA, order: 'Lepidoptera' }
    expect(withKnownOrderLineage(correct)).toBe(correct)
    const unknown = { class: 'Collembola', order: 'Entomobryomorpha' }
    expect(withKnownOrderLineage(unknown)).toBe(unknown)
  })

  it('matches orders case-insensitively', () => {
    expect(knownLineageForOrder('araneae')?.class).toBe('Arachnida')
  })
})
