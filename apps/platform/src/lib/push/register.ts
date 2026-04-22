'use client'

// Browser-side service-worker registration + Web Push subscription. Called
// from a client component mounted inside the dashboard layout — only for
// authenticated users who land on a protected route.
//
// Flow:
//   1. Register /service-worker.js (idempotent — calling navigator.serviceWorker.register
//      with the same URL returns the existing registration).
//   2. Check Notification.permission.
//   3. If 'default', do nothing — we wait for a user gesture (the
//      "Enable browser notifications" button on /dashboard/alerts/settings)
//      before prompting. Some browsers down-rank sites that prompt on load.
//   4. If 'granted', resolve the existing PushSubscription (or create one
//      with the VAPID public key) and POST it to /api/push/subscribe so the
//      server can dispatch to it.
//   5. If 'denied', do nothing — the settings page surfaces a "blocked,
//      re-enable in browser settings" message.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export async function ensurePushRegistered(): Promise<
  | { ok: true; subscription: PushSubscription }
  | { ok: false; reason: 'unsupported' | 'permission_default' | 'permission_denied' | 'no_vapid_key' | 'error'; error?: string }
> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'no_vapid_key' }
  }
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js')
    await navigator.serviceWorker.ready

    if (Notification.permission === 'denied') {
      return { ok: false, reason: 'permission_denied' }
    }
    if (Notification.permission !== 'granted') {
      return { ok: false, reason: 'permission_default' }
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      // Pass an ArrayBuffer (not Uint8Array) — ArrayBufferView typing in
      // recent lib.dom.d.ts complains about ArrayBufferLike vs ArrayBuffer.
      const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer.slice(
          keyBytes.byteOffset,
          keyBytes.byteOffset + keyBytes.byteLength,
        ) as ArrayBuffer,
      })
    }

    await persistSubscription(subscription)
    return { ok: true, subscription }
  } catch (err) {
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Explicit user-gesture handler — triggered by the "Enable browser
 * notifications" button. Calls Notification.requestPermission then
 * proceeds through the same flow as ensurePushRegistered.
 */
export async function requestPushPermission(): Promise<ReturnType<typeof ensurePushRegistered>> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' }
  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission()
    if (result !== 'granted') {
      return { ok: false, reason: result === 'denied' ? 'permission_denied' : 'permission_default' }
    }
  }
  return ensurePushRegistered()
}

export async function unsubscribePush(): Promise<{ ok: boolean }> {
  if (typeof window === 'undefined') return { ok: false }
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return { ok: true }
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return { ok: true }
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  return { ok: true }
}

async function persistSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const payload = {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent,
  }
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const out = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i)
  return out
}
