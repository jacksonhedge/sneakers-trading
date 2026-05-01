import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { getFreshVenueIds } from '@/lib/venue-freshness'
import { ConnectionsGrid } from './connections-grid'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Connections — Sneakers Terminal',
}

export default async function ConnectionsPage() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/connections')

  // Server-side freshness check — venues with prices flowing in the
  // last 60 min get a green LIVE pill on the grid. Everything else
  // (including venues we labeled "live" in venues.ts but aren't
  // actually scraping yet) gets a dim NO DATA pill.
  const freshIds = await getFreshVenueIds()
  const freshVenueIds = Array.from(freshIds)

  // Pull which venues this user has CREDENTIALS saved for (regardless of
  // health). The grid uses this to flip the per-card button from CONNECT
  // → RECONNECT/DISCONNECT for already-credentialed venues, and to flag
  // ones with failed credentials so the user knows to fix them.
  const admin = getServerClient()
  const { data: credRows } = await admin
    .from('user_venue_credentials')
    .select('venue, test_connection_ok')
    .eq('user_id', user.id)
  const credentialedVenueIds: string[] = (credRows ?? [])
    .map((r) => r.venue as string)
    .filter(Boolean)
  const erroringVenueIds: string[] = (credRows ?? [])
    .filter((r) => r.test_connection_ok === false)
    .map((r) => r.venue as string)
    .filter(Boolean)

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        <header className="mt-6 mb-10">
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} CONNECTIONS</div>
          <h1 className="text-3xl md:text-4xl font-bold">Connected sites</h1>
          <p className="text-sm text-stone-600 mt-2 max-w-2xl">
            Mark every venue you have an account on. We&apos;ll use this to filter markets,
            pre-fill trade-destination buttons with the right affiliate codes, and
            (when one-click trading is live) route real orders to the book you&apos;re
            already set up on.
          </p>
        </header>

        <ConnectionsGrid
          freshVenueIds={freshVenueIds}
          credentialedVenueIds={credentialedVenueIds}
          erroringVenueIds={erroringVenueIds}
        />
      </div>
    </main>
  )
}
