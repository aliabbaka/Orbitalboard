/* Public app assets only. Never store board API responses, credentials, questions or failed writes. */
const PREFIX = 'orbitalboard-0.5-';
let currentCache;
async function cacheName() {
  if (!currentCache) currentCache = (await caches.keys()).filter(name => name.startsWith(PREFIX)).at(-1);
  return currentCache;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch('/offline-manifest.json', { cache: 'no-store' }); if (!response.ok) throw new Error('Offline manifest unavailable.');
    const manifest = await response.json(); if (!manifest.version.startsWith(PREFIX) || !Array.isArray(manifest.assets)) throw new Error('Invalid asset manifest.');
    const cache = await caches.open(manifest.version);
    try { await cache.addAll(manifest.assets); currentCache = manifest.version; }
    catch (error) { await caches.delete(manifest.version); throw error; }
    // No skipWaiting: do not replace code underneath an unsaved live board.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => { const name = await cacheName(); for (const old of await caches.keys()) if ((old.startsWith(PREFIX) || old.startsWith('orbitalboard-0.4-')) && old !== name) await caches.delete(old); await self.clients.claim(); })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(event.request); }
      catch {
        const cache = await caches.open(await cacheName()); const shell = url.pathname.startsWith('/b/') || url.pathname === '/board' ? '/board' : url.pathname === '/tools' ? '/tools' : '/';
        return await cache.match(shell) || new Response('Offline app assets are not ready. Visit online once first.', { status: 503 });
      }
    })()); return;
  }
  if (url.pathname.startsWith('/dist/') || url.pathname.startsWith('/vendor/') || ['/styles.css', '/board.css', '/tools.css', '/favicon.svg'].includes(url.pathname)) {
    event.respondWith((async () => { const cache = await caches.open(await cacheName()); return await cache.match(event.request) || fetch(event.request); })());
  }
});
