/**
 * Tiny IndexedDB key-value store for large per-browser caches (the catalog snapshot).
 * Every failure (private mode, blocked storage, no IndexedDB) degrades to "no cache".
 */
const DB_NAME = 'music-ui';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.addEventListener('upgradeneeded', () => request.result.createObjectStore(STORE));
      request.addEventListener('success', () => {
        const db = request.result;
        // Let another tab (or a deleteDatabase) proceed: reconnect lazily next time.
        db.addEventListener('versionchange', () => {
          db.close();
          dbPromise = null;
        });
        resolve(db);
      });
      request.addEventListener('error', () => resolve(null));
      request.addEventListener('blocked', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const request = fn(db.transaction(STORE, mode).objectStore(STORE));
          request.addEventListener('success', () => resolve(request.result as T));
          request.addEventListener('error', () => resolve(undefined));
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run<T>('readonly', (store) => store.get(key));
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await run('readwrite', (store) => store.put(value, key));
}

/** Closes the connection (used by tests). */
export async function resetIdbConnection(): Promise<void> {
  const db = await dbPromise;
  db?.close();
  dbPromise = null;
}
