import { atom } from 'nanostores'

export const exportingNightIdsStore = atom<Set<string>>(new Set())

export function setNightExporting(nightId: string) {
  const current = exportingNightIdsStore.get()
  exportingNightIdsStore.set(new Set([...current, nightId]))
}

export function clearNightExporting(nightId: string) {
  const current = exportingNightIdsStore.get()
  const next = new Set(current)
  next.delete(nightId)
  exportingNightIdsStore.set(next)
}
