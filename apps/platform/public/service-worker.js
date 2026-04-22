// Sneakers Terminal — Web Push service worker.
//
// Registered by src/lib/push/register.ts on first load after authentication.
// Receives push events from the cron evaluator → renders a system
// notification → opens the relevant /dashboard URL when clicked.
//
// Payload contract (matches what lib/alerts/channels/push.ts dispatches):
//   {
//     title:   string
//     body:    string
//     url:     string  // relative path inside the app, e.g. "/dashboard?m=kalshi:M1"
//     ruleId?: string  // for analytics / dedup
//     tag?:    string  // browser-side dedup grouping
//   }

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (err) {
    console.error('[sw] failed to parse push payload', err)
  }

  const title = payload.title || 'Sneakers alert'
  const options = {
    body: payload.body || 'A rule you set just fired.',
    icon: '/icon.png',
    badge: '/icon.png',
    tag: payload.tag || payload.ruleId,
    data: { url: payload.url || '/dashboard' },
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If a window is already open, focus + navigate it instead of opening another.
        for (const client of windowClients) {
          if ('focus' in client) {
            client.navigate(targetUrl).catch(() => {})
            return client.focus()
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl)
        }
        return null
      }),
  )
})

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
