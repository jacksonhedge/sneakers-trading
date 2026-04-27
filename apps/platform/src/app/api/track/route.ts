import { headers } from 'next/headers'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/track — batched click/event ingestion.
//
// Body: { events: ClientEvent[] }  OR  ClientEvent (single-event convenience)
//
// Each ClientEvent:
//   { event_name: string, page?: string, target?: string,
//     metadata?: Record<string, unknown>, session_id?: string, ts?: string }
//
// Server enriches with: user_id (from auth cookie if present), referrer +
// user_agent + ip_country (from request headers), inserts via service-role
// client. RLS is enabled on click_events; only the service role can write.
//
// Anonymous OK: events without an auth session land with user_id = null.
// Bots / abuse: trivially throttled per-IP for now (LIMIT_PER_BURST events
// per request); add a real rate-limiter (Upstash, etc.) once we have signal.
//
// Returns 200 { ok: true, written: N } even on partial failures so the
// client never blocks UX on tracking errors.

const MAX_EVENTS_PER_REQUEST = 50
const MAX_EVENT_NAME_LEN = 80
const MAX_TARGET_LEN = 200
const MAX_PAGE_LEN = 400
const MAX_METADATA_BYTES = 4_000

interface ClientEvent {
  event_name?: unknown
  page?: unknown
  target?: unknown
  metadata?: unknown
  session_id?: unknown
  ts?: unknown
}

interface NormalizedEvent {
  event_name: string
  page: string | null
  target: string | null
  metadata: Record<string, unknown> | null
  session_id: string | null
  ts: string
}

function clip(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

function clipMetadata(v: unknown): Record<string, unknown> | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null
  try {
    const json = JSON.stringify(v)
    if (json.length > MAX_METADATA_BYTES) return null
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizeOne(raw: ClientEvent): NormalizedEvent | null {
  const event_name = clip(raw.event_name, MAX_EVENT_NAME_LEN)
  if (!event_name) return null
  // ts: client-supplied is allowed (lets us preserve order across batched
  // sendBeacon calls) but rejected if older than 24h or in the future.
  let ts = new Date().toISOString()
  if (typeof raw.ts === 'string') {
    const t = Date.parse(raw.ts)
    if (Number.isFinite(t)) {
      const now = Date.now()
      if (t < now - 24 * 60 * 60 * 1000) ts = new Date(now).toISOString()
      else if (t > now + 60_000) ts = new Date(now).toISOString()
      else ts = new Date(t).toISOString()
    }
  }
  return {
    event_name,
    page: clip(raw.page, MAX_PAGE_LEN),
    target: clip(raw.target, MAX_TARGET_LEN),
    metadata: clipMetadata(raw.metadata),
    session_id: clip(raw.session_id, 100),
    ts,
  }
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, written: 0, error: 'invalid_json' }, { status: 400 })
  }

  const events: ClientEvent[] = Array.isArray((body as { events?: unknown })?.events)
    ? ((body as { events: ClientEvent[] }).events)
    : Array.isArray(body)
      ? (body as ClientEvent[])
      : (body && typeof body === 'object' ? [body as ClientEvent] : [])

  if (events.length === 0) {
    return Response.json({ ok: true, written: 0 })
  }

  const normalized = events
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .map(normalizeOne)
    .filter((e): e is NormalizedEvent => e !== null)

  if (normalized.length === 0) {
    return Response.json({ ok: true, written: 0 })
  }

  // Best-effort user resolution. Anonymous events land with user_id = null.
  let userId: string | null = null
  try {
    const sb = await getAuthClient()
    const { data: { user } } = await sb.auth.getUser()
    if (user?.id) userId = user.id
  } catch {
    // ignore — anon flow
  }

  // Header enrichment. Vercel populates x-vercel-ip-country; Cloudflare populates
  // cf-ipcountry; both end up on the request in production. Local dev sees neither.
  const h = await headers()
  const country =
    h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry') ?? null
  const userAgent = h.get('user-agent')?.slice(0, 500) ?? null
  const referrer = h.get('referer')?.slice(0, 500) ?? null

  const admin = getServerClient()
  const rows = normalized.map((e) => ({
    user_id: userId,
    session_id: e.session_id,
    event_name: e.event_name,
    page: e.page,
    target: e.target,
    metadata: e.metadata,
    referrer,
    user_agent: userAgent,
    ip_country: country,
    ts: e.ts,
  }))

  const { error } = await admin.from('click_events').insert(rows)
  if (error) {
    console.warn('[track] insert failed:', error.message)
    return Response.json(
      { ok: false, written: 0, error: 'insert_failed' },
      { status: 200 }, // never block UX on tracking errors
    )
  }

  return Response.json(
    { ok: true, written: rows.length },
    {
      headers: {
        'cache-control': 'no-store',
        // CORS not needed — this is a same-origin call from the client.
      },
    },
  )
}
