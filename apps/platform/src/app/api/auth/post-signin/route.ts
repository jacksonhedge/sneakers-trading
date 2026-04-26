import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/auth/post-signin
//
// Called from /auth/callback (client) immediately after the session
// cookies are set. Performs server-side post-auth bookkeeping that the
// browser shouldn't do directly:
//
//   1. Mark waitlist.invite_used_at = now() (idempotent — only fires
//      first time, used to detect first sign-in)
//   2. Decide the right post-auth destination based on first-sign-in
//      state and any ?next= override the client may have passed (we
//      don't read query params here; client passes them via body).
//
// Returns { ok: true, next: '/dashboard' } (or '/onboarding/about-you'
// for first-timers).

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser()
  if (authErr || !user || !user.email) {
    return Response.json({ ok: false, error: 'no_session' }, { status: 401 })
  }

  let next: string | null = null
  try {
    const body = (await req.json().catch(() => ({}))) as { next?: unknown }
    if (typeof body.next === 'string' && isSafeRelativePath(body.next)) {
      next = body.next
    }
  } catch {
    /* no body, fine */
  }

  // Mark invite_used_at if it isn't already. The .is(...null) condition
  // ensures the UPDATE only matches rows where it's still null — so the
  // .select() returns a row only on FIRST sign-in. That row's presence is
  // the signal we use to route to onboarding.
  const admin = getServerClient()
  let isFirstSignIn = false
  const { data: updated, error: markErr } = await admin
    .from('waitlist')
    .update({ invite_used_at: new Date().toISOString() })
    .eq('email', user.email.toLowerCase())
    .is('invite_used_at', null)
    .select('email')
  if (markErr) {
    console.error('[post-signin] failed to mark invite_used_at', markErr)
    // Non-fatal — user is authed.
  }
  isFirstSignIn = Array.isArray(updated) && updated.length > 0

  const dest = next ?? (isFirstSignIn ? '/onboarding/about-you' : '/dashboard')
  return Response.json({ ok: true, next: dest })
}

// Accept only single-leading-slash same-origin paths. Rejects protocol-
// relative ('//evil.com'), backslash-prefixed ('/\evil.com' — some browsers
// normalize this), and anything containing a scheme. Defense-in-depth on
// top of `startsWith('/')`.
function isSafeRelativePath(s: string): boolean {
  if (s.length === 0 || s.length > 512) return false
  if (!s.startsWith('/')) return false
  if (s.startsWith('//') || s.startsWith('/\\')) return false
  if (/[\r\n\t]/.test(s)) return false
  return true
}
