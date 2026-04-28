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
// Auth + waitlist gate also live here so individual pages don't have to
// repeat the same redirect dance. Per-page auth checks remain in place
// as defense-in-depth where they exist.

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('email')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  if (!row) redirect('/signup?error=no_waitlist_row')

  const { data: connectedRows } = await admin
    .from('user_venue_credentials')
    .select('venue')
    .eq('user_id', user.id)
  const configuredVenueIds = (connectedRows ?? [])
    .map((r) => r.venue as string)
    .filter(Boolean)

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
