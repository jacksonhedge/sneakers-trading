'use client'

import { Reorder } from 'motion/react'
import type { LeaderEntry } from './leaderboard-table'

// Horizontal lane race view.
//
// Each user gets a full-width lane. A "horse pill" sits inside the lane,
// translated horizontally to `score / maxScore` of the way across.
// Lanes themselves swap (FLIP) when ranks flip — same Reorder.Group
// trick as the table view, just with a different row body.
//
// Two motions stacked:
//   1. Lane order swaps when ranks change (FLIP via motion's `layout`)
//   2. Horse pill slides along the lane when the score changes (CSS
//      transition on `left`)
//
// Combined feel = a horse race: pills cross paths horizontally, then
// when one passes another, their lanes swap.

interface Props {
  entries: LeaderEntry[]
  /** How many lanes to render. Default 10 (top of leaderboard). */
  topN?: number
  /** Format the score for display. Default: dollar shorthand. */
  formatScore?: (score: number) => string
}

const COLOR_PILL: Record<string, string> = {
  emerald: 'bg-emerald-500 ring-emerald-700',
  rose: 'bg-rose-500 ring-rose-700',
  amber: 'bg-amber-500 ring-amber-700',
  sky: 'bg-sky-500 ring-sky-700',
  violet: 'bg-violet-500 ring-violet-700',
  cyan: 'bg-cyan-500 ring-cyan-700',
  fuchsia: 'bg-fuchsia-500 ring-fuchsia-700',
  lime: 'bg-lime-500 ring-lime-700',
  orange: 'bg-orange-500 ring-orange-700',
  teal: 'bg-teal-500 ring-teal-700',
}

function defaultFmt(score: number): string {
  if (score >= 1000) return `$${(score / 1000).toFixed(1)}k`
  return `$${score.toFixed(0)}`
}

export function LeaderboardRace({
  entries,
  topN = 10,
  formatScore = defaultFmt,
}: Props) {
  if (entries.length === 0) return null
  const visible = entries.slice(0, topN)

  // Normalize to score / maxScore so the leader's pill sits at ~95% of
  // the way across (small inset so the pill doesn't get clipped). Scale
  // is updated each render — the leader stays anchored near the right,
  // everyone else slides as their gap to the leader narrows or widens.
  const maxScore = Math.max(...visible.map((e) => e.score), 1)

  return (
    <Reorder.Group
      axis="y"
      values={visible}
      onReorder={() => {
        /* noop — sorting is owned by the parent */
      }}
      className="space-y-1"
    >
      {visible.map((entry, idx) => {
        const rank = idx + 1
        return (
          <Reorder.Item
            key={entry.id}
            value={entry}
            drag={false}
            layout="position"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <Lane
              entry={entry}
              rank={rank}
              maxScore={maxScore}
              formatScore={formatScore}
            />
          </Reorder.Item>
        )
      })}
    </Reorder.Group>
  )
}

function Lane({
  entry,
  rank,
  maxScore,
  formatScore,
}: {
  entry: LeaderEntry
  rank: number
  maxScore: number
  formatScore: (n: number) => string
}) {
  // Horse pill horizontal position — inset 8% on the left (start gate)
  // and 6% on the right (finish line) so endpoints don't hug the edges.
  const fraction = Math.max(0, Math.min(1, entry.score / maxScore))
  const leftPct = 8 + fraction * 86
  const isThrone = rank === 1
  const pillColor = COLOR_PILL[entry.color] ?? COLOR_PILL.emerald

  return (
    <div
      className={`relative h-10 rounded-lg ring-1 overflow-hidden ${
        entry.isMe
          ? 'bg-emerald-50/40 ring-emerald-300'
          : isThrone
            ? 'bg-gradient-to-r from-amber-50 to-white ring-amber-300'
            : 'bg-stone-50 ring-stone-200'
      }`}
    >
      {/* Lane track — subtle gradient from start to finish */}
      <div
        className="absolute inset-y-0 pointer-events-none"
        style={{
          left: '7%',
          right: '5%',
          background:
            'linear-gradient(90deg, transparent 0%, rgba(168,162,158,0.18) 30%, rgba(168,162,158,0.18) 70%, transparent 100%)',
        }}
        aria-hidden
      />

      {/* Start gate marker */}
      <div
        className="absolute top-1 bottom-1 w-px bg-stone-300 opacity-60"
        style={{ left: '7%' }}
        aria-hidden
      />
      {/* Finish line — dashed */}
      <div
        className="absolute top-1 bottom-1 w-px"
        style={{
          right: '5%',
          background:
            'repeating-linear-gradient(0deg, rgba(0,112,60,0.6) 0 4px, transparent 4px 8px)',
        }}
        aria-hidden
      />

      {/* Rank tag — fixed at far left */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-baseline gap-0.5 z-10">
        {isThrone && <span className="text-amber-600" aria-hidden>👑</span>}
        <span
          className={`font-mono tabular-nums text-[11px] font-bold ${
            isThrone ? 'text-amber-700' : 'text-stone-600'
          }`}
        >
          #{rank}
        </span>
      </div>

      {/* Horse pill — slides along the lane via `left` transition */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20"
        style={{
          left: `${leftPct}%`,
          transition: 'left 800ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full ${pillColor} text-white ring-2 shadow-md whitespace-nowrap`}
        >
          <span className="w-6 h-6 rounded-full bg-white/95 inline-flex items-center justify-center text-base shadow-inner">
            <span aria-hidden>{entry.emoji}</span>
          </span>
          <span className="text-[11px] font-semibold tracking-tight">
            {entry.name}
            {entry.isMe && (
              <span className="ml-1 text-[8px] font-bold tracking-wider opacity-80">
                YOU
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Score — pinned at right edge, just inside the finish line */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 font-mono tabular-nums text-[11px] font-bold text-stone-700">
        {formatScore(entry.score)}
      </div>
    </div>
  )
}
