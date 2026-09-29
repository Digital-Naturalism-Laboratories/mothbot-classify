import { atom } from 'nanostores'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { normalizeLegacyNightId } from '~/features/data-flow/1.ingest/ingest-paths'
import { DB_NAME } from '~/utils/index-db'

export type MorphoCover = { leafGroupId: string; patchId: string }

export const morphoCoversStore = atom<Record<string, MorphoCover>>({})

type IdbGetFn = typeof import('~/utils/index-db')['idbGet']
type IdbPutFn = typeof import('~/utils/index-db')['idbPut']

let idbGet: IdbGetFn | undefined
let idbPut: IdbPutFn | undefined
const IDB_STORE = 'morpho-covers'

// Re-export for backward compatibility
export { normalizeMorphoKey }

export async function loadMorphoCovers() {
  try {
    if (!idbGet) {
      const mod = await import('~/utils/index-db')
      idbGet = mod.idbGet
    }
    if (!idbGet) return

    const saved = (await idbGet(DB_NAME, IDB_STORE, 'covers')) as Record<string, MorphoCover> | null
    if (saved && typeof saved === 'object') {
      const normalized = normalizeMorphoCovers(saved)
      morphoCoversStore.set(normalized)
    }
  } catch {
    console.error('Error loading morpho covers')
  }
}

/**
 * The covers every dataset shared before covers moved into packages. Kept
 * untouched once a package is open: it seeds each package's covers file the
 * first time that package opens.
 */
export async function readLegacyMorphoCoversFromIdb(): Promise<Record<string, MorphoCover>> {
  try {
    if (!idbGet) {
      const mod = await import('~/utils/index-db')
      idbGet = mod.idbGet
    }
    const saved = (await idbGet?.(DB_NAME, IDB_STORE, 'covers')) as Record<string, MorphoCover> | null
    return saved && typeof saved === 'object' ? normalizeMorphoCovers(saved) : {}
  } catch {
    console.error('Error loading morpho covers')
    return {}
  }
}

export function replaceMorphoCovers(covers: Record<string, MorphoCover>) {
  morphoCoversStore.set(normalizeMorphoCovers(covers))
}

export async function setMorphoCover(params: { morphoKey?: string; label?: string; leafGroupId?: string; patchId?: string }) {
  const { leafGroupId, patchId } = params

  const keySource = (params?.morphoKey || params?.label || '').trim()
  const morphoKey = normalizeMorphoKey(keySource)

  if (!morphoKey) return
  if (!leafGroupId || !patchId) return

  const current = morphoCoversStore.get() || {}
  const next = { ...current, [morphoKey]: { leafGroupId: normalizeLegacyNightId(leafGroupId), patchId } }
  morphoCoversStore.set(next)

  if (await saveMorphoCoversToOpenPackage(next)) return

  try {
    if (!idbPut) {
      const mod = await import('~/utils/index-db')
      idbPut = mod.idbPut
    }
    if (!idbPut) return

    await idbPut(DB_NAME, IDB_STORE, 'covers', next)
  } catch {
    console.error('Error saving morpho cover')
  }
}

export async function clearMorphoCover(params: { morphoKey?: string; label?: string }) {
  const keySource = (params?.morphoKey || params?.label || '').trim()
  const morphoKey = normalizeMorphoKey(keySource)

  if (!morphoKey) return

  const current = morphoCoversStore.get() || {}
  if (!(morphoKey in current)) return

  const next = { ...current }
  delete next[morphoKey]
  morphoCoversStore.set(next)

  if (await saveMorphoCoversToOpenPackage(next)) return

  try {
    if (!idbPut) {
      const mod = await import('~/utils/index-db')
      idbPut = mod.idbPut
    }
    if (!idbPut) return

    await idbPut(DB_NAME, IDB_STORE, 'covers', next)
  } catch {
    console.error('Error clearing morpho cover')
  }
}

/**
 * With a dataset package open, covers are saved into its `02_records/` (so they
 * travel with the shareable `_processed` side) instead of the browser-wide IDB
 * map. Returns false when no package is open, so callers fall back to IDB.
 */
async function saveMorphoCoversToOpenPackage(covers: Record<string, MorphoCover>): Promise<boolean> {
  // Dynamic import: the package module imports this store.
  const { isMothboxNextPackageOpen } = await import('~/features/mothbox-next/active-package')
  if (!isMothboxNextPackageOpen()) return false

  try {
    const { writeMorphoCoversToOpenPackage } = await import('~/features/mothbox-next/morpho-covers-package')
    await writeMorphoCoversToOpenPackage(covers)
  } catch {
    console.error('Error saving morpho covers to the dataset')
  }
  return true
}

function normalizeMorphoCovers(covers: Record<string, MorphoCover>) {
  const normalized: Record<string, MorphoCover> = {}
  for (const [key, value] of Object.entries(covers ?? {})) {
    const normalizedNightId = normalizeLegacyNightId(value?.leafGroupId ?? '')
    if (!normalizedNightId || !value?.patchId) continue
    normalized[key] = { leafGroupId: normalizedNightId, patchId: value.patchId }
  }
  return normalized
}
