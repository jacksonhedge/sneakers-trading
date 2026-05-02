import Image from 'next/image'
import Link from 'next/link'
import { SignOutButton } from '../../../sign-out-button'
import { FreshnessIndicator } from '@/components/freshness-indicator'

/**
 * Leaner topbar for focused single-market views. Unlike DashboardTopbar this
 * drops the Simple/Medium/Terminal view toggle, the PriceFormat toggle, and
 * the live time/market-count strip — all of which are dashboard-scoped. In
 * their place: explicit nav links back to Dashboard / Markets / Venues /
 * Billing and a prominent search so users can pivot out without going back
 * first.
 *
 * Visual contract intentionally mirrors DashboardTopbarV2 — same brand
 * lockup (Sneakers logo on a dark circle), same border + spacing rhythm —
 * so jumping from /dashboard to a market detail doesn't read as a
 * different product. Dropped the per-page light/dark theme toggle that
 * lived here; theme switching at the page level felt orphaned and
 * conflicted with the rest of the app's single-light-theme posture.
 */
export function MarketTopbar({ latestTs }: { latestTs?: string | null }) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur-sm flex-shrink-0">
      <div className="flex items-center gap-4 px-4 py-2.5">
        <Link href="/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-stone-950 flex items-center justify-center ring-1 ring-emerald-500/40 overflow-hidden p-1">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={28}
              height={28}
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-sm font-medium text-[var(--text)]">Sneakers</span>
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
          {latestTs && (
            <FreshnessIndicator
              ts={latestTs}
              // Market-detail view shows the snapshot for one market; many
              // platforms scrape on a 5-15 min cadence, so the dashboard's
              // 300s "LAGGING" threshold cried wolf on every first open.
              // 15 min lets quiet markets read as LIVE while still flipping
              // amber on truly stale feeds.
              staleAfterSec={900}
              compact
            />
          )}
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
