import { atom } from 'nanostores'

export const exportingNightIdsStore = atom<Set<string>>(new Set())

export function setNightExporting(leafGroupId: string) {
  const current = exportingNightIdsStore.get()
  exportingNightIdsStore.set(new Set([...current, leafGroupId]))
}

export function clearNightExporting(leafGroupId: string) {
  const current = exportingNightIdsStore.get()
  const next = new Set(current)
  next.delete(leafGroupId)
  exportingNightIdsStore.set(next)
}
