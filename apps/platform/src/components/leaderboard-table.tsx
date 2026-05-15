'use client'

import { Reorder } from 'motion/react'
import { RollingNumber } from './rolling-number'

// FLIP-animated leaderboard table. Pass sorted entries (rank 1 at index 0);
// when the array reorders, motion measures positions before/after and
// animates each row's transform smoothly to its new home. Per-row identity
// MUST come from a stable `id` field — otherwise React reuses DOM nodes
// based on index and the FLIP animation is meaningless.
//
// Visual signatures:
//   - Rank-change badge (▲+N / ▼-N) fades in beside rank for 6s after move
//   - Streak ≥ 3 climbs gets a brand-emerald glow ring
//   - Rank #1 gets a gold-tinted throne treatment + crown
//   - The user marked `isMe = true` gets a persistent highlight
//   - Score uses RollingNumber so digits roll on each update

export interface LeaderEntry {
  id: string
  name: string
  emoji: string
  /** Tailwind colour name fragment — e.g. "emerald", "rose", "amber" */
  color: string
  score: number
  /** Rank as of one tick ago (1-indexed). Used for the change badge. */
  prevRank: number
  /** Time of last rank change (ms). Badge stays visible for 6s after. */
  changedAt: number
  /** Consecutive ticks of climbing. ≥3 lights the streak ring. */
  streak: number
  /** Optional flag for the current user's row. */
  isMe?: boolean
}

interface Props {
  entries: LeaderEntry[]
  /** Format the score number for display. Default: dollar-cents. */
  formatScore?: (score: number) => string
  /** Sub-label rendered under the name (e.g., "5d streak", "last trade 2m ago"). */
  subLabelFor?: (entry: LeaderEntry) => string | null
}

const BADGE_TTL_MS = 6000
const STREAK_THRESHOLD = 3
const NOW_TICK_MS = 500 // live tick for badge fade-out re-renders

function defaultFmt(score: number): string {
  if (score >= 1000) return `$${(score / 1000).toFixed(2)}k`
  return `$${score.toFixed(0)}`
}

const COLOR_BG: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  rose: 'bg-rose-100 text-rose-800 ring-rose-300',
  amber: 'bg-amber-100 text-amber-800 ring-amber-300',
  sky: 'bg-sky-100 text-sky-800 ring-sky-300',
  violet: 'bg-violet-100 text-violet-800 ring-violet-300',
  cyan: 'bg-cyan-100 text-cyan-800 ring-cyan-300',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-300',
  lime: 'bg-lime-100 text-lime-800 ring-lime-300',
  orange: 'bg-orange-100 text-orange-800 ring-orange-300',
  teal: 'bg-teal-100 text-teal-800 ring-teal-300',
}

export function LeaderboardTable({
  entries,
  formatScore = defaultFmt,
  subLabelFor,
}: Props) {
  // We render with Reorder.Group + Reorder.Item so motion's `layout`
  // animation fires when the values prop reorders. drag={false} disables
  // user drag — only data drives reordering.
  return (
    <Reorder.Group
      axis="y"
      values={entries}
      onReorder={() => {
        /* noop — sorting is owned by the parent */
      }}
      className="space-y-1"
    >
      {entries.map((entry, idx) => {
        const rank = idx + 1
        return (
          <Reorder.Item
            key={entry.id}
            value={entry}
            drag={false}
            layout="position"
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
          >
            <Row
              entry={entry}
              rank={rank}
              formatScore={formatScore}
              subLabelFor={subLabelFor}
            />
          </Reorder.Item>
        )
      })}
    </Reorder.Group>
  )
}

function Row({
  entry,
  rank,
  formatScore,
  subLabelFor,
}: {
  entry: LeaderEntry
  rank: number
  formatScore: (n: number) => string
  subLabelFor?: (entry: LeaderEntry) => string | null
}) {
  // Re-render every NOW_TICK_MS so the badge knows to fade out without
  // requiring the parent to push a new tick just for that.
  // (Cheap — only matters when there's at least one active badge.)
  // Implemented by forcing a tick via a state update.
  // We use a parent-supplied changedAt timestamp.
  const now = useNowTick()
  const sinceChange = now - entry.changedAt
  const showBadge = entry.changedAt > 0 && sinceChange < BADGE_TTL_MS
  const fadeAlpha = showBadge
    ? Math.max(0, 1 - (sinceChange - BADGE_TTL_MS * 0.6) / (BADGE_TTL_MS * 0.4))
    : 0

  const delta = entry.prevRank - rank // +N = climbed N
  const isThrone = rank === 1
  const isStreak = entry.streak >= STREAK_THRESHOLD
  const subLabel = subLabelFor ? subLabelFor(entry) : null

  const colorClass = COLOR_BG[entry.color] ?? COLOR_BG.emerald

  return (
    <div
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl ring-1 transition-shadow ${
        entry.isMe
          ? 'bg-emerald-50/60 ring-emerald-300'
          : isThrone
            ? 'bg-gradient-to-r from-amber-50 via-amber-50/60 to-white ring-amber-300'
            : 'bg-white ring-stone-200'
      } ${isStreak ? 'shadow-[0_0_0_2px_rgba(0,112,60,0.18)]' : ''}`}
    >
      {/* Rank cell — fixed width so the column doesn't reflow on rank changes */}
      <div className="w-12 flex items-baseline justify-end gap-1 shrink-0">
        {isThrone && (
          <span className="text-amber-600 text-base leading-none" aria-hidden>
            👑
          </span>
        )}
        <span
          className={`font-mono tabular-nums font-bold ${
            isThrone ? 'text-amber-700 text-base' : 'text-stone-700 text-sm'
          }`}
        >
          #{rank}
        </span>
      </div>

      {/* Rank-change badge — absolute so it doesn't push the layout */}
      {showBadge && delta !== 0 && (
        <span
          className={`absolute left-12 -translate-x-1 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full ring-1 pointer-events-none ${
            delta > 0
              ? 'bg-emerald-100 text-emerald-800 ring-emerald-300'
              : 'bg-red-100 text-red-700 ring-red-300'
          }`}
          style={{ opacity: fadeAlpha }}
        >
          {delta > 0 ? `▲ +${delta}` : `▼ ${delta}`}
        </span>
      )}

      {/* Avatar */}
      <span
        className={`w-8 h-8 rounded-full inline-flex items-center justify-center text-base ring-1 shrink-0 ${colorClass}`}
        aria-hidden
      >
        {entry.emoji}
      </span>

      {/* Name + sub-label */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-stone-900 truncate">
          {entry.name}
          {entry.isMe && (
            <span className="ml-1.5 text-[9px] font-bold tracking-wider text-emerald-700 align-middle">
              YOU
            </span>
          )}
        </div>
        {(subLabel || isStreak) && (
          <div className="text-[10px] text-stone-700 truncate">
            {isStreak && (
              <span className="text-[#00703c] font-semibold mr-1">
                🔥 {entry.streak} streak
              </span>
            )}
            {subLabel}
          </div>
        )}
      </div>

      {/* Score */}
      <div className="font-mono tabular-nums font-bold text-stone-900 shrink-0">
        <RollingNumber value={entry.score} format={formatScore} flashScale={50} />
      </div>
    </div>
  )
}

// Lightweight tick hook so badge opacity can fade without the parent
// pushing fresh state every 500ms. Implementation note: useState +
// setInterval, capped to one render per NOW_TICK_MS.
import { useEffect, useState } from 'react'
function useNowTick(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS)
    return () => clearInterval(id)
  }, [])
  return now
}
