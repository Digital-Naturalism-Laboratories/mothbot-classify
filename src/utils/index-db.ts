export const DB_NAME = 'mothbox-labeler'

// Every helper opens its own connection and closes it once its transaction
// settles. Leaving connections open used to stall the first write to any new
// object store: creating a store needs a version upgrade, and the upgrade waits
// until every other open connection closes — which only happened when Chrome
// garbage-collected them (~27 s on a fresh profile), or never, if another
// Classify tab held them. `onversionchange` below makes connections yield.

export async function idbPut(dbName: string, storeName: string, key: string, value: unknown): Promise<void> {
  const db = await openIdb(dbName, storeName)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value, key)
    settle(db, tx, () => resolve(), reject)
  })
}

export async function idbGet(dbName: string, storeName: string, key: string): Promise<unknown> {
  const db = await openIdb(dbName, storeName)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    settle(db, tx, () => resolve(req.result), reject)
  })
}

export async function idbDelete(dbName: string, storeName: string, key: string): Promise<void> {
  const db = await openIdb(dbName, storeName)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    settle(db, tx, () => resolve(), reject)
  })
}

/**
 * Resolves on commit, rejects on error *or abort* (e.g. QuotaExceededError on a
 * very large session-cache entry arrives as an abort — without this the caller
 * waited forever), and closes the connection either way.
 */
function settle(db: IDBDatabase, tx: IDBTransaction, onDone: () => void, onFail: (err: unknown) => void) {
  tx.oncomplete = () => {
    db.close()
    onDone()
  }
  tx.onerror = () => {
    db.close()
    onFail(tx.error)
  }
  tx.onabort = () => {
    db.close()
    onFail(tx.error ?? new DOMException('IndexedDB transaction aborted', 'AbortError'))
  }
}

/** Close this connection as soon as anyone (this tab or another) needs to upgrade the DB. */
function yieldToUpgrades(db: IDBDatabase): IDBDatabase {
  db.onversionchange = () => db.close()
  return db
}

export function openIdb(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName)

    request.onupgradeneeded = () => {
      // Fresh DB creation path; create requested store
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName)
    }

    request.onsuccess = () => {
      const db = yieldToUpgrades(request.result)
      if (db.objectStoreNames.contains(storeName)) return resolve(db)

      // Store missing in existing DB; bump version and create it
      const nextVersion = (db.version || 1) + 1
      db.close()
      const upgrade = indexedDB.open(dbName, nextVersion)
      upgrade.onupgradeneeded = () => {
        const udb = upgrade.result
        if (!udb.objectStoreNames.contains(storeName)) udb.createObjectStore(storeName)
      }
      upgrade.onblocked = () => {
        console.warn(`🚨 IndexedDB: creating store "${storeName}" is waiting for another connection (another Classify tab?) to close`)
      }
      upgrade.onsuccess = () => resolve(yieldToUpgrades(upgrade.result))
      upgrade.onerror = () => reject(upgrade.error)
    }

    request.onerror = () => reject(request.error)
  })
}
