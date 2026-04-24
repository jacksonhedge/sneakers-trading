import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/me/autotrade-waitlist
//
// Idempotent opt-in to the autotrade feature waitlist. Writes a row to the
// `autotrade_waitlist` table (separate, not a column on user_profiles) and
// flips the user_profiles.joined_autotrade_waitlist boolean as a quick
// "are they on the list?" flag.
//
// When the autotrade feature lands, we email everyone in autotrade_waitlist
// ordered by created_at.

export async function POST() {
  const sb = await getAuthClient()
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser()
  if (authErr || !user || !user.email) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServerClient()

  // Idempotent: skip the insert if there's already a row for this user.
  const { data: existing } = await admin
    .from('autotrade_waitlist')
    .select('id, created_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return Response.json({
      ok: true,
      already_on_list: true,
      at: existing.created_at,
    })
  }

  const { error: insertErr } = await admin.from('autotrade_waitlist').insert({
    user_id: user.id,
    email: user.email.toLowerCase(),
    status: 'waitlisted',
  })

  if (insertErr) {
    console.error('[autotrade-waitlist] insert failed', insertErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  // Quick-check flag on user_profiles. Best-effort — if it fails, the
  // canonical autotrade_waitlist row already landed.
  await admin
    .from('user_profiles')
    .upsert(
      { user_id: user.id, joined_autotrade_waitlist: true },
      { onConflict: 'user_id' },
    )

  return Response.json({ ok: true, at: new Date().toISOString() })
}
