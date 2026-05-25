import type { DatasetRegistryEntry } from '~/stores/datasets-registry'

export function mergeDatasetRegistryEntries(
  existing: DatasetRegistryEntry[],
  updates: Iterable<DatasetRegistryEntry>,
): DatasetRegistryEntry[] {
  const byName = new Map(existing.map((entry) => [entry.folderName, entry]))
  for (const entry of updates) {
    byName.set(entry.folderName, entry)
  }

  return [...byName.values()].sort((a, b) => a.folderName.localeCompare(b.folderName))
}
