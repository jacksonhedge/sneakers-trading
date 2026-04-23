import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const explicitNext = url.searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(new URL('/signup?error=auth_failed', url.origin))
  }

  const supabase = await getAuthClient()
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeErr) {
    console.error('[auth/callback] exchange failed', exchangeErr)
    return NextResponse.redirect(new URL('/signup?error=auth_failed', url.origin))
  }

  // Mark invite_used_at for this user's waitlist row and detect whether this
  // is the FIRST successful sign-in. The conditional `.is('invite_used_at',
  // null)` means the update only fires once per user; .select() then returns
  // a row only when the update actually matched — that IS the first-sign-in
  // signal. Later sign-ins skip the onboarding redirect.
  let isFirstSignIn = false
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) {
    const admin = getServerClient()
    const { data: updated, error: markErr } = await admin
      .from('waitlist')
      .update({ invite_used_at: new Date().toISOString() })
      .eq('email', user.email.toLowerCase())
      .is('invite_used_at', null)
      .select('email')
    if (markErr) {
      console.error('[auth/callback] failed to mark invite_used_at', markErr)
      // Non-fatal — user is still authed, just leaves the flag unset.
    }
    isFirstSignIn = Array.isArray(updated) && updated.length > 0
  }

  // An explicit ?next= (e.g. /markets from a deep link) wins over the
  // first-sign-in redirect — the user was trying to reach a specific page.
  // Without ?next=, first-time users go through onboarding; repeat sign-ins
  // go straight to the dashboard.
  const destination =
    explicitNext ?? (isFirstSignIn ? '/onboarding/about-you' : '/dashboard')
  return NextResponse.redirect(new URL(destination, url.origin))
}
