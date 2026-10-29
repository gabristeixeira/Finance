// Service worker: deixa o app abrir sem internet (a "casca" fica guardada no aparelho).
// Os DADOS vêm do Supabase e têm cópia local em localStorage (ver js/db.js).
// Ao publicar uma nova versão do app, aumente VERSAO para forçar a atualização.
const VERSAO = 'cf-v2';
const CASCA = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'app.js', 'ui.js', 'telas.js', 'folhas.js', 'db.js', 'logic.js', 'config.js',
  'supabase.js', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Arquivos do próprio app: responde com o que tem guardado e atualiza em segundo plano.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase e fontes passam direto
  e.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      const guardado = await cache.match(req, { ignoreSearch: true });
      const rede = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => guardado);
      return guardado || rede;
    }),
  );
});
