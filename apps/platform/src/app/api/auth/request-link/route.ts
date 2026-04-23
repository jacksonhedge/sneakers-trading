import { getServerClient } from '@/lib/supabase-server'
import { isValidInviteCodeFormat } from '@/lib/invite-code'
import { normalizeEmail } from '@/lib/email-validation'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

// POST /api/auth/request-link
//
// Validates { email, code } against the waitlist table and, on match, returns
// a Supabase-generated magic-link URL that the client can navigate to
// immediately — no email round-trip. This is the "code in hand = access in
// hand" flow the admin uses when they text/DM codes out of band.
//
// Security posture: the email+code pair together act as the credential. Admin
// issues each code to a specific email (see scripts/issue-invites.ts +
// issue-invites-bulk.ts), so an attacker needs both pieces to get a session.
// The magic-link URL itself is single-use and expires quickly.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown
    code?: unknown
  }
  const { code } = body

  // Collapsed error for every early-validation failure — don't leak which
  // check tripped (prevents email / code enumeration via error diffs).
  const reject = () => Response.json({ error: 'invite_invalid' }, { status: 400 })

  const normalizedEmail = normalizeEmail(body.email)
  if (!normalizedEmail) return reject()
  if (!code || typeof code !== 'string' || !isValidInviteCodeFormat(code.toUpperCase())) {
    return reject()
  }
  const normalizedCode = code.toUpperCase()

  // Look up the waitlist row via service_role (RLS blocks anon reads).
  const admin = getServerClient()
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

  // Ensure the auth.users row exists. Idempotent — if the user's already
  // there from a prior sign-in, createUser returns an error we can ignore.
  // email_confirm:true skips the "verify your email" step since we've
  // already validated ownership via the admin-issued code.
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
  // /auth/callback (which marks invite_used_at and routes first-timers
  // through onboarding).
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
