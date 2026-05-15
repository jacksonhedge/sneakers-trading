'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { TournamentRace, type Strike, type Side } from '@/components/tournament-race'
import { RobinhoodChartV2, type ChartPoint } from '@/components/robinhood-chart-v2'
import { LeaderboardTable, type LeaderEntry } from '@/components/leaderboard-table'
import { FloatingReactions, type Reaction, REACTION_TTL_MS } from '@/components/floating-reactions'

// Live tournament demo — two-pane layout.
//
// Left column (1/3 width):
//   Top      — strike trade panels (TournamentRace)
//   Bottom   — tournament leaderboard, expandable
// Right column (2/3 width):
//   Full-height BTC line chart with a 🏇 emoji riding the endpoint
//
// Single underlying simulator: BTC price walks; strike YES probabilities
// are derived from current BTC vs. strike level via a soft sigmoid.
// Other simulated players' equities walk independently to populate the
// leaderboard with believable rank churn.

const BUY_AMOUNT_USD = 5
const STARTING_CASH = 18
const TICK_MS = 1500
const RESOLUTION_SEC = 300 // real 5-minute round
const PROB_VOL = 350 // sigmoid temperature; bigger = smoother prob curves
const BTC_START = 80_000
const BTC_STEP_USD = 65 // per-tick stddev
const TAIL_WINDOW_SEC = 60 // "TAIL" view shows the last 60s of data

interface StrikeDef {
  id: string
  label: string
  emoji: string
  level: number // BTC strike threshold
}

const STRIKE_DEFS: StrikeDef[] = [
  { id: 's1', label: 'BTC > $79.5k', emoji: '🐎', level: 79_500 },
  { id: 's2', label: 'BTC > $80.0k', emoji: '🐆', level: 80_000 },
  { id: 's3', label: 'BTC > $80.5k', emoji: '🐅', level: 80_500 },
  { id: 's4', label: 'BTC > $81.0k', emoji: '🦄', level: 81_000 },
]

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

function probForStrike(btcPrice: number, level: number): number {
  return sigmoid((btcPrice - level) / PROB_VOL)
}

function clampPrice(p: number): number {
  return Math.max(75_000, Math.min(85_000, p))
}

function emptyStrikes(btc: number): Strike[] {
  return STRIKE_DEFS.map((d) => ({
    id: d.id,
    label: d.label,
    emoji: d.emoji,
    yesProb: probForStrike(btc, d.level),
    yesPosition: 0,
    yesAvgPrice: 0,
    noPosition: 0,
    noAvgPrice: 0,
  }))
}

// ── Simulated other players ──────────────────────────────────────────
//
// 9 fake users with random-walking equities so the leaderboard has
// movement. Each "tick" they get a delta that's biased to their
// personal style: some are aggressive (high vol), some passive.

interface SimPlayer extends LeaderEntry {
  vol: number // equity change stddev per tick
}

const PLAYER_NAMES = [
  'cyan_otter_4291',
  'amber_falcon_812',
  'rose_lynx_2204',
  'lime_orca_991',
  'violet_puma_645',
  'teal_heron_3308',
  'sky_ibex_770',
  'fuchsia_mantis_5512',
  'orange_badger_1148',
]
const PLAYER_EMOJIS = ['🦊', '🦅', '🐺', '🐲', '🐯', '🦌', '🦬', '🦁', '🐆']
const PLAYER_COLORS = ['cyan', 'amber', 'rose', 'lime', 'violet', 'teal', 'sky', 'fuchsia', 'orange'] as const

// O'Toole's autobot decision policy. Pure function — given current
// strikes + cash + remaining seconds, returns one trade decision (or
// null = hold). Designed to be testable in isolation; the demo page's
// useEffect just wires this into the 4s tick.
//
// Priorities (in order):
//   1. TAKE PROFIT — sell any position up >30% on cost basis
//   2. CUT LOSS — sell any position down >25% if >50% of round elapsed
//   3. OPEN — pick the closest-to-50% strike, buy the cheaper side
function decideBotMove(
  strikes: Strike[],
  cash: number,
  secLeft: number,
):
  | { action: 'buy' | 'sell'; strikeId: string; side: Side; reason: string }
  | null {
  const ROUND_TOTAL_SEC = 300
  const elapsedFrac = (ROUND_TOTAL_SEC - secLeft) / ROUND_TOTAL_SEC

  // 1. Take profit
  for (const s of strikes) {
    if (s.yesPosition > 0 && s.yesAvgPrice > 0) {
      const value = s.yesPosition * s.yesProb
      const cost = s.yesPosition * s.yesAvgPrice
      const ret = (value - cost) / cost
      if (ret >= 0.3) {
        return {
          action: 'sell',
          strikeId: s.id,
          side: 'yes',
          reason: `+${(ret * 100).toFixed(0)}% on entry, locking in`,
        }
      }
    }
    if (s.noPosition > 0 && s.noAvgPrice > 0) {
      const value = s.noPosition * (1 - s.yesProb)
      const cost = s.noPosition * s.noAvgPrice
      const ret = (value - cost) / cost
      if (ret >= 0.3) {
        return {
          action: 'sell',
          strikeId: s.id,
          side: 'no',
          reason: `+${(ret * 100).toFixed(0)}% on entry, locking in`,
        }
      }
    }
  }

  // 2. Cut loss (only after halfway through the round)
  if (elapsedFrac > 0.5) {
    for (const s of strikes) {
      if (s.yesPosition > 0 && s.yesAvgPrice > 0) {
        const value = s.yesPosition * s.yesProb
        const cost = s.yesPosition * s.yesAvgPrice
        const ret = (value - cost) / cost
        if (ret <= -0.25) {
          return {
            action: 'sell',
            strikeId: s.id,
            side: 'yes',
            reason: `${(ret * 100).toFixed(0)}% drawdown, freeing cash`,
          }
        }
      }
      if (s.noPosition > 0 && s.noAvgPrice > 0) {
        const value = s.noPosition * (1 - s.yesProb)
        const cost = s.noPosition * s.noAvgPrice
        const ret = (value - cost) / cost
        if (ret <= -0.25) {
          return {
            action: 'sell',
            strikeId: s.id,
            side: 'no',
            reason: `${(ret * 100).toFixed(0)}% drawdown, freeing cash`,
          }
        }
      }
    }
  }

  // 3. Open — only if we have cash and there's still time on the clock
  if (cash >= 1 && secLeft > 30) {
    const candidates = strikes.filter((s) => s.yesProb > 0.2 && s.yesProb < 0.8)
    if (candidates.length === 0) return null
    const pick = candidates.reduce(
      (best, s) =>
        Math.abs(s.yesProb - 0.5) < Math.abs(best.yesProb - 0.5) ? s : best,
      candidates[0],
    )
    const side: Side = pick.yesProb < 0.5 ? 'yes' : 'no'
    const price = side === 'yes' ? pick.yesProb : 1 - pick.yesProb
    return {
      action: 'buy',
      strikeId: pick.id,
      side,
      reason: `mid-prob ${side.toUpperCase()} @ ${Math.round(price * 100)}¢`,
    }
  }

  return null
}

function makeSimPlayers(): SimPlayer[] {
  return PLAYER_NAMES.map((name, i) => ({
    id: `p${i}`,
    name,
    emoji: PLAYER_EMOJIS[i % PLAYER_EMOJIS.length],
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    score: STARTING_CASH + (Math.random() - 0.5) * 4,
    prevRank: i + 1,
    changedAt: 0,
    streak: 0,
    vol: 0.4 + Math.random() * 1.2,
  }))
}

export default function HorseRaceDemoPage() {
  const [btcPrice, setBtcPrice] = useState<number>(BTC_START)
  const [btcHistory, setBtcHistory] = useState<ChartPoint[]>(() => [
    { ts: Date.now(), value: BTC_START },
  ])
  const [strikes, setStrikes] = useState<Strike[]>(() => emptyStrikes(BTC_START))
  const [cash, setCash] = useState<number>(STARTING_CASH)
  const [secLeft, setSecLeft] = useState<number>(RESOLUTION_SEC)
  const [paused, setPaused] = useState<boolean>(false)
  const [resolved, setResolved] = useState<boolean>(false)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [players, setPlayers] = useState<SimPlayer[]>(() => makeSimPlayers())
  const [leaderboardExpanded, setLeaderboardExpanded] = useState<boolean>(false)
  const [chartMode, setChartMode] = useState<'full' | 'tail'>('full')
  const [reactions, setReactions] = useState<Reaction[]>([])

  // Tournament mode — from ?mode=autobot|manual on the URL, default
  // manual. Persistent in this session via the toggle pill below; URL
  // mode is the source of truth on first load.
  const searchParams = useSearchParams()
  const initialMode: 'manual' | 'autobot' =
    searchParams?.get('mode') === 'autobot' ? 'autobot' : 'manual'
  const [tournamentMode, setTournamentMode] =
    useState<'manual' | 'autobot'>(initialMode)
  const isAutobot = tournamentMode === 'autobot'

  // Auto-trade is ALWAYS on in autobot tournaments and ALWAYS off in
  // manual ones. The toggle from before is gone; mode now drives it.
  const autoTrade = isAutobot

  // Strategy log — recent O'Toole decisions in autobot mode, with reasoning.
  // Each entry is auto-pruned after the log grows past 8 items.
  const [strategyLog, setStrategyLog] =
    useState<Array<{ id: string; ts: number; line: string; tone: 'buy' | 'sell' | 'hold' }>>([])

  const optsRef = useRef({ paused, resolved, autoTrade })
  optsRef.current = { paused, resolved, autoTrade }
  const reactionIdRef = useRef(0)
  const nextId = () => `r-${++reactionIdRef.current}`

  function pushReaction(r: Omit<Reaction, 'id'>) {
    setReactions((prev) => [...prev, { id: nextId(), ...r }])
  }
  function expireReaction(id: string) {
    setReactions((prev) => prev.filter((r) => r.id !== id))
  }

  // The user's own equity (cash + position values). Computed live so it
  // can drive the user's row in the leaderboard.
  const userEquity = useMemo(() => {
    let eq = cash
    for (const s of strikes) {
      eq += s.yesPosition * s.yesProb + s.noPosition * (1 - s.yesProb)
    }
    return eq
  }, [cash, strikes])

  // Tick: walk BTC, derive new strike probs, walk other players, decrement timer.
  useEffect(() => {
    const id = setInterval(() => {
      if (optsRef.current.paused || optsRef.current.resolved) return
      const now = Date.now()
      setBtcPrice((prev) => {
        const next = clampPrice(prev + (Math.random() - 0.5) * 2 * BTC_STEP_USD)
        setBtcHistory((h) => [...h.slice(-200), { ts: now, value: next }])
        setStrikes((ss) => ss.map((s) => {
          const def = STRIKE_DEFS.find((d) => d.id === s.id)!
          return { ...s, yesProb: probForStrike(next, def.level) }
        }))
        return next
      })
      setPlayers((prev) => {
        const updated = prev.map((p) => {
          const delta = (Math.random() - 0.42) * p.vol // slight upward bias
          return { ...p, score: Math.max(0, p.score + delta) }
        })
        return updated
      })
      setSecLeft((s) => Math.max(0, s - TICK_MS / 1000))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Simulated rival "buy" bursts — every 800–1800ms a random rival pops
  // their emoji somewhere in the chart pane to feel like a live room.
  useEffect(() => {
    let cancelled = false
    function schedule() {
      if (cancelled) return
      const delay = 800 + Math.random() * 1000
      setTimeout(() => {
        if (cancelled) return
        if (!optsRef.current.paused && !optsRef.current.resolved) {
          const player = players[Math.floor(Math.random() * players.length)]
          if (player) {
            pushReaction({
              emoji: player.emoji,
              xPct: 8 + Math.random() * 70,
              yPct: 4 + Math.random() * 8,
            })
          }
        }
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      cancelled = true
    }
  }, [players])

  // O'Toole's autobot strategy. Runs every 4s in autobot tournaments.
  // Three priorities, in order:
  //   1. Take profit — sell any position up >30% on cost basis
  //   2. Cut loss — sell positions down >25% if more than half the
  //      round has elapsed (preserve cash for redeploy)
  //   3. Open new position — pick the closest-to-50% strike and buy
  //      the cheaper side. Mid-prob strikes have the best risk/reward.
  // Each decision is logged with reasoning for the strategy panel.
  useEffect(() => {
    if (!autoTrade) return
    const id = setInterval(() => {
      if (optsRef.current.paused || optsRef.current.resolved) return
      const decision = decideBotMove(strikes, cash, secLeft)
      if (!decision) {
        appendLog('hold', 'no edge — sitting tight')
        return
      }
      const strikeLabel = strikes.find((s) => s.id === decision.strikeId)?.label ?? '?'
      if (decision.action === 'buy') {
        buy(decision.strikeId, decision.side, { isBot: true })
        appendLog('buy', `BUY ${decision.side.toUpperCase()} on ${strikeLabel} · ${decision.reason}`)
      } else {
        sell(decision.strikeId, decision.side)
        appendLog('sell', `SELL ${decision.side.toUpperCase()} on ${strikeLabel} · ${decision.reason}`)
      }
    }, 4000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrade, strikes.length, secLeft])

  function appendLog(tone: 'buy' | 'sell' | 'hold', line: string) {
    const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setStrategyLog((prev) => [{ id, ts: Date.now(), line, tone }, ...prev].slice(0, 8))
  }

  // Resolve when timer hits zero — winner is highest yesProb at that moment.
  useEffect(() => {
    if (resolved || secLeft > 0) return
    setResolved(true)
    const winner = strikes.reduce(
      (best, s) => (s.yesProb > best.yesProb ? s : best),
      strikes[0],
    )
    setWinnerId(winner.id)
    setCash((prev) => {
      let payout = prev
      for (const s of strikes) {
        if (s.id === winner.id) {
          payout += s.yesPosition * 1.0
        } else {
          payout += s.noPosition * 1.0
        }
      }
      return payout
    })
    setStrikes((prev) =>
      prev.map((s) => ({
        ...s,
        yesProb: s.id === winner.id ? 1 : 0,
        yesPosition: 0,
        yesAvgPrice: 0,
        noPosition: 0,
        noAvgPrice: 0,
      })),
    )
  }, [secLeft, resolved, strikes])

  // Compose the leaderboard: simulated players + the user. Sort by score,
  // recompute prevRank for the change badge.
  const leaderboardEntries: LeaderEntry[] = useMemo(() => {
    const all: LeaderEntry[] = [
      ...players.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        color: p.color,
        score: p.score,
        prevRank: p.prevRank,
        changedAt: p.changedAt,
        streak: p.streak,
      })),
      {
        id: 'me',
        name: 'you',
        emoji: '🏇',
        color: 'emerald',
        score: userEquity,
        prevRank: 99,
        changedAt: 0,
        streak: 0,
        isMe: true,
      },
    ]
    return all.sort((a, b) => b.score - a.score)
  }, [players, userEquity])

  function buy(id: string, side: Side, opts?: { isBot?: boolean }) {
    if (resolved) return
    const target = strikes.find((s) => s.id === id)
    if (!target) return
    const price = side === 'yes' ? target.yesProb : 1 - target.yesProb
    if (price <= 0.01) return
    const spend = Math.min(BUY_AMOUNT_USD, cash)
    if (spend < 0.5) return
    const newShares = spend / price
    setStrikes((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        if (side === 'yes') {
          const newPos = s.yesPosition + newShares
          const newAvg = (s.yesPosition * s.yesAvgPrice + spend) / Math.max(0.0001, newPos)
          return { ...s, yesPosition: newPos, yesAvgPrice: newAvg }
        } else {
          const newPos = s.noPosition + newShares
          const newAvg = (s.noPosition * s.noAvgPrice + spend) / Math.max(0.0001, newPos)
          return { ...s, noPosition: newPos, noAvgPrice: newAvg }
        }
      }),
    )
    setCash((c) => Math.max(0, c - spend))
    // Pop the user's reaction. Origin near the right side (where the
    // BUY buttons would be) — gives a sense of "popping out of the box".
    pushReaction({
      emoji: '🏇',
      xPct: 80 + Math.random() * 12,
      yPct: 6,
      tag: opts?.isBot ? '🤖' : undefined,
    })
  }

  function sell(id: string, side: Side) {
    if (resolved) return
    let proceeds = 0
    setStrikes((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        if (side === 'yes' && s.yesPosition > 0) {
          proceeds = s.yesPosition * s.yesProb
          return { ...s, yesPosition: 0, yesAvgPrice: 0 }
        }
        if (side === 'no' && s.noPosition > 0) {
          proceeds = s.noPosition * (1 - s.yesProb)
          return { ...s, noPosition: 0, noAvgPrice: 0 }
        }
        return s
      }),
    )
    if (proceeds > 0) setCash((c) => c + proceeds)
  }

  function reset() {
    const seed = makeSimPlayers()
    setBtcPrice(BTC_START)
    setBtcHistory([{ ts: Date.now(), value: BTC_START }])
    setStrikes(emptyStrikes(BTC_START))
    setCash(STARTING_CASH)
    setSecLeft(RESOLUTION_SEC)
    setResolved(false)
    setWinnerId(null)
    setPlayers(seed)
  }

  const minutes = Math.floor(secLeft / 60)
  const seconds = Math.floor(secLeft - minutes * 60)
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`
  const urgent = secLeft > 0 && secLeft <= 15

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <header className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white text-[10px] font-bold tracking-wider shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            BTC SPRINT · LIVE
          </div>
          <h1 className="text-xl font-bold tracking-tight">5-min Crypto Horse Race</h1>
          <div className="ml-auto flex items-center gap-2">
            <div
              className="inline-flex items-center gap-0.5 rounded-full ring-1 ring-stone-200 bg-stone-50 p-0.5"
              role="group"
              aria-label="Tournament mode"
            >
              {(['manual', 'autobot'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTournamentMode(m)}
                  disabled={resolved}
                  className={`text-[10px] tracking-wider font-bold px-3 py-1 rounded-full transition uppercase disabled:opacity-50 inline-flex items-center gap-1 ${
                    tournamentMode === m
                      ? m === 'autobot'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-stone-900 text-white shadow-sm'
                      : 'text-stone-700 hover:text-stone-900'
                  }`}
                  title={
                    m === 'autobot'
                      ? "O'Toole drives every trade for you"
                      : 'You click every BUY / SELL yourself'
                  }
                >
                  <span aria-hidden>{m === 'autobot' ? '🤖' : '✋'}</span>
                  {m === 'autobot' ? 'AUTOBOT' : 'MANUAL'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              disabled={resolved}
              className={`text-xs px-3 py-1.5 rounded-full font-bold tracking-wider transition disabled:opacity-50 ${
                paused
                  ? 'bg-[#00703c] text-white hover:bg-[#003520]'
                  : 'border border-stone-300 hover:bg-stone-100'
              }`}
            >
              {paused ? 'RESUME' : 'PAUSE'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-xs px-3 py-1.5 rounded-full font-bold tracking-wider transition border border-stone-300 hover:bg-stone-100"
            >
              RESET
            </button>
            <div
              className={`text-base font-mono tabular-nums font-bold tabular-nums ${
                urgent ? 'text-red-600 animate-pulse' : 'text-stone-700'
              }`}
            >
              {resolved ? 'FINAL' : `T-${timeLabel}`}
            </div>
          </div>
        </header>

        {/* Resolved banner */}
        {resolved && winnerId && (
          <div className="rounded-2xl bg-gradient-to-r from-emerald-100 via-emerald-50 to-white ring-1 ring-emerald-300 p-4 text-sm">
            <div className="font-bold text-emerald-900 text-base">
              Round resolved — winner:{' '}
              {STRIKE_DEFS.find((s) => s.id === winnerId)?.label}
            </div>
            <div className="text-stone-700 mt-1">
              Your final cash:{' '}
              <span className="font-mono font-bold">${cash.toFixed(2)}</span> (return{' '}
              <span
                className={
                  cash >= STARTING_CASH
                    ? 'text-emerald-700 font-bold'
                    : 'text-red-700 font-bold'
                }
              >
                {(((cash - STARTING_CASH) / STARTING_CASH) * 100).toFixed(1)}%
              </span>
              )
            </div>
          </div>
        )}

        {/* Two-pane body */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
          {/* Left column — strikes + leaderboard */}
          <div className="space-y-4 min-w-0">
            <TournamentRace
              strikes={strikes}
              cash={cash}
              startingCash={STARTING_CASH}
              buyAmountUsd={BUY_AMOUNT_USD}
              locked={resolved}
              mode={tournamentMode}
              onBuy={buy}
              onSell={sell}
            />

            {/* Strategy log — only in autobot mode. Shows the last 8
                O'Toole decisions with reasoning so the user can see
                what the bot is actually doing on their behalf. */}
            {isAutobot && (
              <div className="rounded-2xl bg-white ring-1 ring-stone-200 overflow-hidden">
                <header className="px-4 py-2.5 border-b border-stone-200 flex items-center justify-between bg-emerald-50/60">
                  <div className="flex items-center gap-2">
                    <span aria-hidden>🤖</span>
                    <span className="text-[10px] font-bold tracking-wider text-emerald-900">
                      O&apos;TOOLE STRATEGY LOG
                    </span>
                  </div>
                  <span className="text-[10px] text-stone-700 font-mono">
                    {strategyLog.length} moves
                  </span>
                </header>
                <div className="p-3 space-y-1.5 max-h-56 overflow-y-auto">
                  {strategyLog.length === 0 ? (
                    <div className="text-[11px] text-stone-700 italic px-1 py-2">
                      Waiting for first decision (every 4s)…
                    </div>
                  ) : (
                    strategyLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-baseline gap-2 text-[11px] leading-snug"
                      >
                        <span
                          className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                            entry.tone === 'buy'
                              ? 'bg-emerald-100 text-emerald-800'
                              : entry.tone === 'sell'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {entry.tone.toUpperCase()}
                        </span>
                        <span className="text-stone-800 font-medium flex-1 min-w-0">
                          {entry.line}
                        </span>
                        <span className="text-[10px] text-stone-500 font-mono shrink-0">
                          {Math.max(0, Math.round((Date.now() - entry.ts) / 1000))}s ago
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Leaderboard — bottom-left section, expandable */}
            <div className="rounded-2xl bg-white ring-1 ring-stone-200 overflow-hidden">
              <header className="px-4 py-2.5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider text-stone-600">
                    LEADERBOARD
                  </span>
                  <span className="text-[10px] text-stone-700 font-mono">
                    {leaderboardEntries.length} players
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLeaderboardExpanded((e) => !e)}
                  className="text-[10px] tracking-wider font-bold text-stone-700 hover:text-stone-900"
                >
                  {leaderboardExpanded ? 'COLLAPSE ▴' : 'EXPAND ▾'}
                </button>
              </header>
              <div className="p-3">
                <LeaderboardTable
                  entries={leaderboardEntries.slice(0, leaderboardExpanded ? 10 : 5)}
                  formatScore={(score) => `$${score.toFixed(2)}`}
                />
              </div>
            </div>
          </div>

          {/* Right column — BTC chart with horse cursor + reaction overlay */}
          <div className="relative rounded-2xl bg-white ring-1 ring-stone-200 p-4 shadow-sm min-h-[480px] flex flex-col">
            <FloatingReactions reactions={reactions} onExpire={expireReaction} />
            <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
              <div>
                <div className="text-[10px] font-bold tracking-wider text-stone-700 uppercase">
                  BTC · USD
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-stone-900">
                  ${btcPrice.toFixed(0)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-0.5 rounded-md ring-1 ring-stone-200 bg-stone-50 p-0.5">
                  {(['full', 'tail'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setChartMode(m)}
                      className={`text-[10px] tracking-wider font-bold px-2.5 py-1 rounded transition uppercase ${
                        chartMode === m
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      {m === 'full' ? 'FULL' : 'TAIL 60s'}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-stone-700 font-mono">
                  {chartMode === 'tail'
                    ? `${Math.min(btcHistory.length, Math.ceil(TAIL_WINDOW_SEC / (TICK_MS / 1000)))} pts`
                    : `${btcHistory.length} pts`}
                </div>
              </div>
            </div>
            <div className="flex-1">
              {(() => {
                const cutoff = Date.now() - TAIL_WINDOW_SEC * 1000
                const visiblePoints =
                  chartMode === 'tail'
                    ? btcHistory.filter((p) => {
                        const t = typeof p.ts === 'number' ? p.ts : new Date(p.ts).getTime()
                        return t >= cutoff
                      })
                    : btcHistory
                const refLines =
                  chartMode === 'tail'
                    ? STRIKE_DEFS.map((d) => ({
                        value: d.level,
                        label: d.label,
                        color: '#00703c',
                      }))
                    : undefined
                return (
                  <RobinhoodChartV2
                    points={visiblePoints.length >= 2 ? visiblePoints : btcHistory}
                    height={420}
                    hideRangePicker
                    showReferenceLine={chartMode === 'full'}
                    pulseEndpoint
                    endpointEmoji="🏇"
                    referenceLines={refLines}
                    formatValue={(v) => `$${v.toFixed(0)}`}
                    formatTs={(ms) => {
                      const d = new Date(ms)
                      return `${d.getMinutes()}:${d
                        .getSeconds()
                        .toString()
                        .padStart(2, '0')}`
                    }}
                  />
                )
              })()}
            </div>
            <div className="text-[10px] text-stone-700 font-mono mt-2">
              {chartMode === 'full'
                ? 'FULL — entire round, dashed line marks the start price'
                : 'TAIL 60s — last minute only, with horizontal strike levels overlaid'}
            </div>
          </div>
        </div>

        <footer className="border-t border-stone-200 pt-3 text-[11px] text-stone-700">
          Right: BTC random-walks ±${BTC_STEP_USD} per tick; the 🏇 icon
          rides the line endpoint. Left top: strike YES probabilities are
          derived live from BTC price via sigmoid (vol={PROB_VOL}). Left
          bottom: 9 simulated rivals + your own equity, sorted by cash;
          ranks reorder via FLIP, score animates with RollingNumber.
        </footer>
      </div>
    </main>
  )
}
