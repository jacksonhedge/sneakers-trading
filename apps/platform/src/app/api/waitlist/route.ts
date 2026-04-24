import { getServerClient } from '@/lib/supabase-server'
import { getAuthClient } from '@/lib/supabase-auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { sendWaitlistConfirmation } from '@/lib/email'
import { displayedPosition } from '@/lib/waitlist'
import { normalizeEmail } from '@/lib/email-validation'
import { checkSignupAllowed } from '@/lib/signup-config'
import {
  generateUniqueReferralCode,
  isValidReferralCodeFormat,
} from '@/lib/referral-code'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown
    source?: unknown
    referralCode?: unknown
    accountType?: unknown
    companyName?: unknown
    orgType?: unknown
    orgLeaderName?: unknown
    orgCollege?: unknown
  }
  const { source } = body
  const accountType =
    body.accountType === 'business' ? 'business' : 'individual'
  const companyName =
    accountType === 'business' && typeof body.companyName === 'string' && body.companyName.trim()
      ? body.companyName.trim().slice(0, 200)
      : null

  // Organization-specific fields — only stored when accountType='business'
  // AND the caller sent them. Nullable across the board so individuals
  // don't trip validation.
  const allowedOrgTypes = ['fraternity', 'sorority', 'dorm', 'club', 'class', 'other']
  const orgType =
    accountType === 'business' &&
    typeof body.orgType === 'string' &&
    allowedOrgTypes.includes(body.orgType)
      ? body.orgType
      : null
  const orgLeaderName =
    accountType === 'business' && typeof body.orgLeaderName === 'string' && body.orgLeaderName.trim()
      ? body.orgLeaderName.trim().slice(0, 100)
      : null
  const orgCollege =
    accountType === 'business' && typeof body.orgCollege === 'string' && body.orgCollege.trim()
      ? body.orgCollege.trim().slice(0, 100)
      : null

  const normalizedEmail = normalizeEmail(body.email)
  if (!normalizedEmail) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }

  // Feature-flag gate. Admin emails bypass via the isAdminEmail check below.
  // Non-admins get 403 if their signup path is paused (env-controlled).
  if (!isAdminEmail(normalizedEmail)) {
    const allowed = checkSignupAllowed(accountType)
    if (!allowed.ok) {
      return Response.json({ error: allowed.error }, { status: 403 })
    }
  }

  // Admin shortcut — allowlisted emails (ADMIN_EMAILS) skip the waitlist entirely
  // and get a magic link straight to /admin. "Eternal login": no invite code
  // needed, no waitlist row, no referral bookkeeping.
  if (isAdminEmail(normalizedEmail)) {
    const authClient = await getAuthClient()
    const { error: otpErr } = await authClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=/admin`,
        shouldCreateUser: true,
      },
    })
    if (otpErr) {
      console.error('[waitlist] admin magic-link failed', otpErr)
      return Response.json({ error: 'server_error' }, { status: 500 })
    }
    return Response.json({ ok: true, admin: true })
  }

  const supabase = getServerClient()

  // Resolve referral attribution: only attach if the code exists AND points
  // to a different email than the new signup (no self-referral).
  let referredByCode: string | null = null
  let referrerEmail: string | null = null
  const rawRefCode = typeof body.referralCode === 'string' ? body.referralCode.toUpperCase() : null
  if (rawRefCode && isValidReferralCodeFormat(rawRefCode)) {
    const { data: referrer } = await supabase
      .from('waitlist')
      .select('email')
      .eq('referral_code', rawRefCode)
      .maybeSingle()
    if (referrer && referrer.email !== normalizedEmail) {
      referredByCode = rawRefCode
      referrerEmail = referrer.email
    }
  }

  const referralCode = await generateUniqueReferralCode()

  const { error } = await supabase.from('waitlist').insert({
    email: normalizedEmail,
    source: typeof source === 'string' ? source : 'landing',
    referrer: req.headers.get('referer'),
    ip_country:
      req.headers.get('cf-ipcountry') ?? req.headers.get('x-vercel-ip-country'),
    referral_code: referralCode,
    referred_by_code: referredByCode,
    account_type: accountType,
    company_name: companyName,
    org_type: orgType,
    org_leader_name: orgLeaderName,
    org_college: orgCollege,
  })

  const isDuplicate = error?.code === '23505'
  if (error && !isDuplicate) {
    console.error('waitlist insert failed:', error)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  // Skip email on duplicate — don't spam and don't mis-report position.
  if (!isDuplicate) {
    const { count } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
    const position = displayedPosition(count ?? 0)
    await sendWaitlistConfirmation({
      to: normalizedEmail,
      position,
      referralCode,
    })

    // A valid referral just fired the DB trigger that incremented the
    // referrer's direct_referrals counter. Check if the referrer now qualifies
    // for an auto-invite (Clubhouse graduation). Non-blocking for the caller:
    // the new signup still completes regardless of the referrer check.
    if (referrerEmail) {
      const { maybeAutoInvite } = await import('@/lib/auto-invite')
      maybeAutoInvite(referrerEmail).catch((err) => {
        console.error('[waitlist] referrer auto-invite check failed', err)
      })
    }
  }

  // Tell the client whether this was a new signup or a re-submit of an existing
  // email. The landing form uses this to route duplicates to /login rather than
  // silently showing "Access requested" to someone who's already registered.
  // For fresh signups, also return the minimum referral-status payload the
  // post-signup card needs so it can render position, invite dots, and link.
  if (isDuplicate) {
    return Response.json({ ok: true, existing: true })
  }
  const { count } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
  return Response.json({
    ok: true,
    existing: false,
    position: displayedPosition(count ?? 0),
    referralCode,
    inviteSlotsTotal: 1,
    directReferrals: 0,
  })
}
