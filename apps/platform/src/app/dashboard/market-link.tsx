import Link from 'next/link'
import type { ReactNode } from 'react'

// Routes a market card/row click to the full single-market detail page.
// Colons and other non-path-safe chars in platform_market_id are encoded.

export function MarketLink({
  market,
  className,
  children,
}: {
  market: { platform: string; platform_market_id: string }
  className?: string
  children: ReactNode
}) {
  const href = `/dashboard/markets/${encodeURIComponent(market.platform)}/${encodeURIComponent(market.platform_market_id)}`
  // prefetch={false}: each visible row used to fire an RSC prefetch on
  // hover. With ~12 rows in BiggestVolume + 12 in BigMovers + the layout's
  // 3 DB queries on every prefetch, the dashboard was shipping ~70 RSC
  // requests per click and saturating the server. The market-detail
  // route has its own loading.tsx splash, so an unprefetched click still
  // feels fast.
  return (
    <Link href={href} prefetch={false} className={className}>
      {children}
    </Link>
  )
}
