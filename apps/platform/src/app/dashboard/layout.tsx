import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { DashboardShell } from './dashboard-shell'

export const dynamic = 'force-dynamic'

// Shared chrome for every /dashboard/* page: top bar, the OToole AI
// panel on the left, and a content slot on the right. Per-page server
// components render INTO the slot so the panel persists across navigations
// (no remount of the chat or the topbar when the user clicks around).
//
// Auth + waitlist gate live here so individual pages don't have to
// repeat the same redirect dance.
//
// React `cache()` wrappers are critical here. Without them, every RSC
// prefetch (Next.js fires several per click on hover, plus revalidations)
// re-runs the same auth.getUser + waitlist + user_venue_credentials
// queries. With ~12 prefetched rows × ~3 chrome queries we were seeing
// ~70 round-trips per page click and 503ing Vercel functions on prod.
// cache() dedupes within a single React render (one round-trip per
// query no matter how many sub-trees ask for it).

const getDashboardUser = cache(async () => {
  const supabase = await getAuthClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
})

const getWaitlistRow = cache(async (email: string) => {
  const admin = getServerClient()
  const { data } = await admin
    .from('waitlist')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  return data
})

const getConfiguredVenueIds = cache(async (userId: string) => {
  const admin = getServerClient()
  const { data } = await admin
    .from('user_venue_credentials')
    .select('venue')
    .eq('user_id', userId)
  return (data ?? []).map((r) => r.venue as string).filter(Boolean)
})

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getDashboardUser()
  if (!user || !user.email) redirect('/signup')

  const row = await getWaitlistRow(user.email)
  if (!row) redirect('/signup?error=no_waitlist_row')

  const configuredVenueIds = await getConfiguredVenueIds(user.id)
  const userName = row.email?.split('@')[0] ?? null

  return (
    <DashboardShell
      email={row.email}
      userName={userName}
      configuredVenueIds={configuredVenueIds}
    >
      {children}
    </DashboardShell>
  )
}
