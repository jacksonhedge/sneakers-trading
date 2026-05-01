'use client'

import { useEffect, useState } from 'react'

type Props = {
  /** ISO timestamp of the latest data we're displaying. */
  ts: string | null | undefined
  /**
   * Seconds past which we flag the feed as LAGGING. Default 300 (5 min).
   */
  staleAfterSec?: number
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
 * Live-ticking "updated Xs ago" badge with a status dot. The dot
 * pulses + emits an expanding ring so the topbar always reads as
 * "the system is alive" — even when there's no data yet (LOADING
 * state) or the feed is briefly behind. The actual data refresh is
 * handled globally by <AutoRefresh /> in the dashboard shell; this
 * component just re-renders the age every second based on prop ts.
 */
export function FreshnessIndicator({
  ts,
  staleAfterSec = 300,
  compact = false,
  label,
}: Props) {
  // `now` starts as null so SSR + first client render produce the same
  // markup. On mount, we set the real time and start the 1s tick.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const parsed = ts ? Date.parse(ts) : NaN
  const hasValidTs = Number.isFinite(parsed)

  // Three states: loading (no ts yet), fresh, lagging, very-stale.
  const ageSec =
    now != null && hasValidTs ? Math.max(0, (now - parsed) / 1000) : 0
  const fresh = hasValidTs && ageSec < staleAfterSec
  const veryStale = hasValidTs && ageSec > staleAfterSec * 3

  let dotCls: string
  let statusCls: string
  let statusText: string
  let ringCls: string | null

  if (!hasValidTs) {
    // No timestamp yet — "Loading…" with a soft amber pulse so the
    // pill never reads as dead/inactive.
    dotCls = 'bg-amber-400'
    statusCls = 'text-amber-700'
    statusText = label ?? 'LOADING'
    ringCls = 'bg-amber-400/60'
  } else if (fresh) {
    dotCls = 'bg-emerald-500'
    statusCls = 'text-emerald-700'
    statusText = label ?? 'LIVE'
    ringCls = 'bg-emerald-400/70'
  } else if (veryStale) {
    dotCls = 'bg-red-500'
    statusCls = 'text-red-700'
    statusText = label ?? 'STALE'
    ringCls = null // hard-stale = static, draws attention precisely because nothing's pulsing
  } else {
    dotCls = 'bg-amber-500'
    statusCls = 'text-amber-700'
    statusText = label ?? 'LAGGING'
    ringCls = 'bg-amber-400/60'
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] tracking-wider"
      // Title resolves only after mount so SSR and first client render
      // emit identical markup. toLocaleString varies by server vs browser
      // locale and was the source of React error #418 (hydration text
      // mismatch) on dashboards with a freshness indicator in the topbar.
      title={
        now != null && hasValidTs
          ? `Last update: ${new Date(parsed).toLocaleString()}`
          : hasValidTs
            ? 'Last update: —'
            : 'Waiting for first data point'
      }
    >
      <style>{`
        @keyframes freshness-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          80%  { transform: scale(2.6); opacity: 0;   }
          100% { transform: scale(2.6); opacity: 0;   }
        }
        .freshness-ring { animation: freshness-ring 1.6s cubic-bezier(0,0,0.2,1) infinite; }
      `}</style>
      <span className="relative inline-flex w-2 h-2 items-center justify-center">
        {ringCls && (
          <span
            className={`freshness-ring absolute inset-0 rounded-full ${ringCls}`}
            aria-hidden
          />
        )}
        <span className={`relative w-2 h-2 rounded-full ${dotCls}`} />
      </span>
      <span className={`font-semibold ${statusCls}`}>{statusText}</span>
      {!compact && hasValidTs && (
        <span className="text-stone-500">
          · updated <span className="tabular-nums text-stone-700">{fmtAge(ageSec)}</span>
        </span>
      )}
      {!compact && !hasValidTs && (
        <span className="text-stone-500 tabular-nums">…</span>
      )}
    </span>
  )
}
