'use client'

import { usePathname } from 'next/navigation'
import { AutoRefresh } from '@/components/auto-refresh'
import { DashboardTopbarV2 } from './topbar-v2'
import { OToolePanel } from './otoole-panel'
import { OTooleMobileFAB } from './otoole-mobile-fab'
import { NotAdminBanner } from './not-admin-banner'

// Client wrapper that decides whether to render the full dashboard chrome
// or a bare passthrough for the market-detail route. Market detail has
// its own topbar + multi-column layout (left market info, main chart,
// right trade panel) and adding the OToole panel as a 4th column would
// crush it. Every other /dashboard/* page gets the chrome.

interface Props {
  email: string | null
  userName: string | null
  avatarUrl?: string | null
  avatarEmoji?: string | null
  avatarColor?: string | null
  configuredVenueIds: string[]
  planTier?: string
  children: React.ReactNode
}

function isMarketDetailPath(pathname: string | null): boolean {
  if (!pathname) return false
  // /dashboard/markets/<platform>/<marketId> — exactly 4 segments.
  const parts = pathname.split('/').filter(Boolean)
  return (
    parts.length === 4 &&
    parts[0] === 'dashboard' &&
    parts[1] === 'markets'
  )
}

export function DashboardShell({
  email,
  userName,
  avatarUrl,
  avatarEmoji,
  avatarColor,
  configuredVenueIds,
  planTier,
  children,
}: Props) {
  const pathname = usePathname()
  if (isMarketDetailPath(pathname)) {
    // Market detail still gets the auto-refresh — prices on the
    // chart and best-ask in the trade panel should keep ticking.
    return (
      <>
        <AutoRefresh intervalMs={30_000} />
        {children}
      </>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-stone-50 text-stone-900 flex flex-col">
      {/* Re-fetches server-component data every 30s so prices, volume
          rankings, and the freshness indicator stay live without the
          user having to refresh. Pauses while the tab is hidden. */}
      <AutoRefresh intervalMs={30_000} />
      <DashboardTopbarV2
        email={email}
        avatarUrl={avatarUrl}
        avatarEmoji={avatarEmoji}
        avatarColor={avatarColor}
        configuredVenueIds={configuredVenueIds}
        planTier={planTier}
      />

      <div className="flex-1 flex min-h-0">
        {/* OToolePanel internally hides itself below the md breakpoint;
            the FAB-driven popup below takes over for mobile. */}
        <OToolePanel userName={userName} />
        <main className="flex-1 overflow-y-auto min-w-0">
          <NotAdminBanner />
          {children}
        </main>
      </div>
      <OTooleMobileFAB userName={userName} />
    </div>
  )
}
