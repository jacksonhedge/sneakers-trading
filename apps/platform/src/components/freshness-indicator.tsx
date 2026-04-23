'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  /** ISO timestamp of the latest data we're displaying. */
  ts: string | null | undefined
  /**
   * Seconds past which we flag the feed as LAGGING. Default 300 (5 min).
   * Scraper cadence is manual today so this is a heuristic — tune per-page.
   */
  staleAfterSec?: number
  /**
   * How often to trigger router.refresh() so the server picks up any new
   * scraper writes. Default 30s matches the loadCanonicalMarkets cache TTL
   * (no point refreshing faster — server just returns the cached answer).
   */
  refreshEverySec?: number
  /** Compact layout (dot + label only, no "updated Xs ago"). */
  compact?: boolean
  /** Optional label that replaces the status word ("LIVE" / "STALE"). */
  label?: string
}

function fmtAge(sec: number): string {
  if (sec < 1) return 'just now'
  if (sec < 60) return `${Math.floor(sec)}s ago`
  const m = Math.floor(sec / 60)
  if (m < 60) {
    const s = Math.floor(sec % 60)
    return s > 0 ? `${m}m ${s}s ago` : `${m}m ago`
  }
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * Shows a live-ticking "Updated Xs ago" badge for a server-rendered timestamp.
 * Flips to an amber "LAGGING" / red "STALE" state when the data is older than
 * `staleAfterSec`. Quietly triggers `router.refresh()` every `refreshEverySec`
 * so the server has a chance to pick up new scraper writes without the user
 * hitting reload.
 *
 * UX rule: never hide the age. A user should always be able to tell at a
 * glance how old the prices they're looking at are.
 */
export function FreshnessIndicator({
  ts,
  staleAfterSec = 300,
  refreshEverySec = 30,
  compact = false,
  label,
}: Props) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())

  // Tick every second for the elapsed label. Cheap — no render cascade
  // beyond this badge since it's isolated.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Periodic soft refresh. router.refresh() re-runs server components and
  // hydrates new props; the 30s cache inside loadCanonicalMarkets means
  // most refreshes are cheap no-ops server-side.
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, refreshEverySec * 1000)
    return () => clearInterval(id)
  }, [router, refreshEverySec])

  if (!ts) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-500 tracking-wider">
        <span className="w-2 h-2 rounded-full bg-stone-400" />
        NO DATA
      </span>
    )
  }

  const parsed = Date.parse(ts)
  if (!Number.isFinite(parsed)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-500 tracking-wider">
        <span className="w-2 h-2 rounded-full bg-stone-400" />
        —
      </span>
    )
  }

  const ageSec = Math.max(0, (now - parsed) / 1000)
  const fresh = ageSec < staleAfterSec
  const veryStale = ageSec > staleAfterSec * 3

  const dotCls = fresh
    ? 'bg-emerald-500 animate-pulse'
    : veryStale
      ? 'bg-red-500'
      : 'bg-amber-500 animate-pulse'

  const statusCls = fresh
    ? 'text-emerald-700'
    : veryStale
      ? 'text-red-700'
      : 'text-amber-700'

  const status = label ?? (fresh ? 'LIVE' : veryStale ? 'STALE' : 'LAGGING')

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] tracking-wider"
      title={`Last update: ${new Date(parsed).toLocaleString()}`}
    >
      <span className={`w-2 h-2 rounded-full ${dotCls}`} />
      <span className={`font-semibold ${statusCls}`}>{status}</span>
      {!compact && (
        <span className="text-stone-500">
          · updated <span className="tabular-nums text-stone-700">{fmtAge(ageSec)}</span>
        </span>
      )}
    </span>
  )
}
