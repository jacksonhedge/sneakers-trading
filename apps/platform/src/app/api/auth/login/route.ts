import { getServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-auth'
import { normalizeEmail } from '@/lib/email-validation'
import { mintAndSendMagicLink } from '@/lib/magic-link'

// Re-auth endpoint for known emails. Distinct from /api/auth/request-link,
// which is the first-time-sign-in path.
//
// External response is always 200 { ok: true, status: 'magic_link_sent' }
// regardless of internal state — this closes the email-enumeration oracle
// (audit M1/14). Internally we route by waitlist row:
//   - admin email                    → OTP to /admin
//   - invite_used_at set             → OTP to /dashboard (returning)
//   - invite_code set, not burned    → OTP to /onboarding/your-edge
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

  // Helper: respond uniformly. Optionally include devLink when
  // AUTH_DEV_RETURN_LINK=1 so devs can test without inbox dependency.
  function ok(devLink?: string): Response {
    return Response.json({
      ok: true,
      status: 'magic_link_sent',
      ...(devLink ? { devLink } : {}),
    })
  }

  // Admin shortcut — always magic link, regardless of waitlist state.
  if (isAdminEmail(normalizedEmail)) {
    const result = await mintAndSendMagicLink({
      email: normalizedEmail,
      next: '/admin',
    })
    if (!result.ok) console.error('[auth/login] admin send failed', result.reason)
    return ok(result.ok ? result.devLink : undefined)
  }

  const admin = getServerClient()
  const { data: row, error: lookupErr } = await admin
    .from('waitlist')
    .select('email, invite_code, invite_used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (lookupErr) {
    console.error('[auth/login] lookup failed', lookupErr)
    return ok() // fail silent externally, log internally
  }

  if (!row) {
    // No waitlist row → don't send, but don't reveal absence either.
    return ok()
  }

  if (row.invite_used_at) {
    const result = await mintAndSendMagicLink({
      email: normalizedEmail,
      next: '/dashboard',
    })
    if (!result.ok) console.error('[auth/login] returning-user send failed', result.reason)
    return ok(result.ok ? result.devLink : undefined)
  }

  if (row.invite_code) {
    // Issued-but-unused invite — magic link goes to onboarding.
    // post-signin marks invite_used_at on arrival.
    const result = await mintAndSendMagicLink({
      email: normalizedEmail,
      next: '/onboarding/your-edge',
    })
    if (!result.ok) console.error('[auth/login] invited-user send failed', result.reason)
    return ok(result.ok ? result.devLink : undefined)
  }

  // Waitlist row exists but no invite_code yet — user is still queued.
  // Don't send (would let them in despite no graduation). Same shape.
  return ok()
}
