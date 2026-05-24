import type { ClassificationRecord, CurrentClassificationRecord } from './records'

export type ClassificationRowWithSource = ClassificationRecord & {
  sourceFile: string
}

export type ResolvedClassificationRow = CurrentClassificationRecord

function classificationTimestamp(row: ClassificationRecord): number | null {
  if (typeof row.classified_at === 'number' && Number.isFinite(row.classified_at)) return row.classified_at
  return null
}

function isNewerCandidate(params: {
  candidate: ClassificationRecord
  current: ClassificationRecord | null
}): boolean {
  const { candidate, current } = params
  if (!current) return true

  const candidateTs = classificationTimestamp(candidate)
  const currentTs = classificationTimestamp(current)

  if (candidateTs !== null && currentTs === null) return true
  if (candidateTs === null && currentTs !== null) return false
  if (candidateTs !== null && currentTs !== null) {
    if (candidateTs !== currentTs) return candidateTs > currentTs
  }

  if (candidate.classifier_type === 'human' && current.classifier_type === 'bot') return true
  if (candidate.classifier_type === 'bot' && current.classifier_type === 'human') return false

  return false
}

export function resolveCurrentClassifications(params: {
  rows: ClassificationRowWithSource[]
}): CurrentClassificationRecord[] {
  const { rows } = params
  const winnerByPatch = new Map<string, ClassificationRowWithSource>()

  for (const row of rows) {
    if (!row.patch_id) continue
    const current = winnerByPatch.get(row.patch_id) ?? null
    if (isNewerCandidate({ candidate: row, current })) {
      winnerByPatch.set(row.patch_id, row)
    }
  }

  const resolved: CurrentClassificationRecord[] = []
  for (const row of winnerByPatch.values()) {
    resolved.push({
      ...row,
      resolved_from: row.sourceFile,
    })
  }

  return resolved
}

export function flattenClassificationFiles(params: {
  files: Array<{ path: string; rows: ClassificationRecord[] }>
}): ClassificationRowWithSource[] {
  const out: ClassificationRowWithSource[] = []
  for (const file of params.files) {
    for (const row of file.rows) {
      out.push({ ...row, sourceFile: file.path })
    }
  }
  return out
}
