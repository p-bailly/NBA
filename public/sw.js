// Service worker minimal : l'app s'ouvre hors-ligne, les logos sont mis en cache.
// Les données live (API ESPN) ne sont jamais mises en cache ici.
const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const IMAGES = `images-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== IMAGES).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Page : réseau d'abord, cache en secours (hors-ligne).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  // Fichiers de l'app (noms hashés par Vite) : cache puis mise à jour en arrière-plan.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cached = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      }),
    )
    return
  }

  // Logos d'équipes : cache d'abord (ils ne changent quasiment jamais).
  if (url.hostname === 'a.espncdn.com' && url.href.includes('teamlogos')) {
    event.respondWith(
      caches.open(IMAGES).then(async (cache) => {
        const cached = await cache.match(req)
        if (cached) return cached
        const res = await fetch(req)
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone())
        return res
      }),
    )
  }
})

// Clic sur une alerte : ramène l'app au premier plan (ou l'ouvre) sur le match.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const hash = (event.notification.data && event.notification.data.url) || '#/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => 'focus' in w)
      if (win) {
        win.postMessage({ type: 'open', hash })
        return win.focus()
      }
      return self.clients.openWindow(self.registration.scope + hash)
    }),
  )
})
