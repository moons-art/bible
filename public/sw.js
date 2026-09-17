// PWA Service Worker for NATIONS BIBLE
// Chrome, Edge 등 Chromium 기반 브라우저의 PWA 설치 가능 조건(Installability) 충족을 위한 가볍고 안전한 서비스 워커

const CACHE_NAME = 'nations-bible-pwa-v1';

// 설치 시 즉시 활성화
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 활성화 시 구버전 캐시 정리 및 제어권 즉시 획득
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// fetch 이벤트 핸들러: 네트워크 우선 처리 (배포 시 이전 캐시 꼬임 방지)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
