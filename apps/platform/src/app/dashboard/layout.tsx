import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { generateUniqueReferralCode } from '@/lib/referral-code'
import { pickAvatarDefaults } from '@/lib/avatar-defaults'
import { DashboardShell } from './dashboard-shell'

export const dynamic = 'force-dynamic'

// Shared chrome for every /dashboard/* page. Auth + waitlist gate live
// here so individual pages don't have to repeat the redirect dance.
//
// Performance notes (after QA pass 3 still hitting ~40% 503s on RSC):
//   - cache() wrappers dedupe within one render, but each prefetch is
//     its own render, so cross-prefetch dedupe doesn't apply.
//   - Combined waitlist + venue-creds into one query (Promise.all → 2
//     parallel round-trips instead of 2 serial). The auth call is
//     against the auth service not Postgres so it doesn't share the
//     connection pool.
//   - If 503s persist, the bottleneck is server-side capacity (Vercel
//     concurrency limits or Supabase connection pool exhaustion), not
//     anything we can fix in code without a heavier refactor.

const getDashboardUser = cache(async () => {
  const supabase = await getAuthClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
})

const getChromeData = cache(
  async (
    email: string,
    userId: string,
  ): Promise<{
    waitlistEmail: string | null
    avatarUrl: string | null
    avatarEmoji: string | null
    avatarColor: string | null
    inviteUsedAt: string | null
    configuredVenueIds: string[]
  } | null> => {
    const admin = getServerClient()
    const [waitlistRes, credsRes] = await Promise.all([
      admin
        .from('waitlist')
        .select('email, avatar_url, avatar_emoji, avatar_color, invite_used_at')
        .eq('email', email.toLowerCase())
        .maybeSingle(),
      // Pull credentials including the test-connection result so we can
      // distinguish "saved + verified" from "saved but the venue rejected
      // them". Only verified ones get the green checkmark in the topbar
      // (verifier caught us showing checkmarks for erroring credentials).
      admin
        .from('user_venue_credentials')
        .select('venue, test_connection_ok')
        .eq('user_id', userId),
    ])
    if (!waitlistRes.data) return null
    return {
      waitlistEmail: waitlistRes.data.email as string,
      avatarUrl: (waitlistRes.data.avatar_url as string | null) ?? null,
      avatarEmoji: (waitlistRes.data.avatar_emoji as string | null) ?? null,
      avatarColor: (waitlistRes.data.avatar_color as string | null) ?? null,
      inviteUsedAt: (waitlistRes.data.invite_used_at as string | null) ?? null,
      // configuredVenueIds is now "verified credentials only" — the
      // green-check badge in the topbar reflects working creds, not
      // just-saved-but-failed ones.
      configuredVenueIds: (credsRes.data ?? [])
        .filter((r) => r.test_connection_ok === true)
        .map((r) => r.venue as string)
        .filter(Boolean),
    }
  },
)

// Auto-bootstrap a waitlist row for an authed user who doesn't have one
// (magic-link sign-up where the insert raced, or a manually-created auth
// user). Inserts in PENDING state — invite_used_at: null — so they go
// through the admin-approval flow rather than landing on a fully-
// functional dashboard. Existing approved users are unaffected.
async function bootstrapWaitlistRow(email: string): Promise<void> {
  const admin = getServerClient()
  const referralCode = await generateUniqueReferralCode()
  const { emoji: avatarEmoji, color: avatarColor } = pickAvatarDefaults()
  const now = new Date().toISOString()
  await admin
    .from('waitlist')
    .insert({
      email: email.toLowerCase(),
      source: 'auto_bootstrap',
      referral_code: referralCode,
      invite_code: null,
      invited_at: now,
      invite_used_at: null,
      account_type: 'individual',
      avatar_emoji: avatarEmoji,
      avatar_color: avatarColor,
    })
    .select('email')
    .maybeSingle()
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getDashboardUser()
  if (!user || !user.email) redirect('/signup')

  let chrome = await getChromeData(user.email, user.id)
  if (!chrome) {
    // Authed user with no waitlist row — bootstrap one so they don't get
    // stuck on the signup page. Re-fetches chrome immediately so the
    // rest of the layout has the data it needs.
    try {
      await bootstrapWaitlistRow(user.email)
      chrome = await getChromeData(user.email, user.id)
    } catch (err) {
      console.error('[dashboard/layout] bootstrap waitlist row failed', err)
    }
  }
  if (!chrome) {
    // Bootstrap also failed — log loudly and bounce to /signup. We used
    // to append ?error=no_waitlist_row to the URL but that leaked
    // internal vocab to the visitor. The signup page never read the
    // param anyway, and the underlying causes (column-missing,
    // service-role connectivity) are operator concerns, not user ones.
    console.error('[dashboard/layout] no chrome after bootstrap', { email: user.email, userId: user.id })
    redirect('/signup')
  }

  // Approval gate — non-admin users without invite_used_at land on the
  // pending-approval page. Admin emails (per ADMIN_EMAILS env var) skip
  // the gate so the owner / staff can always reach the dashboard.
  if (!chrome.inviteUsedAt) {
    const { isAdminEmail } = await import('@/lib/admin-auth')
    if (!isAdminEmail(user.email)) {
      redirect('/pending')
    }
  }

  const userName = chrome.waitlistEmail?.split('@')[0] ?? null

  return (
    <DashboardShell
      email={chrome.waitlistEmail}
      userName={userName}
      avatarUrl={chrome.avatarUrl}
      avatarEmoji={chrome.avatarEmoji}
      avatarColor={chrome.avatarColor}
      configuredVenueIds={chrome.configuredVenueIds}
    >
      {children}
    </DashboardShell>
  )
}
