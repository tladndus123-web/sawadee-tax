"use client";

// A small key → value store in the browser's IndexedDB, for copies the app can always download again (the ledger,
// for speed). Every failure (private mode, storage off, old browser) answers "nothing kept" — the app then just
// downloads as before.

const DB = "sawadee-cache";
const STORE = "kv";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = act(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

export const cacheGet = <T>(key: string) => run<T>("readonly", (s) => s.get(key) as IDBRequest<T>);
export const cacheSet = (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key));
/** Everything kept on this device (signing out) */
export const cacheClear = () => run("readwrite", (s) => s.clear());
