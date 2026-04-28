import { getServerClient } from '@/lib/supabase-server'
import { normalizeEmail } from '@/lib/email-validation'
import { mintAndSendPasswordResetLink } from '@/lib/magic-link'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

// POST /api/auth/forgot-password
//
// Body: { email }
//
// Sends a password-reset email to the address. Always returns
// { ok: true, status: 'reset_sent' } so we don't leak which emails
// have accounts (timing-safe enumeration defense). When the email
// has no account, no email is actually sent — the user just won't
// receive anything, same as a typo'd address would behave.
//
// We DO still validate that an auth user exists before calling
// generateLink — Supabase's recovery flow throws on unknown emails.
// We catch and treat as a no-op rather than a 5xx.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown }

  const email = normalizeEmail(body.email)
  if (!email) return Response.json({ error: 'invalid_email' }, { status: 400 })

  const ok = (devLink?: string) =>
    Response.json({
      ok: true,
      status: 'reset_sent',
      ...(devLink ? { devLink } : {}),
    })

  // Rate limits — silently trip (return same `ok` shape so attackers can't
  // tell they hit the cap). Two windows:
  //   - 5 / 15 min per source IP — caps a single attacker
  //   - 3 / 1 hour per email     — caps inbox-bombing of a single victim
  // First hit on a key always allows; the bucket logs after the count check.
  const ip = clientIp(req)
  const ipCheck = await checkRateLimit({ key: `forgot:ip:${ip}`, max: 5, windowSec: 15 * 60 })
  if (!ipCheck.allowed) {
    console.warn('[auth/forgot-password] rate-limit ip', ip, 'count=', ipCheck.count)
    return ok()
  }
  const emailCheck = await checkRateLimit({ key: `forgot:email:${email}`, max: 3, windowSec: 60 * 60 })
  if (!emailCheck.allowed) {
    console.warn('[auth/forgot-password] rate-limit email', email, 'count=', emailCheck.count)
    return ok()
  }

  // Check whether an auth user exists. Supabase's admin.listUsers is
  // paginated; for our scale we accept the first page. If we ever hit
  // 1000+ users this needs an indexed lookup table.
  const admin = getServerClient()
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const exists = list?.users?.some((u) => u.email?.toLowerCase() === email)
  if (!exists) {
    // Silent no-op — same external response shape as the success case.
    return ok()
  }

  const result = await mintAndSendPasswordResetLink({ email })
  if (!result.ok) {
    console.error('[auth/forgot-password] send failed', result.reason)
    // Still return ok externally — caller already saw a "we sent an email"
    // message in the UI; the actual failure is surfaced server-side only.
    return ok()
  }

  return ok(result.ok ? result.devLink : undefined)
}
