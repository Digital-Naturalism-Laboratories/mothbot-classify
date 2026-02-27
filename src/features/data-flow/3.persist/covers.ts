import { atom } from 'nanostores'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { normalizeLegacyNightId } from '~/features/data-flow/1.ingest/ingest-paths'
import { DB_NAME } from '~/utils/index-db'

export type MorphoCover = { nightId: string; patchId: string }

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

export async function setMorphoCover(params: { morphoKey?: string; label?: string; nightId?: string; patchId?: string }) {
  const { nightId, patchId } = params

  const keySource = (params?.morphoKey || params?.label || '').trim()
  const morphoKey = normalizeMorphoKey(keySource)

  if (!morphoKey) return
  if (!nightId || !patchId) return

  const current = morphoCoversStore.get() || {}
  const next = { ...current, [morphoKey]: { nightId: normalizeLegacyNightId(nightId), patchId } }
  morphoCoversStore.set(next)

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

function normalizeMorphoCovers(covers: Record<string, MorphoCover>) {
  const normalized: Record<string, MorphoCover> = {}
  for (const [key, value] of Object.entries(covers ?? {})) {
    const normalizedNightId = normalizeLegacyNightId(value?.nightId ?? '')
    if (!normalizedNightId || !value?.patchId) continue
    normalized[key] = { nightId: normalizedNightId, patchId: value.patchId }
  }
  return normalized
}
