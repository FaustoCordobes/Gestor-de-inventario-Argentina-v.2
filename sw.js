/* Mostrador · service worker (modo sin conexión)
 *
 * - Guarda la aplicación completa al instalarse, así abre y vende sin internet.
 * - Los datos NO pasan por acá: viven en IndexedDB del navegador.
 * - Al publicar una versión nueva hay que cambiar VERSION. La app avisa
 *   "Hay una versión nueva" y se actualiza cuando la persona toca el botón,
 *   nunca en medio de una venta.
 */
const VERSION = 'mostrador-4.0.0';
const APP_SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/domain.js', 'js/seed.js', 'js/storage.js', 'js/reports.js',
  'js/ui/base.js', 'js/ui/ticket.js', 'js/ui/inicio.js', 'js/ui/vender.js', 'js/ui/mercaderia.js',
  'js/ui/caja.js', 'js/ui/contactos.js', 'js/ui/informes.js', 'js/ui/config.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
// Bibliotecas externas con versión fija: se guardan una vez y no cambian.
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
];
const FUENTES = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP_SHELL); // si falta un archivo propio, la instalación falla y sigue la versión anterior
    // Las bibliotecas externas son opcionales para abrir la app (Excel/PDF): si fallan, se guardan al usarlas
    await Promise.all(LIBS.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k.startsWith('mostrador-')) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;

  // Páginas: primero lo guardado (abre al instante y sin internet)
  if (req.mode === 'navigate' && propio) {
    e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  // Archivos de la app y bibliotecas con versión fija: lo guardado, y si no está, de la red (y se guarda)
  if (propio || LIBS.includes(req.url)) {
    e.respondWith(caches.match(req, { ignoreSearch: propio }).then((r) => r || fetch(req).then((res) => {
      if (res.ok && (propio || res.type === 'cors')) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
      return res;
    })));
    return;
  }
  // Tipografías: lo guardado y se actualiza en segundo plano; sin internet usa las del sistema
  if (FUENTES.some((f) => req.url.startsWith(f))) {
    e.respondWith(caches.open(VERSION + '-fuentes').then(async (c) => {
      const guardado = await c.match(req);
      const red = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => guardado);
      return guardado || red;
    }));
  }
  // Todo lo demás (por ejemplo Supabase en el futuro) va directo a la red, sin cache.
});
