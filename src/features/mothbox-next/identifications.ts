import { normalizeNonTargetLabel } from '~/models/non-target'
import type { ClassificationRecord } from './records'

/**
 * Identifications (ontology: Identification). Every row in `03_classifications/` is one
 * identification: a claim by a machine or a person about what an occurrence is.
 *
 * Classify appends a row for every change instead of replacing a person's earlier row,
 * so the files keep the whole history. Older rows written before this have no
 * `identification_id`; they get a derived one that stays the same across loads.
 */

/** The id of an identification row (stored, or derived for older rows). */
export function identificationIdOf(row: Pick<ClassificationRecord, 'identification_id' | 'classifier_id' | 'patch_id'>): string {
  return row.identification_id || `${row.classifier_id}::${row.patch_id}`
}

export function newIdentificationId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function isWithdrawal(row: Pick<ClassificationRecord, 'classification_type'>): boolean {
  return row.classification_type === 'withdrawn'
}

/** The occurrence a row is about: its own `occurrence_id`, else its patch's, else the patch itself. */
export function occurrenceKeyOf(
  row: Pick<ClassificationRecord, 'occurrence_id' | 'patch_id'>,
  occurrenceIdByPatch?: ReadonlyMap<string, string>,
): string {
  return row.occurrence_id || occurrenceIdByPatch?.get(row.patch_id) || row.patch_id
}

/**
 * Patch → occurrence, for patches whose record names an occurrence other than themselves.
 * Patches without `occurrence_id` are left out: they are their own occurrence.
 */
export function occurrenceIdByPatchFromRecords(
  patches: Array<{ patch_id: string; occurrence_id?: string }> | undefined,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const patch of patches ?? []) {
    if (patch.occurrence_id && patch.occurrence_id !== patch.patch_id) out.set(patch.patch_id, patch.occurrence_id)
  }
  return out
}

/** A patch's occurrence: its record's `occurrence_id`, else the patch itself. */
export function occurrenceIdOfPatch(patch: { patch_id: string; occurrence_id?: string }): string {
  return patch.occurrence_id || patch.patch_id
}

/**
 * True when two rows make the same claim, ignoring when they were made and their ids.
 * Used so re-saving an unchanged detection appends nothing. Non-Target labels are
 * compared in their canonical form, so an old `ERROR_Blur` row and a new
 * `NON_TARGET/Error/Blur` row count as the same claim.
 */
export function sameIdentificationClaim(a: ClassificationRecord, b: ClassificationRecord): boolean {
  return claimKey(a) === claimKey(b)
}

function claimKey(row: ClassificationRecord): string {
  const isNonTarget = row.classification_type === 'error' || row.is_error === true
  const taxon = row.taxon
  return JSON.stringify([
    isNonTarget ? 'error' : row.classification_type,
    isNonTarget ? normalizeNonTargetLabel(row.label) : (row.label ?? null),
    isNonTarget ? null : (taxon?.order ?? null),
    isNonTarget ? null : (taxon?.family ?? null),
    isNonTarget ? null : (taxon?.genus ?? null),
    isNonTarget ? null : (taxon?.species ?? null),
    isNonTarget ? null : (taxon?.scientificName ?? null),
    row.morphospecies || null,
    row.species_list || null,
    row.agreed_with || null,
  ])
}

export type IdentificationHistoryEntry = {
  row: ClassificationRecord
  id: string
  sourceFile: string
  /** True when a later withdrawal by the same classifier took this identification back. */
  withdrawn: boolean
}

/**
 * Every identification of one occurrence, oldest first, with withdrawals marked.
 * Rows without a timestamp (older machine rows) sort first.
 */
export function identificationHistory(params: {
  classificationFiles: Array<{ path: string; rows: ClassificationRecord[] }> | undefined
  occurrenceKey: string
  occurrenceIdByPatch?: ReadonlyMap<string, string>
}): IdentificationHistoryEntry[] {
  const { classificationFiles, occurrenceKey, occurrenceIdByPatch } = params
  const ordered: Array<{ row: ClassificationRecord; sourceFile: string; order: number }> = []
  let order = 0
  for (const file of classificationFiles ?? []) {
    for (const row of file.rows) {
      if (occurrenceKeyOf(row, occurrenceIdByPatch) !== occurrenceKey) continue
      ordered.push({ row, sourceFile: file.path, order: order++ })
    }
  }

  ordered.sort((a, b) => timeOf(a.row) - timeOf(b.row) || a.order - b.order)

  const withdrawnIds = new Set<string>()
  const seenByClassifier = new Map<string, string[]>()
  for (const { row } of ordered) {
    const earlier = seenByClassifier.get(row.classifier_id) ?? []
    if (isWithdrawal(row)) {
      for (const id of earlier) withdrawnIds.add(id)
      seenByClassifier.set(row.classifier_id, [])
      continue
    }
    earlier.push(identificationIdOf(row))
    seenByClassifier.set(row.classifier_id, earlier)
  }

  return ordered.map(({ row, sourceFile }) => {
    const id = identificationIdOf(row)
    return { row, id, sourceFile, withdrawn: withdrawnIds.has(id) }
  })
}

function timeOf(row: ClassificationRecord): number {
  return typeof row.classified_at === 'number' && Number.isFinite(row.classified_at) ? row.classified_at : -Infinity
}
