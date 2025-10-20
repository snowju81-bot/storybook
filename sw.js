const CACHE_VERSION = 'v2';
const STATIC_CACHE = `asanstorybook-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `asanstorybook-dynamic-${CACHE_VERSION}`;
const AUDIO_CACHE = `asanstorybook-audio-${CACHE_VERSION}`;

// 정적 자산 목록
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/asan_logo.jpg',
  '/r1.webp',
  '/r2.webp',
  '/r3.webp',
  '/r4.webp',
  '/r5.webp',
  '/r6.webp',
  '/r7.webp',
  '/r8.webp',
  '/r9.webp',
  '/r10.webp',
  '/manifest.json'
];

// 오디오 파일 목록
const AUDIO_ASSETS = [
  '/voice1.mp3',
  '/voice2.mp3',
  '/voice3.mp3',
  '/voice4.mp3',
  '/voice5.mp3',
  '/voice6.mp3',
  '/voice7.mp3',
  '/voice8.mp3',
  '/voice9.mp3',
  '/voice10.mp3'
];

// 설치 이벤트 - 정적 자산 캐싱
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    Promise.all([
      // 정적 자산 캐싱
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // 오디오 파일 캐싱 (백그라운드에서)
      caches.open(AUDIO_CACHE).then((cache) => {
        console.log('Caching audio assets');
        return Promise.all(
          AUDIO_ASSETS.map(url => 
            cache.add(url).catch(err => 
              console.warn(`Failed to cache ${url}:`, err)
            )
          )
        );
      })
    ]).then(() => {
      console.log('All assets cached successfully');
      return self.skipWaiting();
    })
  );
});

// 활성화 이벤트 - 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (![STATIC_CACHE, DYNAMIC_CACHE, AUDIO_CACHE].includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated');
      return self.clients.claim();
    })
  );
});

// 파일 타입 확인 함수들
function isImageRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => pathname.endsWith(ext));
}

function isAudioRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();
  return ['.mp3', '.wav', '.ogg', '.m4a'].some((ext) => pathname.endsWith(ext));
}

function isStaticAsset(request) {
  const url = new URL(request.url);
  return STATIC_ASSETS.includes(url.pathname);
}

// 네트워크 우선 전략 (오디오 파일용)
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    return cachedResponse || new Response('Offline - Resource not available', { status: 503 });
  }
}

// 캐시 우선 전략 (정적 자산용)
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // 백그라운드에서 업데이트
    fetch(request).then(response => {
      if (response.ok) {
        cache.put(request, response);
      }
    }).catch(() => {});
    return cachedResponse;
  }
  
  // 캐시에 없으면 네트워크에서 가져오기
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline - Resource not available', { status: 503 });
  }
}

// Fetch 이벤트 처리
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // GET 요청만 처리
  if (request.method !== 'GET') return;
  
  const url = new URL(request.url);
  
  // 같은 출처 요청만 처리
  if (url.origin !== location.origin) return;
  
  // 오디오 파일 - 네트워크 우선 전략
  if (isAudioRequest(request)) {
    event.respondWith(networkFirst(request, AUDIO_CACHE));
    return;
  }
  
  // 이미지 파일 - 캐시 우선 전략
  if (isImageRequest(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  
  // HTML 및 기타 정적 자산 - 캐시 우선 전략
  if (isStaticAsset(request) || request.destination === 'document') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  
  // 기타 요청 - 네트워크 우선 전략
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// 메시지 처리 (오프라인 상태 복구 시 캐시 업데이트)
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'updateCache') {
    console.log('캐시 업데이트 요청 받음');
    // 정적 자산 다시 캐싱
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      console.log('정적 자산 캐시 업데이트 완료');
    }).catch((error) => {
      console.error('캐시 업데이트 실패:', error);
    });
  }
});

// 백그라운드 동기화 (선택사항)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('백그라운드 동기화 실행');
    // 오프라인에서 누락된 작업들을 동기화
  }
});

// 푸시 알림 (선택사항)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      },
      actions: [
        {
          action: 'explore',
          title: '이야기 보기',
          icon: '/icon-96x96.png'
        },
        {
          action: 'close',
          title: '닫기',
          icon: '/icon-96x96.png'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});


