import { getServerClient } from '@/lib/supabase-server'
import { getAuthClient } from '@/lib/supabase-auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { normalizeEmail } from '@/lib/email-validation'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

// Re-auth endpoint for known emails. Distinct from /api/auth/request-link,
// which is the first-time-sign-in path that requires an invite code to burn.
//
// Decides what to do based on the waitlist row state:
//   - admin email            → magic link to /admin
//   - invite_used_at set     → magic link to /dashboard (user already authed once)
//   - invite_code set, not burned → magic link to /onboarding/about-you
//                               (post-signin route burns invite_used_at on
//                               first arrival; we never echo the code back)
//   - no invite_code         → 'waitlist_only', client shows "your invite is still pending"
//   - no waitlist row        → 'not_found', client shows "join the waitlist"
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown }

  const normalizedEmail = normalizeEmail(body.email)
  if (!normalizedEmail) {
    return Response.json({ status: 'invalid_email' }, { status: 400 })
  }

  // Admin shortcut — always magic link, regardless of waitlist state.
  if (isAdminEmail(normalizedEmail)) {
    const auth = await getAuthClient()
    const { error } = await auth.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=/admin`,
        shouldCreateUser: true,
      },
    })
    if (error) {
      console.error('[auth/login] admin OTP failed', error)
      return Response.json({ status: 'server_error' }, { status: 500 })
    }
    return Response.json({ ok: true, status: 'magic_link_sent', to: '/admin' })
  }

  const admin = getServerClient()
  const { data: row, error: lookupErr } = await admin
    .from('waitlist')
    .select('email, invite_code, invite_used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (lookupErr) {
    console.error('[auth/login] lookup failed', lookupErr)
    return Response.json({ status: 'server_error' }, { status: 500 })
  }

  if (!row) {
    return Response.json({ status: 'not_found' }, { status: 404 })
  }

  if (row.invite_used_at) {
    // Returning user — magic link, lands on /dashboard.
    const auth = await getAuthClient()
    const { error: otpErr } = await auth.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=/dashboard`,
        shouldCreateUser: false,
      },
    })
    if (otpErr) {
      console.error('[auth/login] returning-user OTP failed', otpErr)
      return Response.json({ status: 'server_error' }, { status: 500 })
    }
    return Response.json({ ok: true, status: 'magic_link_sent', to: '/dashboard' })
  }

  if (row.invite_code) {
    // Issued-but-unused invite. Send a magic link instead of routing through
    // /signup?code=... — the code never has to leave the server, and the
    // post-signin route marks invite_used_at on first arrival anyway.
    const auth = await getAuthClient()
    const { error: otpErr } = await auth.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=/onboarding/about-you`,
        shouldCreateUser: true,
      },
    })
    if (otpErr) {
      console.error('[auth/login] invited-user OTP failed', otpErr)
      return Response.json({ status: 'server_error' }, { status: 500 })
    }
    return Response.json({ ok: true, status: 'magic_link_sent', to: '/onboarding/about-you' })
  }

  return Response.json({ status: 'waitlist_only' })
}
