import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/push/unsubscribe
//
// Body: { endpoint: string }
// Deletes the matching push_subscriptions row for this user. The cron
// dispatcher also auto-prunes endpoints that return 404/410 from the
// browser push service — this endpoint is for the explicit user-toggle
// path on /dashboard/alerts/settings.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown }
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : null
  if (!endpoint) {
    return Response.json({ error: 'missing_endpoint' }, { status: 400 })
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
    .delete()
    .eq('user_id', row.id as string)
    .eq('endpoint', endpoint)
  if (error) {
    console.error('[push/unsubscribe] delete failed', error)
    return Response.json({ error: 'delete_failed' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
