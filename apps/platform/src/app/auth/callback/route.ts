import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/signup?error=auth_failed', url.origin))
  }

  const supabase = await getAuthClient()
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeErr) {
    console.error('[auth/callback] exchange failed', exchangeErr)
    return NextResponse.redirect(new URL('/signup?error=auth_failed', url.origin))
  }

  // Mark invite_used_at for this user's waitlist row. Only set if still null
  // (idempotent on repeat callbacks).
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) {
    const admin = getServerClient()
    const { error: markErr } = await admin
      .from('waitlist')
      .update({ invite_used_at: new Date().toISOString() })
      .eq('email', user.email.toLowerCase())
      .is('invite_used_at', null)
    if (markErr) {
      console.error('[auth/callback] failed to mark invite_used_at', markErr)
      // Non-fatal — user is still authed, just leaves the flag unset.
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
