export function isSpeciesListIndexedPath(path: string) {
  const pathLower = path.replaceAll('\\', '/').toLowerCase()
  const isSpeciesFolder = pathLower.includes('/species/') || pathLower.startsWith('species/')
  const isCsv = pathLower.endsWith('.csv') || pathLower.endsWith('.tsv')
  return isSpeciesFolder && isCsv
}
