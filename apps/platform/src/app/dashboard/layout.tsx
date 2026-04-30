import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
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
    configuredVenueIds: string[]
  } | null> => {
    const admin = getServerClient()
    const [waitlistRes, credsRes] = await Promise.all([
      admin
        .from('waitlist')
        .select('email, avatar_url')
        .eq('email', email.toLowerCase())
        .maybeSingle(),
      admin.from('user_venue_credentials').select('venue').eq('user_id', userId),
    ])
    if (!waitlistRes.data) return null
    return {
      waitlistEmail: waitlistRes.data.email as string,
      avatarUrl: (waitlistRes.data.avatar_url as string | null) ?? null,
      configuredVenueIds: (credsRes.data ?? [])
        .map((r) => r.venue as string)
        .filter(Boolean),
    }
  },
)

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getDashboardUser()
  if (!user || !user.email) redirect('/signup')

  const chrome = await getChromeData(user.email, user.id)
  if (!chrome) redirect('/signup?error=no_waitlist_row')

  const userName = chrome.waitlistEmail?.split('@')[0] ?? null

  return (
    <DashboardShell
      email={chrome.waitlistEmail}
      userName={userName}
      avatarUrl={chrome.avatarUrl}
      configuredVenueIds={chrome.configuredVenueIds}
    >
      {children}
    </DashboardShell>
  )
}
