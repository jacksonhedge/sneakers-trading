'use client'

import { usePathname } from 'next/navigation'
import { DashboardTopbarV2 } from './topbar-v2'
import { OToolePanel } from './otoole-panel'

// Client wrapper that decides whether to render the full dashboard chrome
// or a bare passthrough for the market-detail route. Market detail has
// its own topbar + multi-column layout (left market info, main chart,
// right trade panel) and adding the OToole panel as a 4th column would
// crush it. Every other /dashboard/* page gets the chrome.

interface Props {
  email: string | null
  userName: string | null
  configuredVenueIds: string[]
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
  configuredVenueIds,
  children,
}: Props) {
  const pathname = usePathname()
  if (isMarketDetailPath(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="h-screen overflow-hidden bg-stone-50 text-stone-900 flex flex-col">
      <DashboardTopbarV2
        email={email}
        configuredVenueIds={configuredVenueIds}
      />

      <div className="flex-1 flex min-h-0">
        <OToolePanel userName={userName} />
        <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
      </div>
    </div>
  )
}
