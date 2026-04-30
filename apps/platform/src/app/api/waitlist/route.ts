import { getServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-auth'
import { sendWaitlistConfirmation } from '@/lib/email'
import { displayedPosition } from '@/lib/waitlist'
import { normalizeEmail } from '@/lib/email-validation'
import { checkSignupAllowed } from '@/lib/signup-config'
import { mintAndSendMagicLink } from '@/lib/magic-link'
import { pickAvatarDefaults } from '@/lib/avatar-defaults'
import {
  generateUniqueReferralCode,
  isValidReferralCodeFormat,
} from '@/lib/referral-code'

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
    orgDescription?: unknown
    orgTier?: unknown
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

  // Tier choice + free-form description, both optional. Tier comes from the
  // new 3-card picker on the org signup form (software_only,
  // hardware_mac_studio, hardware_macbook_pro). Encode into org_description
  // text for now since we don't have a dedicated tier column on
  // organization_signups yet.
  const allowedTiers = ['software_only', 'hardware_mac_studio', 'hardware_macbook_pro']
  const orgTier =
    accountType === 'business' && typeof body.orgTier === 'string' && allowedTiers.includes(body.orgTier)
      ? body.orgTier
      : null
  const orgDescription =
    accountType === 'business' && typeof body.orgDescription === 'string' && body.orgDescription.trim()
      ? body.orgDescription.trim().slice(0, 500)
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
    const result = await mintAndSendMagicLink({
      email: normalizedEmail,
      next: '/admin',
    })
    if (!result.ok) {
      console.error('[waitlist] admin magic-link failed', result.reason)
      return Response.json({ error: 'server_error' }, { status: 500 })
    }
    return Response.json({
      ok: true,
      admin: true,
      ...(result.devLink ? { devLink: result.devLink } : {}),
    })
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
  const { emoji: avatarEmoji, color: avatarColor } = pickAvatarDefaults()

  // The waitlist table holds the basic signup. Org-specific data lives in a
  // separate organization_signups table — written below as a follow-up
  // insert when this is a business signup.
  const baseRow = {
    email: normalizedEmail,
    source: typeof source === 'string' ? source : 'landing',
    referrer: req.headers.get('referer'),
    ip_country:
      req.headers.get('cf-ipcountry') ?? req.headers.get('x-vercel-ip-country'),
    referral_code: referralCode,
    referred_by_code: referredByCode,
    account_type: accountType,
    company_name: companyName,
    avatar_emoji: avatarEmoji,
    avatar_color: avatarColor,
  }
  const { error } = await supabase.from('waitlist').insert(baseRow)

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

  // Org follow-up insert: when a captain signs up their fraternity / sorority
  // / etc, capture the org-specific fields in organization_signups. Separate
  // table so individuals never carry org-shaped nulls. Non-fatal — if this
  // fails, the user is still on the waitlist; admin can backfill the org row.
  if (!isDuplicate && accountType === 'business' && companyName && orgType && orgLeaderName && orgCollege) {
    // Compose the description: prefix with the user's tier choice + any
    // free-text description they sent, so admin can see at a glance what
    // they're committing to. Format: "tier=X; selected=Y" (parseable later).
    const fullDescription = orgDescription ?? (orgTier ? `tier=${orgTier}` : null)
    const { error: orgErr } = await supabase.from('organization_signups').insert({
      org_name: companyName,
      org_type: orgType,
      org_leader_name: orgLeaderName,
      org_leader_email: normalizedEmail,
      org_college: orgCollege,
      org_description: fullDescription,
      status: 'pending',
    })
    if (orgErr) {
      console.error('[waitlist] organization_signups insert failed', orgErr)
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
