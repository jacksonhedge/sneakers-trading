import { getServerClient } from '@/lib/supabase-server'
import { getAuthClient } from '@/lib/supabase-auth'
import { isValidInviteCodeFormat } from '@/lib/invite-code'
import { normalizeEmail } from '@/lib/email-validation'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

// POST /api/auth/request-link
//
// Two paths in one endpoint, both end in "magic link emailed to the address":
//
// 1. **Code path** — { email, code } both present. Validates against the
//    waitlist row; if email+code match an unused invite, sends a magic link
//    to that inbox via Supabase OTP.
//
// 2. **Open path** — { email } only, no code. Direct sign-up: ensures a
//    waitlist row exists marked as instantly-used so onboarding-detection
//    works correctly, then sends a magic link via Supabase OTP. Anyone with
//    an email can get in. Tier discounts (.edu) and gating (student
//    verification) happen post-signup as separate flows.
//
// IMPORTANT: we never return the action_link to the caller. That would let
// any anonymous client take over an account by submitting a victim's email.
// The link MUST be delivered to the inbox so possession-of-email is proven.
//
// Both paths return { ok: true, status: 'magic_link_sent' } on success.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown
    code?: unknown
    joinOrgId?: unknown
  }

  const reject = () => Response.json({ error: 'invite_invalid' }, { status: 400 })

  const normalizedEmail = normalizeEmail(body.email)
  if (!normalizedEmail) return Response.json({ error: 'invalid_email' }, { status: 400 })

  // Optional: org id from /join/[orgId] flow. Validates as UUID; we'll
  // attribute this signup to the org's roster after the auth user is
  // created (below).
  const joinOrgId =
    typeof body.joinOrgId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.joinOrgId)
      ? body.joinOrgId
      : null

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

  // Org-roster attribution: when the user came from /join/[orgId], record
  // them in the org's invitation table as PENDING. The captain must approve
  // before they're counted as accepted — otherwise any anonymous caller
  // could poison any org's roster by submitting (random_email, target_orgId).
  // The /join landing makes the user-experience clear ("captain will
  // approve"). Idempotent via unique (org_id, invited_email).
  //
  // We also confirm the org actually exists + is approved before recording
  // anything — guards against random UUID sprays inflating the table.
  if (joinOrgId) {
    const { data: org } = await admin
      .from('organization_signups')
      .select('id, status')
      .eq('id', joinOrgId)
      .maybeSingle()
    if (!org) {
      console.warn('[request-link] joinOrgId references unknown org', joinOrgId)
    } else {
      const { error: orgInsertErr } = await admin
        .from('organization_member_invitations')
        .upsert(
          {
            org_id: joinOrgId,
            invited_email: normalizedEmail,
            status: 'pending',
          },
          { onConflict: 'org_id,invited_email' },
        )
      if (orgInsertErr) {
        console.error('[request-link] org-roster attribution failed', orgInsertErr)
      }
    }
  }

  // Send the magic link via Supabase OTP. The link is delivered to the
  // user's inbox — never returned to the caller. shouldCreateUser handles
  // the auth.users row idempotently. emailRedirectTo carries the
  // post-auth destination through the callback flow.
  const next = joinOrgId ? '/dashboard' : '/dashboard'
  const auth = await getAuthClient()
  const { error: otpErr } = await auth.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  })
  if (otpErr) {
    console.error('[request-link] signInWithOtp failed', otpErr)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true, status: 'magic_link_sent' })
}
