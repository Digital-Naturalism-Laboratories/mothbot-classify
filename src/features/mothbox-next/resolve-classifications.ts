import type { ClassificationRecord, CurrentClassificationRecord } from './records'
import { identificationIdOf, isWithdrawal, occurrenceKeyOf } from './identifications'

export type ClassificationRowWithSource = ClassificationRecord & {
  sourceFile: string
}

export type ResolvedClassificationRow = CurrentClassificationRecord

/**
 * The Mothbox default determination algorithm (ontology: Determination Algorithm):
 *   1. If the occurrence has any human identifications, use the latest one.
 *   2. Otherwise, use the latest machine identification.
 * Identifications a classifier later withdrew are skipped. See `resolver-spec.md`.
 */
export const DETERMINATION_ALGORITHM = 'mothbox-default/1'

function classificationTimestamp(row: ClassificationRecord): number | null {
  if (typeof row.classified_at === 'number' && Number.isFinite(row.classified_at)) return row.classified_at
  return null
}

/**
 * Machine rows: a row with a timestamp beats one without, a later timestamp beats an
 * earlier one, and on a tie the row seen first is kept. (Adapters mark a preferred
 * machine algorithm with `classified_at: 1` and leave the others `null`.)
 */
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

type OrderedRow = { row: ClassificationRowWithSource; order: number }

function timeOf(row: ClassificationRecord): number {
  return classificationTimestamp(row) ?? -Infinity
}

/** Is `a` earlier than `b` (by time, then by position in the files)? */
function isEarlier(a: OrderedRow, b: OrderedRow): boolean {
  const ta = timeOf(a.row)
  const tb = timeOf(b.row)
  if (ta !== tb) return ta < tb
  return a.order < b.order
}

/**
 * Picks the determination for one occurrence's rows, or null when nothing applies
 * (no machine row, and every human identification withdrawn).
 */
export function determineFromRows(rows: ClassificationRowWithSource[]): ClassificationRowWithSource | null {
  return determineOrdered(rows.map((row, order) => ({ row, order })))
}

function determineOrdered(entries: OrderedRow[]): ClassificationRowWithSource | null {
  const lastWithdrawalByClassifier = new Map<string, OrderedRow>()
  for (const entry of entries) {
    if (!isWithdrawal(entry.row)) continue
    const current = lastWithdrawalByClassifier.get(entry.row.classifier_id)
    if (!current || isEarlier(current, entry)) lastWithdrawalByClassifier.set(entry.row.classifier_id, entry)
  }

  let latestHuman: OrderedRow | null = null
  let machine: ClassificationRowWithSource | null = null

  for (const entry of entries) {
    if (isWithdrawal(entry.row)) continue
    const withdrawal = lastWithdrawalByClassifier.get(entry.row.classifier_id)
    if (withdrawal && isEarlier(entry, withdrawal)) continue

    if (entry.row.classifier_type === 'bot') {
      if (isNewerCandidate({ candidate: entry.row, current: machine })) machine = entry.row
      continue
    }

    if (!latestHuman || isEarlier(latestHuman, entry)) latestHuman = entry
  }

  return latestHuman?.row ?? machine
}

/**
 * The determination for every patch that has identification rows.
 *
 * Rows are grouped by occurrence (`occurrence_id`, else the patch's occurrence from
 * `occurrenceIdByPatch`, else the patch itself). Every patch of an occurrence gets the
 * occurrence's determination. Until tracking exists each occurrence holds one patch.
 */
export function resolveCurrentClassifications(params: {
  rows: ClassificationRowWithSource[]
  occurrenceIdByPatch?: ReadonlyMap<string, string>
}): CurrentClassificationRecord[] {
  const { rows, occurrenceIdByPatch } = params
  const groups = new Map<string, OrderedRow[]>()

  rows.forEach((row, order) => {
    if (!row.patch_id) return
    const key = occurrenceKeyOf(row, occurrenceIdByPatch)
    const group = groups.get(key)
    if (group) group.push({ row, order })
    else groups.set(key, [{ row, order }])
  })

  const resolved: CurrentClassificationRecord[] = []
  for (const entries of groups.values()) {
    const winner = determineOrdered(entries)
    if (!winner) continue

    const determinedFrom = identificationIdOf(winner)
    const patchIds = new Set(entries.map((e) => e.row.patch_id))
    for (const patchId of patchIds) {
      resolved.push({
        ...winner,
        patch_id: patchId,
        resolved_from: winner.sourceFile,
        determination_algorithm: DETERMINATION_ALGORITHM,
        determined_from: determinedFrom,
      })
    }
  }

  return resolved
}

export function findBotClassificationForPatch(params: {
  patchId: string
  classificationFiles?: Array<{ path: string; rows: ClassificationRecord[] }>
}): ClassificationRecord | undefined {
  const { patchId, classificationFiles } = params
  if (!patchId) return undefined

  let best: ClassificationRecord | null = null
  for (const file of classificationFiles ?? []) {
    for (const row of file.rows) {
      if (row.patch_id !== patchId) continue
      if (row.classifier_type !== 'bot') continue
      if (isNewerCandidate({ candidate: row, current: best })) best = row
    }
  }

  return best ?? undefined
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
