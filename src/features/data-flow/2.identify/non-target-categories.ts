import { atom, computed } from 'nanostores'
import {
  BUILT_IN_NON_TARGET_CATEGORIES,
  isNonTargetLabel,
  nonTargetPathKey,
  nonTargetPathOf,
  normalizeNonTargetLabel,
  parseNonTargetPath,
} from '~/models/non-target'
import type { DetectionEntity } from '~/models/detection.types'
import { mothboxNextPackageStore, isMothboxNextPackageOpen } from '~/features/mothbox-next/active-package'
import {
  PACKAGE_NON_TARGET_CATEGORIES_RECORD,
  serializeNonTargetCategories,
} from '~/features/mothbox-next/non-target-categories-package'
import { currentHumanIdentifierName } from '~/features/mothbox-next/human-classifier-id'
import { idbGet } from '~/utils/index-db'
import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { fileExistsAt, readTextFile, writeTextFile, type FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

/**
 * The Non-Target categories offered when labelling (ontology: Non-Target), as path keys
 * below Non-Target ("Error", "Error/Blur", "Plantae"):
 * - built in: Error and Abiotic;
 * - saved in the open dataset (`02_records/non-target-categories.ndjson`);
 * - outside a dataset, saved in this browser, including custom error reasons from older
 *   versions of Classify (`mbl/customErrorReasons`, read as Non-Target categories).
 * Categories already used in labels are added by `nonTargetCategoriesInUse`.
 */

const LOCAL_CATEGORIES_KEY = 'mbl/nonTargetCategories'
const LEGACY_ERROR_REASONS_KEY = 'mbl/customErrorReasons'

function readLocalList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function loadLocalCategories(): string[] {
  const saved = readLocalList(LOCAL_CATEGORIES_KEY)
  // Old custom error reasons ("Antenna only") become Non-Target categories.
  const legacy = readLocalList(LEGACY_ERROR_REASONS_KEY).map((reason) =>
    nonTargetPathKey(nonTargetPathOf(normalizeNonTargetLabel(`ERROR_${reason}`))),
  )
  return uniqueKeys([...saved, ...legacy])
}

/** Categories kept in this browser (used when no dataset package is open). */
export const localNonTargetCategoriesStore = atom<string[]>(loadLocalCategories())

/** Every known category: built-in, the dataset's, and this browser's. */
export const nonTargetCategoriesStore = computed(
  [localNonTargetCategoriesStore, mothboxNextPackageStore],
  (local, activePackage) =>
    uniqueKeys([
      ...BUILT_IN_NON_TARGET_CATEGORIES,
      ...(activePackage?.loaded?.nonTargetCategories ?? []),
      ...(activePackage ? [] : local),
    ]),
)

/** Categories used by detections' labels, with their parents ("Error/Blur" adds "Error"). */
export function nonTargetCategoriesInUse(detections: Iterable<DetectionEntity>): string[] {
  const keys = new Set<string>()
  for (const detection of detections) {
    if (!detection?.isError && !isNonTargetLabel(detection?.label)) continue
    const path = nonTargetPathOf(detection.label)
    for (let depth = 1; depth <= path.length; depth++) keys.add(nonTargetPathKey(path.slice(0, depth)))
  }
  return [...keys]
}

/** Every key in `keys`, with each category's parents added before it, without duplicates. */
export function uniqueKeys(keys: Iterable<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const key of keys) {
    const segments = key.split('/').map((s) => s.trim()).filter(Boolean)
    for (let depth = 1; depth <= segments.length; depth++) {
      const partial = segments.slice(0, depth).join('/')
      const folded = partial.toLowerCase()
      if (seen.has(folded)) continue
      seen.add(folded)
      out.push(partial)
    }
  }
  return out
}

/** The existing spelling of a category, matched case-insensitively. */
export function findNonTargetCategory(key: string, known: readonly string[]): string | undefined {
  const folded = key.toLowerCase()
  return known.find((k) => k.toLowerCase() === folded)
}

/**
 * Adds a category (and its parents) so it is offered from now on. In an open dataset
 * it is appended to the dataset's categories file; otherwise kept in this browser.
 */
export async function addNonTargetCategory(path: readonly string[]): Promise<void> {
  const key = nonTargetPathKey(path)
  if (!key) return

  const known = nonTargetCategoriesStore.get()
  const newKeys = uniqueKeys([key]).filter((k) => !findNonTargetCategory(k, known))
  if (!newKeys.length) return

  const active = mothboxNextPackageStore.get()
  if (!active || !isMothboxNextPackageOpen()) {
    const next = uniqueKeys([...localNonTargetCategoriesStore.get(), ...newKeys])
    localNonTargetCategoriesStore.set(next)
    try {
      localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(next))
    } catch {
      /* ignore quota/availability errors */
    }
    return
  }

  if (active.loaded) {
    mothboxNextPackageStore.set({
      ...active,
      loaded: { ...active.loaded, nonTargetCategories: uniqueKeys([...(active.loaded.nonTargetCategories ?? []), ...newKeys]) },
    })
  }

  await appendCategoriesToPackage(newKeys)
}

async function appendCategoriesToPackage(keys: string[]) {
  try {
    const root = (await idbGet(
      persistenceConstants.IDB_NAME,
      persistenceConstants.IDB_STORE,
      'projectsRoot',
    )) as FileSystemDirectoryHandleLike | null
    if (!root) return
    if (!(await ensureReadWritePermission(root as any))) return

    const existing = (await fileExistsAt(root, PACKAGE_NON_TARGET_CATEGORIES_RECORD))
      ? await readTextFile(root, PACKAGE_NON_TARGET_CATEGORIES_RECORD)
      : ''
    const prefix = existing && !existing.endsWith('\n') ? `${existing}\n` : existing
    const addedAt = new Date().toISOString()
    const addedBy = currentHumanIdentifierName()
    const lines = serializeNonTargetCategories(keys.map((path) => ({ path, addedAt, ...(addedBy ? { addedBy } : {}) })))
    await writeTextFile(root, PACKAGE_NON_TARGET_CATEGORIES_RECORD, prefix + lines)
  } catch {
    // The category still works for this session; it just won't be offered next time.
  }
}

/**
 * Which Non-Target choices a query offers.
 * - "non-target glare", "non glare", "nt glare" name a category below Non-Target;
 * - "error glare", "err glare" name one below Error;
 * - "Plantae > Leaf" style paths work after either prefix;
 * - any other text matches existing categories by name.
 * A named category that doesn't exist yet is offered as `novelPath`.
 */
export function matchNonTargetQuery(params: { query: string; categories: readonly string[] }): {
  show: boolean
  matches: string[]
  novelPath: string[] | null
} {
  const { categories } = params
  const raw = (params.query ?? '').trim()
  if (!raw) return { show: false, matches: [], novelPath: null }

  const prefix = /^(non[- _]?target|non|nt|err(?:or)?)\b\s*[:>/›]?\s*(.*)$/i.exec(raw)
  let typedPath: string[] = []
  if (prefix) {
    const rest = parseNonTargetPath(prefix[2] ?? '')
    const underError = /^err/i.test(prefix[1] ?? '')
    if (rest.length) typedPath = underError && rest[0]!.toLowerCase() !== 'error' ? ['Error', ...rest] : rest
  }

  const typedKey = nonTargetPathKey(typedPath)
  const needle = (typedKey || (prefix ? '' : raw)).toLowerCase()
  const matches = needle ? categories.filter((key) => key.toLowerCase().includes(needle)) : [...categories]
  const novelPath = typedKey && !findNonTargetCategory(typedKey, categories) ? typedPath : null

  return { show: !!prefix || matches.length > 0, matches, novelPath }
}
