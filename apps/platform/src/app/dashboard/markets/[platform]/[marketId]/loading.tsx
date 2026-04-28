import { TerminalLoadingSplash } from '@/components/terminal-loading-splash'

// Market-detail loading. The DashboardShell skips the dashboard chrome
// for this route (market detail has its own layout), so we render the
// splash full-screen.

export default function MarketDetailLoading() {
  return (
    <div className="h-screen w-full">
      <TerminalLoadingSplash />
    </div>
  )
}
