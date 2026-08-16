// ============================================================
// SERVICE WORKER - Comunidad Place (panel de gestión)
// ============================================================
// IMPORTANTE: subí este número cada vez que hagas un deploy con cambios
// relevantes. Al cambiar, el Service Worker detecta que es "nuevo",
// vuelve a precargar todo y le avisa al usuario para que actualice
// (ver pwa.js, que muestra el aviso "Hay una nueva versión disponible").
const VERSION = 'v1.1.1';
const CACHE_NAME = `comunidadplace-${VERSION}`;

// Archivos propios de la app (rutas relativas, sin "/", para que funcionen
// igual en cualquier subcarpeta o dominio de Vercel).
const ARCHIVOS_PRECARGA = [
  'login.html',
  'admin.html',
  'dashboard.html',
  'login.js',
  'admin.js',
  'dashboard.js',
  'supabase-client.js',
  'image-upload.js',
  'qr-cards.js',
  'qrcode_min.js',
  'manifest.json',
  'pwa.css',
  'pwa.js',
  'icon-192.png',
  'icon-512.png'
];

// ------------------------------------------------------------
// INSTALL: precarga el "shell" de la app. Se usa allSettled en vez de
// cache.addAll para que, si falta algún archivo (ej. un ícono que todavía
// no subiste), no rompa la instalación completa del Service Worker.
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        ARCHIVOS_PRECARGA.map((archivo) =>
          cache.add(archivo).catch((err) => {
            console.warn(`[SW] No se pudo precachear "${archivo}":`, err.message);
          })
        )
      )
    )
  );
});

// ------------------------------------------------------------
// ACTIVATE: borra versiones de caché viejas y toma control inmediato
// de las páginas abiertas.
// ------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith('comunidadplace-') && nombre !== CACHE_NAME)
            .map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Permite que la página fuerce la activación del SW nuevo apenas el
// usuario toca "Actualizar" en el aviso (ver pwa.js).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ------------------------------------------------------------
// FETCH
// ------------------------------------------------------------
// - Navegación (cargar una página) y archivos propios .html/.js/.css/.json:
//   Network First -> siempre trae la versión más nueva del servidor; si no
//   hay conexión, usa la última copia guardada en caché.
// - Todo lo demás (Google Fonts, Cloudinary, íconos, CDNs, Supabase, etc.):
//   Stale While Revalidate -> responde rápido con la copia en caché (si
//   existe) y en paralelo la actualiza para la próxima vez.
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const esMismoOrigen = url.origin === self.location.origin;
  const esNavegacion = request.mode === 'navigate';
  const esRecursoPropio = esMismoOrigen && /\.(html|js|css|json)$/.test(url.pathname);

  if (esNavegacion || esRecursoPropio) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const respuestaRed = await fetch(request);
    if (respuestaRed && respuestaRed.ok) {
      cache.put(request, respuestaRed.clone());
    }
    return respuestaRed;
  } catch (err) {
    const respuestaCache = await cache.match(request);
    if (respuestaCache) return respuestaCache;
    // Último recurso sin conexión: mostramos login.html si es una navegación.
    if (request.mode === 'navigate') {
      const login = await cache.match('login.html');
      if (login) return login;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const respuestaCache = await cache.match(request);
  const promesaRed = fetch(request)
    .then((respuestaRed) => {
      // Las respuestas "opacas" (recursos cross-origin sin CORS, como
      // fuentes o imágenes de otros dominios) también son válidas para
      // guardar, aunque no se pueda leer su status.
      if (respuestaRed && (respuestaRed.ok || respuestaRed.type === 'opaque')) {
        cache.put(request, respuestaRed.clone());
      }
      return respuestaRed;
    })
    .catch(() => respuestaCache);

  return respuestaCache || promesaRed;
}
