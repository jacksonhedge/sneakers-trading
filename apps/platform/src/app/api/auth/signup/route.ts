import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { isValidInviteCodeFormat } from '@/lib/invite-code'
import { normalizeEmail } from '@/lib/email-validation'
import { pickAvatarDefaults } from '@/lib/avatar-defaults'

// POST /api/auth/signup
//
// Body: { email, password, name, code? }
//
// Creates an email/password Supabase auth user and a matching waitlist row.
// If `code` is provided and matches an unburned invite, the user is granted
// instant access (invite_used_at = now). If no code, they're queued on the
// waitlist (status pending) and won't see the dashboard until graduated.
//
// On success the user is signed in (session cookie set) and the route
// returns { ok: true, hasAccess: boolean } so the client can pick the
// post-signup destination (/dashboard for accepted, a waitlist landing
// for queued users).
//
// Returns 400 with a clear error code on validation failure. Stores the
// user's display name in user_metadata.display_name for use across the
// app's profile + leaderboard surfaces.

const NAME_MIN = 2
const NAME_MAX = 80
const PASSWORD_MIN = 8
const PASSWORD_MAX = 200

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown
    password?: unknown
    name?: unknown
    code?: unknown
  }

  const email = normalizeEmail(body.email)
  if (!email) {
    return Response.json(
      { error: 'invalid_email', message: 'That email address doesn’t look right. Use the format you@example.com.' },
      { status: 400 },
    )
  }

  const password = typeof body.password === 'string' ? body.password : null
  if (!password || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return Response.json(
      { error: 'invalid_password', message: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.` },
      { status: 400 },
    )
  }

  const name =
    typeof body.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : ''
  if (name.length < NAME_MIN) {
    return Response.json(
      { error: 'invalid_name', message: `Name must be at least ${NAME_MIN} characters.` },
      { status: 400 },
    )
  }

  const codeRaw =
    typeof body.code === 'string' && body.code.trim().length > 0
      ? body.code.trim().toUpperCase()
      : null
  if (codeRaw && !isValidInviteCodeFormat(codeRaw)) {
    return Response.json(
      {
        error: 'invalid_code',
        message: 'Access codes are 8 characters, letters and numbers (no zeros or letter O). Double-check what you pasted.',
      },
      { status: 400 },
    )
  }

  const admin = getServerClient()

  // If a code was provided, validate before creating the user — we don't
  // want to create accounts for failed code attempts.
  let codeValid = false
  if (codeRaw) {
    const { data: row } = await admin
      .from('waitlist')
      .select('email, invite_code, invite_used_at')
      .eq('email', email)
      .maybeSingle()
    if (!row) {
      return Response.json(
        {
          error: 'invite_no_match',
          message: `No invite was issued to ${email}. Codes are tied to a specific email — double-check the address, or join without a code.`,
        },
        { status: 400 },
      )
    }
    if (!row.invite_code || row.invite_code !== codeRaw) {
      return Response.json(
        {
          error: 'invite_mismatch',
          message: `That code doesn't match the one we issued to ${email}. Check for typos (codes are 8 characters, no zeros or letter O).`,
        },
        { status: 400 },
      )
    }
    if (row.invite_used_at) {
      return Response.json(
        {
          error: 'invite_used',
          message: 'That code has already been used. If this was you, sign in instead — your account is ready.',
        },
        { status: 400 },
      )
    }
    codeValid = true
  }

  // Create the auth user via the user-scoped client. signUp returns a session
  // immediately when email-confirmation is disabled at the Supabase project
  // level (which we configure for password-based instant access). If
  // confirmation is required, the session is null and the user has to click
  // a confirmation email — handle both paths.
  const auth = await getAuthClient()
  const { data: signUpData, error: signUpErr } = await auth.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
    },
  })
  if (signUpErr) {
    // "User already registered" → tell the client to sign in instead.
    if (/already registered|already exists|already.*?signed/i.test(signUpErr.message)) {
      return Response.json(
        { error: 'email_in_use', message: 'An account with that email already exists. Sign in instead.' },
        { status: 409 },
      )
    }
    console.error('[auth/signup] signUp failed', signUpErr)
    return Response.json(
      {
        error: 'server_error',
        message: 'Couldn’t create your account right now. Try again in a moment, or contact support if it keeps failing.',
      },
      { status: 500 },
    )
  }

  const userId = signUpData.user?.id ?? null

  // Bookkeep the waitlist row. If a row already exists for this email
  // (someone signed up via /r/<code> earlier and we're claiming the
  // account now), update it — otherwise insert. We DO NOT use 'OPENSIGN'
  // sentinel here: invite_code stays null for code-less signups, the
  // unique constraint is honored.
  const { generateUniqueReferralCode } = await import('@/lib/referral-code')
  const now = new Date().toISOString()
  const { data: existing } = await admin
    .from('waitlist')
    .select('email, referral_code')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    // If the user provided a valid code, mark it burned + ensure
    // display_name. Otherwise leave waitlist row unchanged (still pending).
    if (codeValid) {
      await admin
        .from('waitlist')
        .update({ invite_used_at: now, account_type: 'individual' })
        .eq('email', email)
    }
  } else {
    // Brand-new signup. Insert a row; mark invite_used_at if they had a
    // valid code, otherwise leave it null (they're on the waitlist).
    const referralCode = await generateUniqueReferralCode()
    const { emoji: avatarEmoji, color: avatarColor } = pickAvatarDefaults()
    await admin.from('waitlist').insert({
      email,
      source: 'signup',
      referral_code: referralCode,
      invite_code: null,
      invited_at: now,
      invite_used_at: codeValid ? now : null,
      account_type: 'individual',
      avatar_emoji: avatarEmoji,
      avatar_color: avatarColor,
    })
  }

  // user_profiles.display_name — kept in sync so leaderboard / profile
  // surfaces can render the human name without re-reading user_metadata.
  if (userId) {
    await admin.from('user_profiles').upsert(
      { user_id: userId, display_name: name },
      { onConflict: 'user_id' },
    )
  }

  return Response.json({
    ok: true,
    hasAccess: codeValid,
    needsEmailConfirmation: !signUpData.session,
  })
}
