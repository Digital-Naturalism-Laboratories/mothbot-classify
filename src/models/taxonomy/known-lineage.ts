/**
 * Lineage of well-known arthropod orders, so an order typed by hand (or picked
 * from a list that lacks higher ranks) lands under the right class instead of
 * inheriting whatever class the detection had before. GBIF backbone keys were
 * checked against api.gbif.org.
 */

export type KnownOrderLineage = { kingdom: string; phylum: string; class: string }

/** Insect orders: [order, GBIF backbone key, common name]. */
export const INSECT_ORDERS: Array<[string, number, string]> = [
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

/** Arachnid orders that turn up at light traps: [order, GBIF backbone key, common name]. */
export const ARACHNID_ORDERS: Array<[string, number, string]> = [
  ['Araneae', 1496, 'Spiders'],
  ['Opiliones', 907, 'Harvestmen'],
  ['Pseudoscorpiones', 1161, 'Pseudoscorpions'],
  ['Scorpiones', 872, 'Scorpions'],
  ['Trombidiformes', 543, 'Mites'],
  ['Sarcoptiformes', 542, 'Mites'],
  ['Mesostigmata', 1109, 'Mites'],
  ['Ixodida', 1425, 'Ticks'],
]

const ARTHROPOD = { kingdom: 'Animalia', phylum: 'Arthropoda' }

const LINEAGE_BY_ORDER = new Map<string, KnownOrderLineage>([
  ...INSECT_ORDERS.map(([order]) => [order.toLowerCase(), { ...ARTHROPOD, class: 'Insecta' }] as const),
  ...ARACHNID_ORDERS.map(([order]) => [order.toLowerCase(), { ...ARTHROPOD, class: 'Arachnida' }] as const),
])

export function knownLineageForOrder(order: string | undefined | null): KnownOrderLineage | undefined {
  const key = (order ?? '').trim().toLowerCase()
  return key ? LINEAGE_BY_ORDER.get(key) : undefined
}

/**
 * Puts a taxon with a well-known order under that order's class, filling
 * missing kingdom/phylum. Returns the same object when nothing changes. Used to
 * repair IDs saved before class was tracked correctly (e.g. Araneae under Insecta).
 */
export function withKnownOrderLineage<T extends { kingdom?: string; phylum?: string; class?: string; order?: string }>(
  taxon: T,
): T {
  const lineage = knownLineageForOrder(taxon?.order)
  if (!lineage) return taxon
  if (taxon.class === lineage.class && taxon.phylum && taxon.kingdom) return taxon
  return {
    ...taxon,
    kingdom: taxon.kingdom || lineage.kingdom,
    phylum: taxon.class === lineage.class ? taxon.phylum || lineage.phylum : lineage.phylum,
    class: lineage.class,
  }
}
