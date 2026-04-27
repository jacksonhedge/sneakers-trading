'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { track } from '@/lib/track'

// Mounts once near the root of the app tree and fires a `page_view` event
// every time the pathname or search params change. Pure client; no UI.
//
// Search params are included as metadata (truncated). This catches asset
// filter changes on /dashboard/minute, query strings on /markets, etc.
export function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    const qs = searchParams?.toString() ?? ''
    track('page_view', {
      target: pathname,
      metadata: qs ? { qs: qs.length > 500 ? qs.slice(0, 500) : qs } : undefined,
    })
  }, [pathname, searchParams])

  return null
}
