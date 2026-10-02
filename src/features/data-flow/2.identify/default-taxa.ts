import type { TaxonRecord } from '~/models/taxonomy/types'

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

/** Insect orders: [order, GBIF backbone key, common name]. */
const INSECT_ORDERS: Array<[string, number, string]> = [
  ['Lepidoptera', 797, 'Moths & butterflies'],
  ['Coleoptera', 1470, 'Beetles'],
  ['Diptera', 811, 'Flies'],
  ['Hymenoptera', 1457, 'Wasps, bees & ants'],
  ['Hemiptera', 809, 'True bugs'],
  ['Orthoptera', 1458, 'Grasshoppers & crickets'],
  ['Trichoptera', 1003, 'Caddisflies'],
  ['Ephemeroptera', 1225, 'Mayflies'],
  ['Neuroptera', 1501, 'Lacewings & antlions'],
  ['Megaloptera', 1451, 'Dobsonflies & alderflies'],
  ['Raphidioptera', 786, 'Snakeflies'],
  ['Odonata', 789, 'Dragonflies & damselflies'],
  ['Plecoptera', 787, 'Stoneflies'],
  ['Blattodea', 800, 'Cockroaches & termites'],
  ['Mantodea', 788, 'Mantises'],
  ['Dermaptera', 1224, 'Earwigs'],
  ['Psocodea', 7612838, 'Barklice & lice'],
  ['Thysanoptera', 1228, 'Thrips'],
  ['Mecoptera', 1000, 'Scorpionflies'],
  ['Phasmida', 1460, 'Stick insects'],
  ['Strepsiptera', 1227, 'Twisted-wing parasites'],
  ['Siphonaptera', 1366, 'Fleas'],
  ['Embioptera', 584, 'Webspinners'],
  ['Zygentoma', 1004, 'Silverfish'],
  ['Archaeognatha', 1187, 'Jumping bristletails'],
  ['Zoraptera', 1229, 'Angel insects'],
]

/** The broad groups, shown before anything is typed; orders appear once you search. */
const BROAD_TAXA: TaxonRecord[] = [
  {
    scientificName: 'Animalia',
    taxonRank: 'kingdom',
    ...ANIMALIA,
    taxonID: 1,
    vernacularName: 'Animals',
    extras: { kingdomKey: 1 },
  },
  {
    scientificName: 'Arthropoda',
    taxonRank: 'phylum',
    ...ARTHROPODA,
    taxonID: 54,
    vernacularName: 'Arthropods',
    extras: { kingdomKey: 1, phylumKey: 54 },
  },
  {
    scientificName: 'Insecta',
    taxonRank: 'class',
    ...INSECTA,
    taxonID: 216,
    vernacularName: 'Insects',
    extras: { kingdomKey: 1, phylumKey: 54, classKey: 216 },
  },
  {
    scientificName: 'Arachnida',
    taxonRank: 'class',
    ...ARTHROPODA,
    class: 'Arachnida',
    taxonID: 1367,
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
  vernacularName: common,
  extras: { kingdomKey: 1, phylumKey: 54, classKey: 216, orderKey: key },
}))

export const DEFAULT_TAXA: TaxonRecord[] = [...BROAD_TAXA, ...ORDER_TAXA]

/** Standard taxa matching a query (by scientific/common name), for the picker. */
export function matchDefaultTaxa(query: string): TaxonRecord[] {
  const q = query.trim().toLowerCase()
  if (!q) return BROAD_TAXA
  return DEFAULT_TAXA.filter(
    (t) => t.scientificName.toLowerCase().includes(q) || (t.vernacularName ?? '').toLowerCase().includes(q),
  )
}
