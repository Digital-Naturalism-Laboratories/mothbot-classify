import type { TaxonRecord } from './types'
import {
  TAXON_KEY_STYLES,
  inferTaxonIDSource,
  normalizeTaxonKeyStyle,
  type TaxonKeyStyle,
} from './species-list-source'

/** Every key known for a taxon by style: `taxonKeys` plus `taxonID` under its own style. */
export function taxonKeysOf(taxon?: Pick<TaxonRecord, 'taxonID' | 'taxonIDSource' | 'taxonKeys'> | null): Partial<Record<TaxonKeyStyle, string>> {
  const out: Partial<Record<TaxonKeyStyle, string>> = {}
  for (const [style, key] of Object.entries(taxon?.taxonKeys ?? {})) {
    const normalized = normalizeTaxonKeyStyle(style)
    const value = key == null ? '' : String(key).trim()
    if (normalized && value) out[normalized] = value
  }
  const id = taxon?.taxonID == null ? '' : String(taxon.taxonID).trim()
  if (id) {
    const style = normalizeTaxonKeyStyle(taxon?.taxonIDSource) ?? inferTaxonIDSource(id)
    if (style) out[style] = id
  }
  return out
}

/** The key style of a taxon's `taxonID`, reading the older `'gbif-backbone'` too. */
export function taxonKeyStyleOf(taxon?: Pick<TaxonRecord, 'taxonID' | 'taxonIDSource'> | null): TaxonKeyStyle | undefined {
  if (taxon?.taxonID == null || taxon.taxonID === '') return undefined
  return normalizeTaxonKeyStyle(taxon.taxonIDSource) ?? inferTaxonIDSource(taxon.taxonID)
}

/**
 * Extra keys a species-list row names in its own columns, for the row's own taxon.
 * Recognises Antenna's column names and common variants.
 */
const KEY_COLUMNS: Record<TaxonKeyStyle, string[]> = {
  gbif: ['gbif_taxon_key', 'gbiftaxonkey', 'gbifkey'],
  col: ['col_taxon_key', 'coltaxonkey', 'colid'],
  bold: ['bold_taxon_bin', 'boldbin', 'bold_bin', 'bin'],
  inat: ['inat_taxon_id', 'inattaxonid', 'inaturalist_taxon_id', 'inaturalisttaxonid'],
  fieldguide: ['fieldguide_id', 'fieldguideid', 'fieldguide_uuid'],
}

export function taxonKeysFromRowColumns(row: Record<string, unknown>): Partial<Record<TaxonKeyStyle, string>> {
  const lower = new Map<string, unknown>()
  for (const [key, value] of Object.entries(row ?? {})) lower.set(key.trim().toLowerCase(), value)
  const out: Partial<Record<TaxonKeyStyle, string>> = {}
  for (const style of TAXON_KEY_STYLES) {
    for (const column of KEY_COLUMNS[style]) {
      const value = lower.get(column)
      const text = value == null ? '' : String(value).trim()
      if (text) {
        out[style] = text
        break
      }
    }
  }
  return out
}

/** A BOLD BIN named as a row's scientific name ("BOLD:AAC2117"), if any. */
export function boldBinOfRow(row: Record<string, unknown>): string | undefined {
  const name = String(row?.scientificName ?? '').trim()
  return /^BOLD:[A-Z]{3}\d{4}$/i.test(name) ? name.toUpperCase() : undefined
}
