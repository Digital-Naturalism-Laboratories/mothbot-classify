import type { ClassificationRecord } from '../records'

export function mergeClassifierRowsByPatchId(params: {
  existing: ClassificationRecord[]
  updates: ClassificationRecord[]
}): ClassificationRecord[] {
  const { existing, updates } = params
  const byPatch = new Map<string, ClassificationRecord>()

  for (const row of existing) {
    if (row.patch_id) byPatch.set(row.patch_id, row)
  }

  for (const row of updates) {
    if (row.patch_id) byPatch.set(row.patch_id, row)
  }

  return Array.from(byPatch.values())
}
