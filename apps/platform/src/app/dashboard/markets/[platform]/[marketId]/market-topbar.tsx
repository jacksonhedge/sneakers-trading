import Link from 'next/link'
import { SignOutButton } from '../../../sign-out-button'
import { ThemeToggle } from './theme-toggle'
import { FreshnessIndicator } from '@/components/freshness-indicator'

/**
 * Leaner topbar for focused single-market views. Unlike DashboardTopbar this
 * drops the Simple/Medium/Terminal view toggle, the PriceFormat toggle, and
 * the live time/market-count strip — all of which are dashboard-scoped. In
 * their place: explicit nav links back to Dashboard / Markets / Portfolio
 * and a prominent search so users can pivot out without going back first.
 */
export function MarketTopbar({ latestTs }: { latestTs?: string | null }) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm flex-shrink-0">
      <div className="flex items-center gap-4 px-4 py-2.5">
        <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-[#0c0a09] flex items-center justify-center text-[10px] text-emerald-400 font-bold ring-1 ring-emerald-400/30">
            Ø
          </div>
          <div>
            <div className="text-sm font-bold leading-none text-[var(--text)]">O&apos;Toole</div>
            <div className="text-[9px] text-[var(--text-muted)] tracking-[0.2em] leading-none mt-0.5">
              TERMINAL
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 text-xs tracking-wider flex-shrink-0">
          <Link
            href="/dashboard"
            className="px-2.5 py-1 rounded text-[var(--text-2)] hover:bg-[var(--panel-2)] transition"
          >
            Dashboard
          </Link>
          <Link
            href="/markets"
            className="px-2.5 py-1 rounded text-[var(--accent)] font-semibold bg-[var(--panel-2)]"
          >
            Markets
          </Link>
          <Link
            href="/venues"
            className="px-2.5 py-1 rounded text-[var(--text-2)] hover:bg-[var(--panel-2)] transition"
          >
            Venues
          </Link>
          <Link
            href="/dashboard/billing"
            className="px-2.5 py-1 rounded text-[var(--text-2)] hover:bg-[var(--panel-2)] transition"
          >
            Billing
          </Link>
        </nav>

        <form action="/markets" className="flex-1 max-w-xl">
          <div className="flex items-center gap-2 bg-[var(--panel-2)] rounded px-3 py-1.5 ring-1 ring-[var(--border)] focus-within:ring-[var(--accent)] transition">
            <span className="text-[var(--text-muted)]">⌕</span>
            <input
              name="q"
              type="search"
              placeholder="Search markets, events, outcomes…"
              className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none"
            />
            <span className="text-[10px] text-[var(--text-muted)] bg-[var(--panel)] rounded px-1.5 py-0.5 ring-1 ring-[var(--border)]">
              /
            </span>
          </div>
        </form>

        <div className="flex items-center gap-3 flex-shrink-0">
          <Link
            href="/dashboard/billing/credits"
            className="text-xs font-semibold rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] px-3 py-1.5 transition"
          >
            Deposit
          </Link>
          <FreshnessIndicator ts={latestTs} />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}

/**
 * Breadcrumb strip shown beneath MarketTopbar. Each segment is a navigation
 * target so users can jump up one level (back to a sport filter, or to the
 * full market list) without using the browser back button.
 */
export function MarketBreadcrumb({
  sport,
  platform,
  question,
}: {
  sport: string | undefined
  platform: string
  question: string
}) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--center-bg)] px-4 py-2 text-xs flex items-center gap-2 flex-shrink-0">
      <Link
        href="/markets"
        className="flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text)] transition"
      >
        <span>←</span>
        <span>Markets</span>
      </Link>
      {sport && (
        <>
          <span className="text-[var(--text-muted)]">/</span>
          <Link
            href={`/markets?sport=${encodeURIComponent(sport)}`}
            className="uppercase text-[var(--text-3)] hover:text-[var(--text)] tracking-wider transition"
          >
            {sport}
          </Link>
        </>
      )}
      <span className="text-[var(--text-muted)]">/</span>
      <Link
        href={`/markets?platform=${encodeURIComponent(platform)}`}
        className="uppercase text-[var(--text-3)] hover:text-[var(--text)] tracking-wider transition"
      >
        {platform}
      </Link>
      <span className="text-[var(--text-muted)]">/</span>
      <span className="text-[var(--text)] truncate flex-1 min-w-0" title={question}>
        {question}
      </span>
    </div>
  )
}
