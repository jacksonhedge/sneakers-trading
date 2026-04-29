import { TerminalLoadingSplash } from '@/components/terminal-loading-splash'

// Loading slot for /markets and any /markets?category=* filter click.
// Without this the user clicks a topbar filter pill and sees nothing
// for several seconds — the click feels swallowed even though the
// route is on its way. The splash gives immediate visual feedback.

export default function MarketsLoading() {
  return (
    <div className="h-screen w-full">
      <TerminalLoadingSplash />
    </div>
  )
}
