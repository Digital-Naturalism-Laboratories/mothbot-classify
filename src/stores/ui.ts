import { atom, computed } from 'nanostores'
import { patchesStore } from './entities/5.patches'
import { DB_NAME, idbGet, idbPut } from '~/utils/index-db'

export const pickerErrorStore = atom<string | null>(null)

export const selectedPatchIdsStore = atom<Set<string>>(new Set())
export const selectionLeafGroupIdStore = atom<string | null>(null)

// UI: hovered/previewed cluster id for selection preview
export const selectedClusterIdStore = atom<number | null>(null)

export function setSelectedClusterId(params: { clusterId: number | null }) {
  const { clusterId } = params || {}
  const next = typeof clusterId === 'number' ? clusterId : null
  selectedClusterIdStore.set(next)
}

// UI: hovered/previewed sub-cluster id (exact numeric cluster id)
export const selectedSubClusterIdStore = atom<number | null>(null)

export function setSelectedSubClusterId(params: { clusterId: number | null }) {
  const { clusterId } = params || {}
  const next = typeof clusterId === 'number' ? clusterId : null
  selectedSubClusterIdStore.set(next)
}

export function togglePatchSelection(params: { patchId: string }) {
  const { patchId } = params

  if (!patchId) return

  const patch = patchesStore.get()?.[patchId]
  const patchNightId = patch?.leafGroupId ?? null

  if (!patchNightId) return

  const currentSelected = new Set(selectedPatchIdsStore.get() ?? new Set())
  const currentNightId = selectionLeafGroupIdStore.get()

  if (currentNightId && currentNightId !== patchNightId) {
    selectedPatchIdsStore.set(new Set([patchId]))
    selectionLeafGroupIdStore.set(patchNightId)
    return
  }

  if (currentSelected.has(patchId)) {
    currentSelected.delete(patchId)
    selectedPatchIdsStore.set(currentSelected)
    if (currentSelected.size === 0) selectionLeafGroupIdStore.set(null)
    return
  }

  currentSelected.add(patchId)
  selectedPatchIdsStore.set(currentSelected)

  if (!currentNightId) selectionLeafGroupIdStore.set(patchNightId)
}

export function clearPatchSelection() {
  selectedPatchIdsStore.set(new Set())
  selectionLeafGroupIdStore.set(null)
}

export function setSelection(params: { leafGroupId: string; patchIds: string[] }) {
  const { leafGroupId, patchIds } = params
  if (!leafGroupId) return
  const next = new Set<string>()
  for (const id of patchIds ?? []) if (id) next.add(id)
  selectedPatchIdsStore.set(next)
  selectionLeafGroupIdStore.set(next.size > 0 ? leafGroupId : null)
}

// User session (initials)
export type UserSession = { initials?: string }
export const userSessionStore = atom<UserSession>({})
export const userSessionLoadedStore = atom<boolean>(false)
export const appReadyStore = computed(userSessionLoadedStore, (loaded) => !!loaded)

export async function loadUserSession() {
  try {
    const saved = (await idbGet(DB_NAME, 'user-session', 'session')) as UserSession | null
    if (saved && typeof saved === 'object') userSessionStore.set(saved)
  } catch {
    return null
  } finally {
    userSessionLoadedStore.set(true)
  }
}
export async function saveUserSession(params: UserSession) {
  const next = { initials: (params?.initials || '').trim() || undefined }
  userSessionStore.set(next)
  try {
    await idbPut(DB_NAME, 'user-session', 'session', next)
  } catch {
    return null
  }
}
export async function clearUserSession() {
  userSessionStore.set({})
  try {
    await idbPut(DB_NAME, 'user-session', 'session', {})
  } catch {
    return null
  }
}

// Night ingest progress (processed patches count per night)
export const leafGroupIngestProgressStore = atom<{ leafGroupId?: string; processed: number; total: number }>({ processed: 0, total: 0 })

export function resetNightIngestProgress(params?: { leafGroupId?: string }) {
  const { leafGroupId } = params || {}
  console.log('🏁 progress: reset', { leafGroupId })
  leafGroupIngestProgressStore.set({ leafGroupId, processed: 0, total: 0 })
}

export function setNightIngestTotal(params: { leafGroupId: string; total: number }) {
  const { leafGroupId, total } = params
  const current = leafGroupIngestProgressStore.get() || { processed: 0, total: 0 }
  console.log('🎯 progress: set total', {
    leafGroupId,
    total,
    prev: { leafGroupId: current.leafGroupId, processed: current.processed, total: current.total },
  })
  leafGroupIngestProgressStore.set({ leafGroupId, processed: current.processed, total })
}

export function incrementNightIngestProcessed(params: { leafGroupId: string; by?: number }) {
  const { leafGroupId, by = 1 } = params
  const current = leafGroupIngestProgressStore.get() || { processed: 0, total: 0 }
  const processed = (current.leafGroupId === leafGroupId ? current.processed : 0) + by
  const total = current.leafGroupId === leafGroupId ? current.total : 0
  leafGroupIngestProgressStore.set({ leafGroupId, processed, total })
}

export function addNightIngestTotal(params: { leafGroupId: string; by: number }) {
  const { leafGroupId, by } = params
  const current = leafGroupIngestProgressStore.get() || { processed: 0, total: 0 }
  const total = (current.leafGroupId === leafGroupId ? current.total : 0) + (by || 0)
  const processed = current.leafGroupId === leafGroupId ? current.processed : 0
  console.log('➕ progress: add to total', {
    leafGroupId,
    by,
    prev: { leafGroupId: current.leafGroupId, processed: current.processed, total: current.total },
    next: { processed, total },
  })
  leafGroupIngestProgressStore.set({ leafGroupId, processed, total })
}

// Active nights tracking for memory management
// Keeps track of currently active night and recently viewed nights
// Used to determine which File objects to keep in memory
export const activeNightIdStore = atom<string | null>(null)
export const recentlyViewedLeafGroupIdsStore = atom<Set<string>>(new Set())

const MAX_RECENTLY_VIEWED = 2

export function markLeafGroupAsActive(params: { leafGroupId: string }) {
  const { leafGroupId } = params
  const currentActive = activeNightIdStore.get()
  const recent = new Set(recentlyViewedLeafGroupIdsStore.get())

  if (currentActive && currentActive !== leafGroupId) {
    recent.add(currentActive)
    const recentArray = Array.from(recent)
    if (recentArray.length > MAX_RECENTLY_VIEWED) {
      const oldest = recentArray[0]
      recent.delete(oldest)
    }
  }

  activeNightIdStore.set(leafGroupId)
  recentlyViewedLeafGroupIdsStore.set(recent)
}

export function getActiveLeafGroupIds(): Set<string> {
  const active = activeNightIdStore.get()
  const recent = recentlyViewedLeafGroupIdsStore.get()
  const result = new Set<string>()
  if (active) result.add(active)
  for (const id of recent) result.add(id)
  return result
}
