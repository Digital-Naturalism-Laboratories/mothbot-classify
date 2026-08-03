import { atom } from 'nanostores'
import { normalizeMorphoKey } from '~/models/taxonomy/morphospecies'
import { DB_NAME, idbGet, idbPut } from '~/utils/index-db'

export type MorphoLinksMap = Record<string, string>

export type MorphoLinksStoreMode = 'replace' | 'merge'

export const morphoLinksStore = atom<MorphoLinksMap>({})

const IDB_STORE = 'morpho-links'

let saveTimer: number | undefined

export function setMorphoLinksForActiveDataset(params: { links: MorphoLinksMap; mode: MorphoLinksStoreMode }) {
  const { links, mode } = params
  const next = mode === 'merge' ? { ...(morphoLinksStore.get() || {}), ...links } : { ...links }

  morphoLinksStore.set(next)
  return next
}

export async function saveMorphoLinksToIdb(links: MorphoLinksMap) {
  try {
    await idbPut(DB_NAME, IDB_STORE, 'links', links)
  } catch {
    console.error('🚨 morphoLinks: IDB save failed')
  }
}

export async function loadMorphoLinks() {
  try {
    const saved = (await idbGet(DB_NAME, IDB_STORE, 'links')) as MorphoLinksMap | null
    if (saved && typeof saved === 'object') setMorphoLinksForActiveDataset({ links: saved, mode: 'replace' })
  } catch {
    console.error('🚨 morphoLinks: IDB load failed')
  }
}

export async function setMorphoLink(params: { morphoKey?: string; label?: string; url?: string }) {
  const { url } = params

  const keySource = (params?.morphoKey || params?.label || '').trim()
  const key = normalizeMorphoKey(keySource)

  if (!key) return

  const current = morphoLinksStore.get() || {}
  const next: MorphoLinksMap = { ...current }

  if (typeof url === 'string' && url.trim()) next[key] = url.trim()
  else delete next[key]

  morphoLinksStore.set(next)
  await saveMorphoLinksToIdb(next)

  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    void saveMorphoLinksToDisk()
  }, 300)
}

export async function saveMorphoLinksToDisk() {
  try {
    const mod = await import('./files.writer')
    const writer = mod.writeMorphoLinksToDisk
    if (typeof writer === 'function') await writer()
  } catch {
    console.error('🚨 morphoLinks: disk save failed')
  }
}
