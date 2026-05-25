import type { DatasetRegistryEntry } from '~/stores/datasets-registry'

export function resolveDefaultDatasetFolderName(params: {
  entries: DatasetRegistryEntry[]
  lastUsedFolderName?: string | null
}): string | null {
  const { entries, lastUsedFolderName } = params
  if (entries.length === 0) return null

  const lastUsed = lastUsedFolderName?.trim()
  if (lastUsed) {
    const match = entries.find((entry) => entry.folderName === lastUsed)
    if (match) return match.folderName
  }

  const sorted = [...entries].sort((a, b) => a.folderName.localeCompare(b.folderName))
  return sorted[0]?.folderName ?? null
}
