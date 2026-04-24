import { getServerClient } from '@/lib/supabase-server'
import { getAuthClient } from '@/lib/supabase-auth'

// POST /api/leaderboard/join
//
// Opts a verified student into the College Leaderboard.
// Gate: user must have an approved row in student_verification (migration 010).
// Body: { handle: string, college: string }
//
// Idempotent — re-calling updates the handle + college. Records
// leaderboard_opted_in_at once on first call; preserved on re-calls.

const HANDLE_RE = /^[a-zA-Z0-9_]{3,20}$/
const COLLEGE_MAX = 80

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    handle?: unknown
    college?: unknown
  }

  const handle = typeof body.handle === 'string' ? body.handle.trim() : ''
  const college = typeof body.college === 'string' ? body.college.trim() : ''

  if (!HANDLE_RE.test(handle)) {
    return Response.json(
      { error: 'invalid_handle', detail: '3-20 chars, letters/numbers/underscore only' },
      { status: 400 },
    )
  }
  if (college.length === 0 || college.length > COLLEGE_MAX) {
    return Response.json(
      { error: 'invalid_college', detail: `1-${COLLEGE_MAX} chars` },
      { status: 400 },
    )
  }

  // Auth check — must be signed in.
  const auth = await getAuthClient()
  const { data: { user }, error: userErr } = await auth.auth.getUser()
  if (userErr || !user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServerClient()

  // Student-verification gate. Only approved students may join.
  const { data: verif, error: verifErr } = await admin
    .from('student_verification')
    .select('status, expires_at')
    .eq('waitlist_user_id', user.id)
    .maybeSingle()
  if (verifErr) {
    console.error('[leaderboard/join] verif lookup failed', verifErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  if (!verif || verif.status !== 'approved') {
    return Response.json(
      { error: 'not_verified_student', detail: 'Submit student verification at /students first.' },
      { status: 403 },
    )
  }
  if (verif.expires_at && new Date(verif.expires_at) < new Date()) {
    return Response.json(
      { error: 'verification_expired', detail: 'Re-submit verification to rejoin.' },
      { status: 403 },
    )
  }

  // Handle uniqueness — case-insensitive, enforced by the unique index on
  // lower(leaderboard_display_handle). Pre-check so we can return a clean error.
  const { data: taken } = await admin
    .from('user_profiles')
    .select('user_id')
    .ilike('leaderboard_display_handle', handle)
    .neq('user_id', user.id)
    .maybeSingle()
  if (taken) {
    return Response.json({ error: 'handle_taken' }, { status: 409 })
  }

  // Upsert into user_profiles. Keep the original opt-in timestamp if the
  // user is re-joining / editing their handle.
  const { data: existing } = await admin
    .from('user_profiles')
    .select('leaderboard_opted_in_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const now = new Date().toISOString()
  const optedInAt = existing?.leaderboard_opted_in_at ?? now

  const { error: writeErr } = await admin
    .from('user_profiles')
    .upsert(
      {
        user_id: user.id,
        leaderboard_opted_in_at: optedInAt,
        leaderboard_display_handle: handle,
        leaderboard_college: college,
      },
      { onConflict: 'user_id' },
    )
  if (writeErr) {
    console.error('[leaderboard/join] upsert failed', writeErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true, handle, college, opted_in_at: optedInAt })
}
