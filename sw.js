const CACHE = 'word-engine-demo';
const files = new Map();

const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  gz: 'application/gzip',
  txt: 'text/plain; charset=utf-8',
};

function appPrefix() {
  return new URL('app/', self.registration.scope).pathname;
}

function contentType(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1);
  return TYPES[ext] ?? 'application/octet-stream';
}

function fileName(pathname) {
  const prefix = appPrefix();
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  let name = decodeURIComponent(pathname.slice(prefix.length));
  if (name === '' || name.endsWith('/')) {
    name += 'index.html';
  }
  return name;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'mount') {
    return;
  }
  event.waitUntil(
    (async () => {
      const prefix = appPrefix();
      const cache = await caches.open(CACHE);
      const stale = await cache.keys();
      await Promise.all(stale.map((request) => cache.delete(request)));
      files.clear();
      const puts = [];
      for (const [name, bytes] of data.files) {
        const copy = new Uint8Array(bytes);
        files.set(name, copy);
        puts.push(
          cache.put(
            new URL(prefix + name, self.location.origin),
            new Response(copy.slice(), { headers: { 'Content-Type': contentType(name) } }),
          ),
        );
      }
      await Promise.all(puts);
      event.ports[0]?.postMessage({ ok: true });
    })().catch(() => {
      event.ports[0]?.postMessage({ ok: false });
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  const name = fileName(url.pathname);
  if (name === null) {
    return;
  }
  event.respondWith(serve(name, event.request));
});

async function serve(name, request) {
  const memory = files.get(name);
  if (memory) {
    return new Response(memory.slice(), { headers: { 'Content-Type': contentType(name) } });
  }
  const cached = await caches.match(new URL(appPrefix() + name, self.location.origin));
  if (cached) {
    return cached;
  }
  if (request.mode === 'navigate') {
    return Response.redirect(self.registration.scope, 302);
  }
  return new Response('Not found', { status: 404 });
}
