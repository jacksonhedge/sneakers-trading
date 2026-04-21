import { getServerClient } from '@/lib/supabase-server'
import { sendWaitlistConfirmation } from '@/lib/email'
import { displayedPosition } from '@/lib/waitlist'
import {
  generateUniqueReferralCode,
  isValidReferralCodeFormat,
} from '@/lib/referral-code'

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

  return Response.json({ ok: true })
}
