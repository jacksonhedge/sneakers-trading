'use client'

// Client-side event tracking. Fire-and-forget — never blocks UI, never throws.
//
// Usage:
//   import { track } from '@/lib/track'
//   track('button_click', { target: 'asset-filter-BTC' })
//   track('market_view', { platform: 'limitless', market_id: '12345' })
//
// Page views are auto-tracked by <PageViewTracker /> mounted at the dashboard
// layout level — don't call track('page_view') manually.
//
// All events POST to /api/track which writes to the click_events table via
// service role (RLS-enabled, no public read). User attribution happens
// server-side from the auth cookie; anonymous events still land with
// user_id = null.
//
// Session ID is generated lazily on first event in a tab and persisted in
// sessionStorage. Cleared when the tab closes.

const SESSION_KEY = 'sneakers.track.sid'
const MAX_QUEUE = 25 // Drop further events if we're somehow backlogged.

let queue: NormalizedEvent[] = []
let flushScheduled = false

interface NormalizedEvent {
  event_name: string
  page: string
  target?: string
  metadata?: Record<string, unknown>
  session_id: string
  ts: string
}

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let sid = sessionStorage.getItem(SESSION_KEY)
    if (!sid) {
      // Short opaque id — `${random}.${time}`. Not crypto, just unique-ish.
      sid = Math.random().toString(36).slice(2, 10) + '.' + Date.now().toString(36)
      sessionStorage.setItem(SESSION_KEY, sid)
    }
    return sid
  } catch {
    // Private mode / sandbox — sessionStorage may throw. Fall back to per-call random.
    return 'no-storage.' + Date.now().toString(36)
  }
}

/**
 * Track a discrete event. Returns immediately; the network call happens
 * async and any failure is silently swallowed.
 *
 * @param eventName  freeform string ≤80 chars, e.g. "button_click", "asset_filter"
 * @param props      optional { target, metadata } — target is a short id (≤200 chars)
 *                   for the thing being clicked; metadata is arbitrary jsonb.
 */
export function track(
  eventName: string,
  props: { target?: string; metadata?: Record<string, unknown> } = {},
): void {
  if (typeof window === 'undefined') return
  if (!eventName || typeof eventName !== 'string') return

  const evt: NormalizedEvent = {
    event_name: eventName.slice(0, 80),
    page: window.location.pathname.slice(0, 400),
    target: props.target?.slice(0, 200),
    metadata: props.metadata,
    session_id: getSessionId(),
    ts: new Date().toISOString(),
  }

  queue.push(evt)
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
  scheduleFlush()
}

function scheduleFlush() {
  if (flushScheduled) return
  flushScheduled = true
  // Coalesce bursts within a tick into a single POST. Most user interactions
  // produce a single event; this just protects against accidental loops.
  setTimeout(() => {
    flushScheduled = false
    flush()
  }, 50)
}

function flush() {
  if (queue.length === 0) return
  const batch = queue
  queue = []
  const body = JSON.stringify({ events: batch })

  // sendBeacon survives page navigation (the browser keeps it alive even
  // after unload). Falls back to fetch for older browsers.
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const ok = navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))
      if (ok) return
    }
  } catch {
    // sendBeacon may be blocked by CSP in some environments; fall through.
  }

  // Fallback: keepalive fetch. `keepalive: true` lets the request continue
  // after the tab navigates, similar to sendBeacon.
  fetch('/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => {
    // tracking failures are silent
  })
}

// Flush any pending events on page hide / nav. Belt-and-suspenders alongside
// sendBeacon — for very last-millisecond clicks that haven't ticked yet.
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) flush()
  })
  window.addEventListener('pagehide', () => flush())
}
