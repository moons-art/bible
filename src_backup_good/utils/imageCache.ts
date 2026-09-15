// src/utils/imageCache.ts

const DB_NAME = 'bible-ccm-cache';
const DB_VERSION = 1;
const STORE_NAME = 'music-sheets-v2';

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

export const imageCache = {
  // 캐싱된 이미지 조회
  getImage: async (fileId: string): Promise<Blob | null> => {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(fileId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          if (request.result) {
            if (request.result.buffer && request.result.type) {
              resolve(new Blob([request.result.buffer], { type: request.result.type }));
            } else if (request.result instanceof Blob) {
              resolve(request.result);
            } else {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
      });
    } catch (e) {
      console.error('[imageCache] Failed to get image from IndexedDB:', e);
      return null;
    }
  },

  // 다운로드한 이미지 저장
  saveImage: async (fileId: string, blob: Blob): Promise<void> => {
    try {
      const buffer = await blob.arrayBuffer();
      const type = blob.type;
      
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ buffer, type }, fileId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (e) {
      console.error('[imageCache] Failed to save image to IndexedDB:', e);
    }
  },

  // 악보 캐시 전체 지우기
  clearCache: async (): Promise<void> => {
    try {
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (e) {
      console.error('[imageCache] Failed to clear IndexedDB cache:', e);
      throw e;
    }
  }
};
