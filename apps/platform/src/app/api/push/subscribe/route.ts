import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/push/subscribe
//
// Auth-gated. Body:
//   { endpoint: string, p256dh: string, auth: string, user_agent?: string }
//
// Upserts into push_subscriptions keyed on (user_id, endpoint). Same
// browser re-subscribing produces the same row (idempotent).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  endpoint?: unknown
  p256dh?: unknown
  auth?: unknown
  user_agent?: unknown
}

// Length caps + host allowlist for the Web Push subscription fields. Without
// these, an authed user can stuff arbitrary multi-MB strings into
// push_subscriptions, or register an arbitrary URL we'll later POST to from
// the cron dispatcher (SSRF surface, depending on what the web-push lib does
// with non-spec endpoints). See audit HIGH #12.
const MAX_ENDPOINT_LEN = 1_000
const MAX_P256DH_LEN = 200
const MAX_AUTH_LEN = 100

const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome / Edge / Brave
  'updates.push.services.mozilla.com', // Firefox
  'updates-autopush.stage.mozaws.net', // Firefox staging
  'web.push.apple.com', // Safari / iOS
]

function isAllowedEndpoint(raw: string): boolean {
  if (raw.length > MAX_ENDPOINT_LEN) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return ALLOWED_PUSH_HOSTS.includes(url.host)
}

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as Body
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null
  const p256dh = typeof body.p256dh === 'string' ? body.p256dh : null
  const authKey = typeof body.auth === 'string' ? body.auth : null
  const userAgent = typeof body.user_agent === 'string' ? body.user_agent.slice(0, 500) : null
  if (!endpoint || !p256dh || !authKey) {
    return Response.json(
      { error: 'missing_fields', required: ['endpoint', 'p256dh', 'auth'] },
      { status: 400 },
    )
  }
  if (!isAllowedEndpoint(endpoint)) {
    return Response.json(
      {
        error: 'invalid_endpoint',
        message: 'Endpoint must be HTTPS and on a recognized push service.',
      },
      { status: 400 },
    )
  }
  if (p256dh.length > MAX_P256DH_LEN || authKey.length > MAX_AUTH_LEN) {
    return Response.json({ error: 'keys_too_long' }, { status: 400 })
  }

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()
  if (!row) {
    return Response.json({ error: 'no_waitlist_row' }, { status: 404 })
  }

  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        user_id: row.id as string,
        endpoint,
        p256dh_key: p256dh,
        auth_key: authKey,
        user_agent: userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    )
  if (error) {
    console.error('[push/subscribe] upsert failed', error)
    return Response.json({ error: 'upsert_failed' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
