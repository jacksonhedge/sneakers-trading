import { getServerClient } from '@/lib/supabase-server'
import { isValidInviteCodeFormat } from '@/lib/invite-code'
import { normalizeEmail } from '@/lib/email-validation'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

// POST /api/auth/request-link
//
// Two paths in one endpoint:
//
// 1. **Code path** — { email, code } both present. Validates against the
//    waitlist row; if email+code match an unused invite, mints a magic-link
//    URL the client navigates to. This is the "code in hand = access in
//    hand" flow used for admin-distributed invites and referral graduations.
//
// 2. **Open path** — { email } only, no code. Direct sign-up: creates an
//    auth user (idempotent), inserts a waitlist row marked as instantly-
//    used, generates a magic-link URL and returns it. New positioning:
//    anyone with an email can get in. Tier discounts (.edu) and gating
//    (student verification) happen post-signup as separate flows.
//
// Both paths return { ok: true, redirect: <action_link> } on success.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown
    code?: unknown
  }

  const reject = () => Response.json({ error: 'invite_invalid' }, { status: 400 })

  const normalizedEmail = normalizeEmail(body.email)
  if (!normalizedEmail) return Response.json({ error: 'invalid_email' }, { status: 400 })

  const admin = getServerClient()

  const codeProvided =
    typeof body.code === 'string' && body.code.trim().length > 0
  const normalizedCode = codeProvided
    ? (body.code as string).toUpperCase().trim()
    : null

  if (codeProvided) {
    if (!normalizedCode || !isValidInviteCodeFormat(normalizedCode)) return reject()

    const { data: row, error: lookupErr } = await admin
      .from('waitlist')
      .select('email, invite_code, invite_used_at')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (lookupErr) {
      console.error('[request-link] waitlist lookup failed', lookupErr)
      return Response.json({ error: 'server_error' }, { status: 500 })
    }
    if (!row) return reject()
    if (!row.invite_code || row.invite_code !== normalizedCode) return reject()
    if (row.invite_used_at) return reject()
  } else {
    // Open path: ensure a waitlist row exists, mark it as instantly used so
    // the auth callback's first-sign-in detection works AND the user shows
    // up correctly on /login (no "waiting" state).
    const { data: existing } = await admin
      .from('waitlist')
      .select('email, invite_used_at')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (!existing) {
      // New user — generate them a referral code + insert a row already
      // marked invite_used_at = now() so they're in, not waitlisted.
      const { generateUniqueReferralCode } = await import('@/lib/referral-code')
      const referralCode = await generateUniqueReferralCode()
      const now = new Date().toISOString()
      const { error: insertErr } = await admin.from('waitlist').insert({
        email: normalizedEmail,
        source: 'open_signup',
        referral_code: referralCode,
        invite_code: 'OPENSIGN', // sentinel value — distinguishes from admin invites
        invited_at: now,
        invite_used_at: now,
        account_type: 'individual',
      })
      if (insertErr && insertErr.code !== '23505') {
        console.error('[request-link] open-path waitlist insert failed', insertErr)
        return Response.json({ error: 'server_error' }, { status: 500 })
      }
    } else if (!existing.invite_used_at) {
      // They had a pending waitlist row (older signup) — promote it to
      // 'used' so they're treated as a returning user post-callback.
      await admin
        .from('waitlist')
        .update({ invite_used_at: new Date().toISOString() })
        .eq('email', normalizedEmail)
    }
  }

  // Ensure the auth.users row exists. Idempotent — already-registered
  // emails return an error we can ignore.
  const { error: createErr } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
  })
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    console.error('[request-link] createUser failed', createErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  // Generate the magic-link URL without sending email. The returned
  // action_link is single-use and short-lived — the client navigates to it
  // directly, Supabase verifies + sets session cookies, then 302s to our
  // /auth/callback.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: normalizedEmail,
    options: {
      redirectTo: `${SITE_URL}/auth/callback`,
    },
  })
  if (linkErr || !linkData?.properties?.action_link) {
    console.error('[request-link] generateLink failed', linkErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true, redirect: linkData.properties.action_link })
}
