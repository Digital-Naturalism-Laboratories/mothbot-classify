/**
 * Where a species list came from: its DOI / citation reference and which
 * taxon-ID system its keys belong to.
 *
 * GBIF species-list downloads come in two styles:
 * - Old: renamed by hand to carry the DOI, e.g.
 *   `SpeciesList_CountryPanama_TaxaInsecta_doi.org10.15468dl.6nxkw6.csv`.
 *   Taxon keys are GBIF Backbone integers (`1090772`).
 * - New (Oct 2026+): GBIF's own file name is the download key, e.g.
 *   `0024609-260928105237408.csv`. Taxonomy is the Catalogue of Life (COL XR)
 *   and keys are alphanumeric (`B6L67`, `BOLD.AAA1580`).
 *
 * A download-key list's DOI comes from the GBIF API. Mothbot Process saves that
 * API answer next to the CSV as `<csv stem>.gbif.json` (see
 * Mothbot_Process/core/species_list_info.py — keep the two in sync); Classify
 * reads it, or fetches it itself when online. Offline, the list is referenced by
 * its GBIF download page URL and its DOI is shown as pending.
 */

export const GBIF_DOWNLOAD_API = 'https://api.gbif.org/v1/occurrence/download/'
export const GBIF_DOWNLOAD_PAGE = 'https://www.gbif.org/occurrence/download/'
export const COL_XR_CHECKLIST_KEY = '7ddf754f-d193-4cc9-b351-99906754a03b'
export const GBIF_SIDECAR_SUFFIX = '.gbif.json'

export type TaxonIDSource = 'gbif-backbone' | 'col'

export const TAXON_ID_SOURCE_LABELS: Record<TaxonIDSource, string> = {
  'gbif-backbone': 'GBIF Backbone Taxonomy',
  col: 'Catalogue of Life (COL XR, via GBIF)',
}

/**
 * - resolved: DOI known from the GBIF API (or a saved `.gbif.json`)
 * - filename: DOI read from a hand-renamed file name
 * - pending: a GBIF download whose DOI hasn't been fetched yet (offline)
 * - none: no DOI and no download key
 */
export type SpeciesListDoiStatus = 'resolved' | 'filename' | 'pending' | 'none'

/** Same shape as the `.gbif.json` sidecar Mothbot Process writes. */
export type GbifDownloadInfo = {
  source: 'gbif-download'
  downloadKey?: string
  doi: string
  doiUrl: string
  license?: string
  created?: string
  totalRecords?: number
  checklistKey?: string | null
  checklist?: string
  description?: string
  predicate?: unknown
  fetchedAt?: string
}

const DOWNLOAD_KEY_RE = /(?<!\d)(\d{7}-\d{15})(?!\d)/

export function downloadKeyFromFileName(fileName: string): string | undefined {
  return baseName(fileName).match(DOWNLOAD_KEY_RE)?.[1]
}

/** DOI URL from a hand-renamed file name (`…doi.org10.15468dl.6nxkw6.csv`), or undefined. */
export function doiUrlFromFileName(fileName: string): string | undefined {
  const match = baseName(fileName).match(/doi\.org[0-9A-Za-z.-]+/)
  if (!match) return undefined
  let core = match[0].replace('doi.org', '').replace(/^\.+/, '')
  if (core.toLowerCase().endsWith('.csv')) core = core.slice(0, -4)
  // A DOI prefix is always "10.<registrant>" — split there.
  const m = core.match(/^(10\.\d+)(.+)$/)
  if (!m) return undefined
  return `https://doi.org/${m[1]}/${m[2].replace(/^\.+/, '')}`
}

export function doiUrl(doi?: string | null): string | undefined {
  const bare = (doi ?? '')
    .trim()
    .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
  return bare ? `https://doi.org/${bare}` : undefined
}

export function gbifDownloadPageUrl(downloadKey: string) {
  return `${GBIF_DOWNLOAD_PAGE}${downloadKey}`
}

export function gbifSidecarPathForCsv(csvPath: string) {
  return csvPath.replace(/\.(csv|tsv)$/i, '') + GBIF_SIDECAR_SUFFIX
}

/**
 * One canonical form for any species-list reference, so refs written by
 * different versions compare equal:
 * - any DOI form → `https://doi.org/10.x/…` — including the legacy
 *   `doi.org10.15468dl.6nxkw6.csv` older Classify versions stored
 * - a GBIF download key or page URL → the download page URL
 * - anything else → trimmed as-is
 */
export function canonicalSpeciesListRef(value?: string | null): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  const key = v.match(DOWNLOAD_KEY_RE)?.[1]
  if (key && (v === key || v.includes('gbif.org'))) return gbifDownloadPageUrl(key)
  if (/doi\.org\.?10\./i.test(v)) return doiUrlFromFileName(v) ?? v
  // GBIF DOIs never end in .csv — older refs sometimes kept the file extension.
  const bare = v.replace(/\.(csv|tsv)$/i, '')
  if (/^(https?:\/\/)?(dx\.)?doi\.org\//i.test(bare) || /^doi:/i.test(bare)) return doiUrl(bare) ?? v
  if (/^10\.\d+\//.test(bare)) return doiUrl(bare) ?? v
  return v
}

/** Display name from the file name alone (before any GBIF metadata is known). */
export function speciesListNameFromFileName(fileName: string): string {
  const name = baseName(fileName).replace(/\.(csv|tsv)$/i, '')
  const key = downloadKeyFromFileName(name)
  if (key && name === key) return `GBIF download ${key}`
  if (/^SpeciesList_/i.test(name)) {
    const parts = name.replace(/^SpeciesList_/i, '').split('_')
    return parts.length >= 2 ? `${parts[0]} - ${parts[1]}` : parts[0]
  }
  return name
}

/** Display name once GBIF metadata is known, e.g. "Insecta · Panama, Costa Rica (GBIF 2026-10-13)". */
export function speciesListNameFromGbif(info: GbifDownloadInfo, fallback: string): string {
  if (!info.description) return fallback
  const date = info.created?.slice(0, 10)
  return date ? `${info.description} (GBIF ${date})` : info.description
}

/**
 * Which ID system a list's taxon keys use. Backbone keys are always integers;
 * COL XR keys are alphanumeric. Majority vote over the given keys.
 */
export function detectTaxonIDSource(keys: Iterable<unknown>): TaxonIDSource | undefined {
  let numeric = 0
  let alpha = 0
  for (const key of keys) {
    const k = key == null ? '' : String(key).trim()
    if (!k) continue
    if (/^\d+$/.test(k)) numeric++
    else alpha++
  }
  if (!numeric && !alpha) return undefined
  return alpha > numeric ? 'col' : 'gbif-backbone'
}

/**
 * Best guess for a single taxonID with no recorded source — for IDs saved
 * before sources were tracked, which all came from integer GBIF Backbone keys
 * unless they were alphanumeric COL keys.
 */
export function inferTaxonIDSource(taxonID: unknown): TaxonIDSource | undefined {
  const k = taxonID == null ? '' : String(taxonID).trim()
  if (!k) return undefined
  return /^\d+$/.test(k) ? 'gbif-backbone' : 'col'
}

const COUNTRY_NAMES: Record<string, string> = {
  PA: 'Panama',
  CR: 'Costa Rica',
  US: 'USA',
  EC: 'Ecuador',
  CO: 'Colombia',
  PE: 'Peru',
  BR: 'Brazil',
  MX: 'Mexico',
  ID: 'Indonesia',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  IN: 'India',
  CN: 'China',
  DE: 'Germany',
}
const TAXON_NAMES: Record<string, string> = { H6: 'Insecta', '216': 'Insecta', '797': 'Lepidoptera', RT: 'Arthropoda', '54': 'Arthropoda' }

/** Short description of a GBIF download filter, e.g. "Insecta · Panama, Costa Rica". */
export function describeGbifPredicate(predicate: unknown): string {
  const taxa: string[] = []
  const countries: string[] = []
  const walk = (p: any) => {
    if (!p || typeof p !== 'object') return
    for (const sub of p.predicates ?? []) walk(sub)
    if (p.predicate) walk(p.predicate)
    const values: unknown[] = Array.isArray(p.values) ? p.values : 'value' in p ? [p.value] : []
    if (p.key === 'TAXON_KEY') taxa.push(...values.map((v) => TAXON_NAMES[String(v)] ?? `taxon ${v}`))
    if (p.key === 'COUNTRY') countries.push(...values.map((v) => COUNTRY_NAMES[String(v).toUpperCase()] ?? String(v).toUpperCase()))
  }
  walk(predicate)
  const taxaText = [...new Set(taxa)].join(', ')
  const countryText = [...new Set(countries)].join(', ') || 'Worldwide'
  return taxaText ? `${taxaText} · ${countryText}` : countryText
}

/** Converts a GBIF download API response into the `.gbif.json` shape. */
export function gbifDownloadInfoFromApi(data: any): GbifDownloadInfo | undefined {
  if (!data || typeof data !== 'object' || typeof data.doi !== 'string' || !data.doi) return undefined
  const request = data.request ?? {}
  const checklistKey = typeof request.checklistKey === 'string' ? request.checklistKey : null
  return {
    source: 'gbif-download',
    downloadKey: typeof data.key === 'string' ? data.key : undefined,
    doi: data.doi,
    doiUrl: doiUrl(data.doi)!,
    license: data.license,
    created: data.created,
    totalRecords: data.totalRecords,
    checklistKey,
    checklist:
      checklistKey === COL_XR_CHECKLIST_KEY ? 'Catalogue of Life (COL XR)' : checklistKey || 'GBIF Backbone Taxonomy',
    description: describeGbifPredicate(request.predicate),
    predicate: request.predicate,
    fetchedAt: new Date().toISOString(),
  }
}

/** Validates a parsed `.gbif.json` sidecar. */
export function parseGbifSidecar(data: unknown): GbifDownloadInfo | undefined {
  if (!data || typeof data !== 'object') return undefined
  const d = data as Partial<GbifDownloadInfo>
  if (typeof d.doi !== 'string' || !d.doi) return undefined
  return { ...(d as GbifDownloadInfo), source: 'gbif-download', doiUrl: d.doiUrl || doiUrl(d.doi)! }
}

function baseName(path: string) {
  return (path ?? '').replaceAll('\\', '/').split('/').pop() ?? ''
}
