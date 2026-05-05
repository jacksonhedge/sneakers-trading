'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ASSET_COLOR,
  ASSET_EMOJI,
  SIZE_LABEL,
  VENUE_NAME,
  fmtCountdown,
  generateSchedule,
  type Tournament,
} from '@/lib/horse-race-schedule'

// Compact dashboard tile that replaced the cross-book arbitrage panel.
// Shows the next 5 upcoming Crypto Horse Race rounds, ticking once per
// second so countdowns stay live. Tapping a row spectates; "BUY IN →"
// jumps to the lobby for the join flow.

const VISIBLE = 5

export function DashboardTournamentsTile() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const all = now ? generateSchedule(now) : []
  // Filter out resolved/live so the dashboard tile only ever shows
  // joinable or close-to-starting rounds. Cap at VISIBLE so the tile
  // height matches the surrounding column.
  const upcoming = all.filter((t) => t.status !== 'resolved' && t.status !== 'live').slice(0, VISIBLE)

  return (
    <div className="rounded border border-stone-200 bg-white h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] tracking-widest font-bold text-fuchsia-700 bg-gradient-to-r from-fuchsia-100 to-rose-100 px-1.5 py-0.5 rounded"
            aria-hidden
          >
            NEW
          </span>
          <div className="text-sm font-semibold text-stone-900">Tournaments</div>
        </div>
        <Link
          href="/dashboard/horse-race"
          className="text-[10px] tracking-wider text-stone-500 hover:text-stone-900 transition"
        >
          ALL →
        </Link>
      </div>

      <div className="flex-1 px-3 py-2 space-y-1 overflow-y-auto min-h-0">
        {!now ? (
          // Pre-mount skeleton — same height as a real row so the tile
          // doesn't pop on hydration.
          <div className="text-xs text-stone-400 py-6 text-center">Loading schedule…</div>
        ) : upcoming.length === 0 ? (
          <div className="text-xs text-stone-500 py-6 text-center">
            No tournaments scheduled in the next window. Refresh in a minute.
          </div>
        ) : (
          upcoming.map((t) => <TournamentRow key={t.id} t={t} />)
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-stone-200 bg-stone-50 text-[11px] text-stone-600 leading-snug flex items-center justify-between gap-2">
        <span>Crypto Horse Race · 5/15/30-min strike markets</span>
        <Link
          href="/dashboard/horse-race"
          className="text-emerald-700 font-semibold hover:underline whitespace-nowrap"
        >
          OPEN LOBBY →
        </Link>
      </div>
    </div>
  )
}

function TournamentRow({ t }: { t: Tournament }) {
  const startsLabel = t.startsInSec === 0 ? 'NOW' : fmtCountdown(t.startsInSec)
  const urgent = t.startsInSec > 0 && t.startsInSec <= 30
  const fillPct = Math.min(100, (t.registered / t.cap) * 100)
  const isUnderfilled = t.status === 'underfilled'

  return (
    <div className="py-1.5 flex items-center gap-2.5 border-b border-stone-100 last:border-b-0">
      {/* Asset chip — compact version of the lobby's bigger 14×14 logo */}
      <div
        className={`shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br ${ASSET_COLOR[t.asset]} text-white inline-flex items-center justify-center text-sm font-bold ring-1 ring-white shadow-sm`}
        aria-hidden
      >
        {ASSET_EMOJI[t.asset]}
      </div>

      {/* Center column — flavor + venue + fill */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-bold text-stone-900 truncate">{t.flavor}</span>
          <span className="text-[9px] tracking-wider px-1 py-0.5 rounded bg-stone-100 text-stone-700 font-bold">
            {SIZE_LABEL[t.size]}
          </span>
        </div>
        <div className="text-[10px] text-stone-600 truncate flex items-center gap-1.5">
          <span>${t.buyInUsd}</span>
          <span className="text-stone-400">·</span>
          <span>{VENUE_NAME[t.venue]}</span>
          <span className="text-stone-400">·</span>
          <span className="font-mono tabular-nums">
            {t.registered}/{t.cap}
          </span>
        </div>
        <div className="mt-0.5 h-1 bg-stone-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              t.registered >= t.cap
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                : isUnderfilled
                  ? 'bg-gradient-to-r from-amber-300 to-amber-500'
                  : 'bg-gradient-to-r from-stone-400 to-stone-500'
            }`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      {/* Right — countdown + BUY IN */}
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <span
          className={`text-[10px] font-mono tabular-nums font-bold leading-none ${
            urgent ? 'text-rose-600 animate-pulse' : 'text-stone-700'
          }`}
        >
          {startsLabel}
        </span>
        <Link
          href="/dashboard/horse-race"
          className="text-[9px] tracking-wider font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white hover:from-fuchsia-600 hover:to-rose-600 transition shadow-sm hover:shadow-md"
          title={`Buy in to ${t.flavor} on ${VENUE_NAME[t.venue]}`}
        >
          BUY IN →
        </Link>
      </div>
    </div>
  )
}
