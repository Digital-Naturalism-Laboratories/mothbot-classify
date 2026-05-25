import { atom } from 'nanostores'
import type { ResolvedHierarchy } from './resolve-hierarchy-nodes'

export const activeHierarchyStore = atom<ResolvedHierarchy | null>(null)

export function setActiveHierarchy(resolved: ResolvedHierarchy | null) {
  activeHierarchyStore.set(resolved)
}

export function clearActiveHierarchy() {
  activeHierarchyStore.set(null)
}
