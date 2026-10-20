import type { TaxonRecord } from '~/models/taxonomy/types'
import { ARACHNID_ORDERS, INSECT_ORDERS } from '~/models/taxonomy/known-lineage'

/**
 * Standard higher taxa offered as quick identification targets even when the
 * project's species list doesn't include them: the lineage down to insects
 * (Animalia › Arthropoda › Insecta), the insect orders, and spiders/mites, which
 * are out of scope for an insect-focused list but still worth labelling.
 *
 * Each carries GBIF backbone keys for its full lineage (checked against
 * api.gbif.org), so the picker treats it as a complete taxon (no "fill missing
 * ranks" prompt).
 */
const ANIMALIA = { kingdom: 'Animalia' }
const ARTHROPODA = { ...ANIMALIA, phylum: 'Arthropoda' }
const INSECTA = { ...ARTHROPODA, class: 'Insecta' }

/** The broad groups, shown before anything is typed; orders appear once you search. */
const BROAD_TAXA: TaxonRecord[] = [
  {
    scientificName: 'Animalia',
    taxonRank: 'kingdom',
    ...ANIMALIA,
    taxonID: 1,
    taxonIDSource: 'gbif-backbone',
    vernacularName: 'Animals',
    extras: { kingdomKey: 1 },
  },
  {
    scientificName: 'Arthropoda',
    taxonRank: 'phylum',
    ...ARTHROPODA,
    taxonID: 54,
    taxonIDSource: 'gbif-backbone',
    vernacularName: 'Arthropods',
    extras: { kingdomKey: 1, phylumKey: 54 },
  },
  {
    scientificName: 'Insecta',
    taxonRank: 'class',
    ...INSECTA,
    taxonID: 216,
    taxonIDSource: 'gbif-backbone',
    vernacularName: 'Insects',
    extras: { kingdomKey: 1, phylumKey: 54, classKey: 216 },
  },
  {
    scientificName: 'Arachnida',
    taxonRank: 'class',
    ...ARTHROPODA,
    class: 'Arachnida',
    taxonID: 1367,
    taxonIDSource: 'gbif-backbone',
    vernacularName: 'Arachnids (spiders, mites, …)',
    extras: { kingdomKey: 1, phylumKey: 54, classKey: 1367 },
  },
]

const ORDER_TAXA: TaxonRecord[] = INSECT_ORDERS.map(([order, key, common]) => ({
  scientificName: order,
  taxonRank: 'order',
  ...INSECTA,
  order,
  taxonID: key,
  taxonIDSource: 'gbif-backbone',
  vernacularName: common,
  extras: { kingdomKey: 1, phylumKey: 54, classKey: 216, orderKey: key },
}))

/** Spiders and harvestmen: missing from insect-only lists, so offered here with their real class. */
const OFFERED_ARACHNID_ORDERS = new Set(['Araneae', 'Opiliones'])
const ARACHNID_ORDER_TAXA: TaxonRecord[] = ARACHNID_ORDERS.filter(([order]) => OFFERED_ARACHNID_ORDERS.has(order)).map(
  ([order, key, common]) => ({
    scientificName: order,
    taxonRank: 'order',
    ...ARTHROPODA,
    class: 'Arachnida',
    order,
    taxonID: key,
    taxonIDSource: 'gbif-backbone',
    vernacularName: common,
    extras: { kingdomKey: 1, phylumKey: 54, classKey: 1367, orderKey: key },
  }),
)

export const DEFAULT_TAXA: TaxonRecord[] = [...BROAD_TAXA, ...ORDER_TAXA, ...ARACHNID_ORDER_TAXA]

/** Standard taxa matching a query (by scientific/common name), for the picker. */
export function matchDefaultTaxa(query: string): TaxonRecord[] {
  const q = query.trim().toLowerCase()
  if (!q) return BROAD_TAXA
  return DEFAULT_TAXA.filter(
    (t) => t.scientificName.toLowerCase().includes(q) || (t.vernacularName ?? '').toLowerCase().includes(q),
  )
}
