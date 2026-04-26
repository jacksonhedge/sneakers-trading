import { getServerClient } from '@/lib/supabase-server'
import { getAuthClient } from '@/lib/supabase-auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { normalizeEmail } from '@/lib/email-validation'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

// Re-auth endpoint for known emails. Distinct from /api/auth/request-link,
// which is the first-time-sign-in path.
//
// External response is always 200 { ok: true, status: 'magic_link_sent' }
// regardless of internal state — this closes the email-enumeration oracle
// (audit M1/14). Internally we route by waitlist row:
//   - admin email                    → OTP to /admin
//   - invite_used_at set             → OTP to /dashboard (returning)
//   - invite_code set, not burned    → OTP to /onboarding/about-you
//   - waitlist row, no code          → no-op (user is still queued)
//   - no waitlist row                → no-op (silent — don't reveal absence)
//
// We never include the destination in the response (would leak admin status)
// and we never differentiate state in error responses.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown }

  const normalizedEmail = normalizeEmail(body.email)
  if (!normalizedEmail) {
    return Response.json({ status: 'invalid_email' }, { status: 400 })
  }

  const ok = Response.json({ ok: true, status: 'magic_link_sent' })

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
    if (error) console.error('[auth/login] admin OTP failed', error)
    return ok
  }

  const admin = getServerClient()
  const { data: row, error: lookupErr } = await admin
    .from('waitlist')
    .select('email, invite_code, invite_used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (lookupErr) {
    console.error('[auth/login] lookup failed', lookupErr)
    return ok // fail silent externally, log internally
  }

  if (!row) {
    // No waitlist row → no email is sent, but don't tell the caller. They
    // get the same shape as a successful send. Legit users with a typo'd
    // address figure it out when no email arrives.
    return ok
  }

  if (row.invite_used_at) {
    const auth = await getAuthClient()
    const { error: otpErr } = await auth.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=/dashboard`,
        shouldCreateUser: false,
      },
    })
    if (otpErr) console.error('[auth/login] returning-user OTP failed', otpErr)
    return ok
  }

  if (row.invite_code) {
    // Issued-but-unused invite. Send a magic link directly — the code never
    // has to leave the server. post-signin marks invite_used_at on arrival.
    const auth = await getAuthClient()
    const { error: otpErr } = await auth.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=/onboarding/about-you`,
        shouldCreateUser: true,
      },
    })
    if (otpErr) console.error('[auth/login] invited-user OTP failed', otpErr)
    return ok
  }

  // Waitlist row exists but no invite_code yet — user is still queued. Don't
  // send anything (Supabase OTP would create a session for a non-graduated
  // user, which we don't want). Return the same shape as success.
  return ok
}
