import { MarketsListingBody, type MarketsListingParams } from '@/app/markets/markets-listing-body'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Markets — Sneakers Terminal',
}

// In-app markets listing. Auth + chrome (topbar + OToole panel) come
// from the dashboard layout. This route exists so the topbar filter
// pills (Sports / Politics / Crypto / etc.) can stay inside the
// dashboard layout instead of jumping the user to the public-style
// /markets route — that jump was the "looks like I got logged out"
// shift the user kept hitting.

export default async function DashboardMarketsPage({
  searchParams,
}: {
  searchParams: Promise<MarketsListingParams>
}) {
  const sp = await searchParams
  return (
    <div className="px-6 py-5">
      <MarketsListingBody searchParams={sp} hrefBase="/dashboard/markets" />
    </div>
  )
}
