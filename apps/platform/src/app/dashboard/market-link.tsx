'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

// Wraps a row or card so clicking it opens the Market Detail Drawer.
// The drawer opens when the URL contains `?m=<platform>:<market_id>`;
// this component just builds that link while preserving other params.

export function MarketLink({
  market,
  className,
  children,
}: {
  market: { platform: string; platform_market_id: string }
  className?: string
  children: ReactNode
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const next = new URLSearchParams(params?.toString() ?? '')
  next.set('m', `${market.platform}:${market.platform_market_id}`)
  const href = `${pathname}?${next.toString()}`
  return (
    <Link href={href} scroll={false} className={className}>
      {children}
    </Link>
  )
}
