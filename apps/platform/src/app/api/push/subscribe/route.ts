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
