// Bump à chaque changement de stratégie/cassure de contrat : l'`activate` ci-dessous purge tout
// cache dont le nom diffère → force la suppression de l'ancien cache (ex. bundle pré-superjson)
// chez les clients ayant un SW périmé. Stratégie network-first (cf. fetch) → en ligne, toujours frais.
// Bump → `operioz-v3` : purge à l'`activate` les caches périmés, dont d'éventuelles entrées EMPOISONNÉES
// (un `/assets/*.js` mis en cache alors que le SPA-fallback avait répondu index.html en 200 → text/html
// servi comme module). Voir aussi le garde-fou anti-poison dans le handler `fetch` des assets ci-dessous.
const CACHE_NAME = 'operioz-v3';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Static assets (JS, CSS, images): network-first with cache fallback
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // ANTI-POISON : ne JAMAIS mettre en cache une réponse text/html pour un script/style (= chunk
          // hashé périmé tombé sur le SPA-fallback). Sinon on servirait du HTML comme module (MIME error)
          // et on l'empoisonnerait durablement. On laisse la réponse remonter telle quelle (404 ou html)
          // → l'import dynamique échoue → `vite:preloadError` → rechargement unique (cf. main.tsx).
          const isCode = request.destination === 'script' || request.destination === 'style';
          const ct = response.headers.get('content-type') || '';
          const poisoned = isCode && ct.includes('text/html');
          if (response.ok && !poisoned) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // HTML navigation: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hors ligne - Operioz</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
    .container { text-align: center; padding: 2rem; }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #64748b; margin-bottom: 1.5rem; }
    button { background: #4F46E5; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; }
    button:hover { background: #4338CA; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📡</div>
    <h1>Vous êtes hors ligne</h1>
    <p>Reconnectez-vous pour accéder à Operioz.</p>
    <button onclick="window.location.reload()">Réessayer</button>
  </div>
</body>
</html>`,
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        })
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const title = payload.title || 'Operioz';
  const options = { body: payload.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
