// src/utils/indexedDB.ts
// A simple Promise-based wrapper for IndexedDB to store heavy Bible data

const DB_NAME = 'NationsBibleDB';
const LEGACY_DB_NAME = 'CeumBibleDB';
const STORE_NAME = 'bibleVersions';
const DB_VERSION = 1;

function getDB(dbName: string = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// 기존 CeumBibleDB 데이터 자동 마이그레이션 플래그
let migrationChecked = false;

async function checkAndMigrateLegacyDB(currentDB: IDBDatabase): Promise<void> {
  if (migrationChecked) return;
  migrationChecked = true;
  try {
    const legacyDB = await new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open(LEGACY_DB_NAME, DB_VERSION);
      req.onerror = () => resolve(null);
      req.onsuccess = () => resolve(req.result);
    });
    if (!legacyDB) return;
    if (!legacyDB.objectStoreNames.contains(STORE_NAME)) {
      legacyDB.close();
      return;
    }

    const legacyItems = await new Promise<any[]>((resolve) => {
      const tx = legacyDB.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    legacyDB.close();

    if (legacyItems && legacyItems.length > 0) {
      console.log(`[indexedDB] Migrating ${legacyItems.length} Bible versions from CeumBibleDB to NationsBibleDB...`);
      const tx = currentDB.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of legacyItems) {
        store.put(item);
      }
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      console.log('[indexedDB] Migration to NationsBibleDB completed successfully.');
    }
  } catch (e) {
    console.warn('[indexedDB] Legacy migration check skipped or failed:', e);
  }
}

export const bibleDB = {
  async saveVersion(version: any): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(version);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getVersion(id: string): Promise<any> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllVersions(): Promise<any[]> {
    const db = await getDB();
    await checkAndMigrateLegacyDB(db);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteVersion(id: string): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async clearAll(): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};
