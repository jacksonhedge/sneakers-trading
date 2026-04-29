import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { WAITLIST_DISPLAY_OFFSET } from '@/lib/waitlist'
import { DashboardTopbar } from '@/app/dashboard/topbar'
import { DashboardSidebar } from '@/app/dashboard/sidebar'
import { MarketsListingBody, type MarketsListingParams } from './markets-listing-body'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Markets — Sneakers Terminal',
  description: 'Live prediction-market prices across every book Sneakers tracks.',
}

// Public-chrome markets page (DashboardTopbar + DashboardSidebar) for
// users who land here directly (deep-link, SEO, signed-out path). The
// in-app version at /dashboard/markets renders the same listing inside
// the dashboard layout (OToole panel + topbar persist).

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<MarketsListingParams>
}) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/login?next=/markets')

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('email, referral_code, direct_referrals, indirect_referrals, created_at')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  const sidebarEmail = row?.email ?? user.email
  let sidebarPosition = 0
  let directRefs = 0
  let indirectRefs = 0
  if (row) {
    const { count: earlierCount } = await admin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', row.created_at)
    const rawOrder = (earlierCount ?? 0) + 1 + WAITLIST_DISPLAY_OFFSET
    const boost = 5 * row.direct_referrals + 2 * row.indirect_referrals
    sidebarPosition = Math.max(1, rawOrder - boost)
    directRefs = row.direct_referrals
    indirectRefs = row.indirect_referrals
  }

  const sp = await searchParams

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col">
      <DashboardTopbar />
      <div className="flex-1 flex min-h-0">
        <DashboardSidebar
          email={sidebarEmail}
          position={sidebarPosition}
          directRefs={directRefs}
          indirectRefs={indirectRefs}
        />
        <main className="flex-1 overflow-y-auto px-6 py-5 min-w-0">
          <MarketsListingBody searchParams={sp} hrefBase="/markets" />
        </main>
      </div>
    </div>
  )
}
