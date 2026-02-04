const CACHE_NAME = 'osg-app-v2';
const ASSETS_TO_CACHE = [
    './html/login.html',
    './html/osg-main.html',
    './css/style.css',
    './js/config.js',
    './js/api.js',
    './js/auth.js',
    './js/app.js',
    './assets/logo.png',
    './manifest.json'
];

// Install Event: Cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching all: app shell and content');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch Event: Network First Strategy
// 常にネットワークを優先し、エラー時のみキャッシュを使用
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // http/https以外のスキーム（chrome-extension等）はキャッシュ不可のためスキップ
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // GAS APIや外部リソースはキャッシュしない（または独自のロジック）
    if (url.href.includes('script.google.com')) {
        return; // API呼び出しはブラウザのデフォルト挙動（api.jsで制御）に任せる
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 正常なレスポンスならキャッシュを更新
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                return response;
            })
            .catch(() => {
                // オフラインまたはネットワークエラー時はキャッシュを返す
                console.log('[Service Worker] Offline mode: Serving from cache');
                return caches.match(event.request);
            })
    );
});

// Update Notification
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
