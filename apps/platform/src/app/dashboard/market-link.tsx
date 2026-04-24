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
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}
