/**
 * Any CSV or TSV file found anywhere under the datasets folder is a
 * candidate species list — there's no required folder name or location.
 * Use `isInSpeciesNamedFolder` to detect a hint for sorting/labeling.
 */
export function isSpeciesListIndexedPath(path: string) {
  const pathLower = path.replaceAll('\\', '/').toLowerCase()
  const isCsv = pathLower.endsWith('.csv') || pathLower.endsWith('.tsv')
  if (!isCsv) return false
  // Darwin Core / summary CSVs this app writes into `exports/` are outputs, not
  // species lists — excluding them keeps the picker to real reference lists.
  if (pathLower.includes('/exports/') || pathLower.startsWith('exports/')) return false
  return true
}

/**
 * True when the path includes a folder literally named "species" anywhere
 * in its chain (case-insensitive). Used only as a tie-breaker hint to float
 * these files to the top of the species list picker — never required.
 */
export function isInSpeciesNamedFolder(path: string) {
  const pathLower = path.replaceAll('\\', '/').toLowerCase()
  return pathLower.includes('/species/') || pathLower.startsWith('species/')
}
