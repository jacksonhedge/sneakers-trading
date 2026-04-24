import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/me/autotrade-waitlist
//
// Idempotent opt-in to the autotrade feature waitlist. Writes
// autotrade_waitlist_at on user_profiles (first call only; re-calls no-op).
//
// When the autotrade feature lands, we email everyone with this timestamp
// set, ordered by who opted in earliest.

export async function POST() {
  const sb = await getAuthClient()
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser()
  if (authErr || !user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServerClient()

  // Idempotent — upsert, preserve original timestamp if already set.
  const { data: existing } = await admin
    .from('user_profiles')
    .select('autotrade_waitlist_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing?.autotrade_waitlist_at) {
    return Response.json({
      ok: true,
      already_on_list: true,
      at: existing.autotrade_waitlist_at,
    })
  }

  const now = new Date().toISOString()
  const { error: writeErr } = await admin
    .from('user_profiles')
    .upsert(
      { user_id: user.id, autotrade_waitlist_at: now },
      { onConflict: 'user_id' },
    )

  if (writeErr) {
    console.error('[autotrade-waitlist] upsert failed', writeErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true, at: now })
}
