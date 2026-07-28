import type { TaxonRecord } from '~/models/taxonomy/types'

/**
 * Standard higher taxa offered as quick identification targets even when the
 * project's species list doesn't include them — e.g. spiders/mites, which are
 * out of scope for an insect-focused list but still worth labelling.
 */
export const DEFAULT_TAXA: TaxonRecord[] = [
  {
    scientificName: 'Arachnida',
    taxonRank: 'class',
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Arachnida',
    taxonID: 1367, // GBIF backbone key for class Arachnida
    vernacularName: 'Arachnids (spiders, mites, …)',
    // GBIF backbone keys for the full lineage, so the picker treats it as a
    // complete taxon (no "fill missing ranks" prompt).
    extras: { kingdomKey: 1, phylumKey: 54, classKey: 1367 },
  },
]

/** Standard taxa matching a query (by scientific/common name), for the picker. */
export function matchDefaultTaxa(query: string): TaxonRecord[] {
  const q = query.trim().toLowerCase()
  if (!q) return DEFAULT_TAXA
  return DEFAULT_TAXA.filter(
    (t) =>
      t.scientificName.toLowerCase().includes(q) ||
      (t.class ?? '').toLowerCase().includes(q) ||
      (t.vernacularName ?? '').toLowerCase().includes(q),
  )
}
