import { getServerClient } from '@/lib/supabase-server'
import { getAuthClient } from '@/lib/supabase-auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { sendWaitlistConfirmation } from '@/lib/email'
import { displayedPosition } from '@/lib/waitlist'
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
  }
  const { email, source } = body

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()

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
  const rawRefCode = typeof body.referralCode === 'string' ? body.referralCode.toUpperCase() : null
  if (rawRefCode && isValidReferralCodeFormat(rawRefCode)) {
    const { data: referrer } = await supabase
      .from('waitlist')
      .select('email')
      .eq('referral_code', rawRefCode)
      .maybeSingle()
    if (referrer && referrer.email !== normalizedEmail) {
      referredByCode = rawRefCode
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
  }

  // Tell the client whether this was a new signup or a re-submit of an existing
  // email. The landing form uses this to route duplicates to /login rather than
  // silently showing "Access requested" to someone who's already registered.
  return Response.json({ ok: true, existing: isDuplicate })
}
