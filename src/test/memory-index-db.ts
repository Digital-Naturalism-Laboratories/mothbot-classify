/**
 * In-memory stand-in for `~/utils/index-db` — jsdom has no IndexedDB. Use it in
 * a test file that exercises code touching IndexedDB:
 *
 *   vi.mock('~/utils/index-db', () => import('~/test/memory-index-db'))
 *
 * Call `resetMemoryIndexDb()` in beforeEach if tests must not share state.
 */

const stores = new Map<string, Map<string, unknown>>()

export const DB_NAME = 'mothbox-labeler-test'

export async function idbPut(_dbName: string, storeName: string, key: string, value: unknown): Promise<void> {
  if (!stores.has(storeName)) stores.set(storeName, new Map())
  stores.get(storeName)!.set(key, value)
}

export async function idbGet(_dbName: string, storeName: string, key: string): Promise<unknown> {
  return stores.get(storeName)?.get(key)
}

export async function idbDelete(_dbName: string, storeName: string, key: string): Promise<void> {
  stores.get(storeName)?.delete(key)
}

export function openIdb(): Promise<IDBDatabase> {
  return Promise.reject(new Error('openIdb is not available in tests — use idbGet/idbPut/idbDelete'))
}

export function resetMemoryIndexDb() {
  stores.clear()
}
