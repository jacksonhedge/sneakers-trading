import { getServerClient } from '@/lib/supabase-server'
import { getAuthClient } from '@/lib/supabase-auth'

// POST /api/leaderboard/join
//
// Opts a verified student into the College Leaderboard. Implementation maps
// to the live schema: user_profiles holds the boolean flag + display fields,
// no separate opt-in timestamp column. The leaderboard_positions ranking
// table is populated by a cron job from elsewhere — this endpoint only
// records the user's intent + handle + university.
//
// Gate: user must have an approved row in student_verification.
// Body: { handle: string, college: string }
// Idempotent — re-calling updates handle + college, leaves the boolean
// already-true.

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

  // Student-verification gate. Live schema uses `user_id`, not the
  // `waitlist_user_id` field that the legacy lib expects.
  const { data: verif, error: verifErr } = await admin
    .from('student_verification')
    .select('status, expires_at')
    .eq('user_id', user.id)
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

  // Handle uniqueness — case-insensitive lookup against existing user_profiles.
  // Uses display_name since live schema doesn't have a separate handle column.
  const { data: taken } = await admin
    .from('user_profiles')
    .select('user_id')
    .ilike('display_name', handle)
    .neq('user_id', user.id)
    .maybeSingle()
  if (taken) {
    return Response.json({ error: 'handle_taken' }, { status: 409 })
  }

  // Upsert the user's profile: flip joined_leaderboard true and set the
  // display_name + university fields.
  const { error: writeErr } = await admin
    .from('user_profiles')
    .upsert(
      {
        user_id: user.id,
        display_name: handle,
        university: college,
        joined_leaderboard: true,
      },
      { onConflict: 'user_id' },
    )
  if (writeErr) {
    console.error('[leaderboard/join] upsert failed', writeErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true, handle, college, joined: true })
}
