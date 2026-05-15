'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { RobinhoodChartV2, type ChartPoint } from '@/components/robinhood-chart-v2'
import { LeaderboardTable, type LeaderEntry } from '@/components/leaderboard-table'
import { FloatingReactions, type Reaction } from '@/components/floating-reactions'

// Read-only spectator race. Same layout as /horse-race-demo but with
// every interactive element stripped out — no buy/sell, no auto-trade,
// no personal score bar. Adds: spectator count, share-a-link, JOIN
// CTA when registration open.
//
// The simulator is the same shape as the participant demo, seeded by
// the tournament id so two viewers in different sessions see correlated
// (but not perfectly synced — that's a future on-chain concern) data.

const TICK_MS = 1500
const RESOLUTION_SEC = 300
const PROB_VOL = 350
const BTC_START = 80_000
const BTC_STEP_USD = 65

interface StrikeDef {
  id: string
  label: string
  emoji: string
  level: number
}

const STRIKE_DEFS: StrikeDef[] = [
  { id: 's1', label: 'BTC > $79.5k', emoji: '🐎', level: 79_500 },
  { id: 's2', label: 'BTC > $80.0k', emoji: '🐆', level: 80_000 },
  { id: 's3', label: 'BTC > $80.5k', emoji: '🐅', level: 80_500 },
  { id: 's4', label: 'BTC > $81.0k', emoji: '🦄', level: 81_000 },
]

interface Strike {
  id: string
  label: string
  emoji: string
  yesProb: number
}

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
  }))
}

// Deterministic-ish 32-bit hash for the id → spectator-count seed.
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h
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
  'emerald_kestrel_3072',
]
const PLAYER_EMOJIS = ['🦊', '🦅', '🐺', '🐲', '🐯', '🦌', '🦬', '🦁', '🐆', '🐻']
const PLAYER_COLORS = ['cyan', 'amber', 'rose', 'lime', 'violet', 'teal', 'sky', 'fuchsia', 'orange', 'emerald']

interface SimPlayer extends LeaderEntry {
  vol: number
}
function makeSimPlayers(): SimPlayer[] {
  return PLAYER_NAMES.map((name, i) => ({
    id: `p${i}`,
    name,
    emoji: PLAYER_EMOJIS[i % PLAYER_EMOJIS.length],
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    score: 18 + (Math.random() - 0.5) * 4,
    prevRank: i + 1,
    changedAt: 0,
    streak: 0,
    vol: 0.4 + Math.random() * 1.2,
  }))
}

export function SpectatorRace({ tournamentId }: { tournamentId: string }) {
  const [btcPrice, setBtcPrice] = useState<number>(BTC_START)
  const [btcHistory, setBtcHistory] = useState<ChartPoint[]>(() => [
    { ts: Date.now(), value: BTC_START },
  ])
  const [strikes, setStrikes] = useState<Strike[]>(() => emptyStrikes(BTC_START))
  const [secLeft, setSecLeft] = useState<number>(RESOLUTION_SEC)
  const [resolved, setResolved] = useState<boolean>(false)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [players, setPlayers] = useState<SimPlayer[]>(() => makeSimPlayers())
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [shareToast, setShareToast] = useState<string | null>(null)
  const optsRef = useRef({ resolved })
  optsRef.current = { resolved }
  const reactionIdRef = useRef(0)
  const nextId = () => `r-${++reactionIdRef.current}`

  // Spectator count — deterministic from id so viewers see the same
  // number, with a small live wobble so it feels alive.
  const baseSpec = 8 + (hashStr(tournamentId) % 30) // 8–37
  const [specWobble, setSpecWobble] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setSpecWobble((w) => Math.max(-3, Math.min(3, w + (Math.random() < 0.5 ? -1 : 1))))
    }, 4000)
    return () => clearInterval(id)
  }, [])
  const spectatorCount = baseSpec + specWobble

  // Tick: walk BTC, derive strike probs, walk other players.
  useEffect(() => {
    const id = setInterval(() => {
      if (optsRef.current.resolved) return
      const now = Date.now()
      setBtcPrice((prev) => {
        const next = clampPrice(prev + (Math.random() - 0.5) * 2 * BTC_STEP_USD)
        setBtcHistory((h) => [...h.slice(-200), { ts: now, value: next }])
        setStrikes((ss) =>
          ss.map((s) => {
            const def = STRIKE_DEFS.find((d) => d.id === s.id)!
            return { ...s, yesProb: probForStrike(next, def.level) }
          }),
        )
        return next
      })
      setPlayers((prev) =>
        prev.map((p) => ({ ...p, score: Math.max(0, p.score + (Math.random() - 0.42) * p.vol) })),
      )
      setSecLeft((s) => Math.max(0, s - TICK_MS / 1000))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Resolve when timer hits zero.
  useEffect(() => {
    if (resolved || secLeft > 0) return
    setResolved(true)
    const winner = strikes.reduce((best, s) => (s.yesProb > best.yesProb ? s : best), strikes[0])
    setWinnerId(winner.id)
    setStrikes((prev) =>
      prev.map((s) => ({ ...s, yesProb: s.id === winner.id ? 1 : 0 })),
    )
  }, [secLeft, resolved, strikes])

  // Periodic rival "buy" bursts so the chart pane feels alive.
  useEffect(() => {
    let cancelled = false
    function schedule() {
      if (cancelled) return
      const delay = 800 + Math.random() * 1200
      setTimeout(() => {
        if (cancelled) return
        if (!optsRef.current.resolved) {
          const player = players[Math.floor(Math.random() * players.length)]
          if (player) {
            setReactions((prev) => [
              ...prev,
              {
                id: nextId(),
                emoji: player.emoji,
                xPct: 8 + Math.random() * 70,
                yPct: 4 + Math.random() * 8,
              },
            ])
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

  function expireReaction(id: string) {
    setReactions((prev) => prev.filter((r) => r.id !== id))
  }

  const leaderboardEntries = useMemo(() => {
    return [...players].sort((a, b) => b.score - a.score)
  }, [players])

  function share() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setShareToast('Link copied — share to bring people in')
          setTimeout(() => setShareToast(null), 3000)
        })
        .catch(() => {
          setShareToast('Could not copy — long-press the URL')
          setTimeout(() => setShareToast(null), 3000)
        })
    }
  }

  const minutes = Math.floor(secLeft / 60)
  const seconds = Math.floor(secLeft - minutes * 60)
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`
  const urgent = secLeft > 0 && secLeft <= 15

  // Lifecycle for the read-only badge: pre-start (which we don't simulate
  // here — round just runs from t=0), live, or final.
  const status: 'live' | 'final' = resolved ? 'final' : 'live'

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 px-4 py-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header — share / watching / countdown / status */}
        <header className="flex items-center gap-3 flex-wrap">
          <Link
            href="/dashboard/horse-race"
            className="text-[11px] tracking-wider font-bold text-stone-700 hover:text-stone-900 transition"
          >
            ← LOBBY
          </Link>

          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider shadow-sm ${
              status === 'live'
                ? 'bg-rose-600 text-white'
                : 'bg-stone-700 text-white'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                status === 'live' ? 'bg-white animate-pulse' : 'bg-stone-400'
              }`}
            />
            {status === 'live' ? 'LIVE' : 'FINAL'}
          </div>

          <h1 className="text-xl font-bold tracking-tight">
            BTC Sprint <span className="text-stone-700 font-mono text-base">· {tournamentId.slice(0, 8)}</span>
          </h1>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white ring-1 ring-stone-200 text-[11px] font-bold text-stone-800">
              <span className="text-base leading-none" aria-hidden>👁</span>
              <span className="font-mono tabular-nums">{spectatorCount}</span>
              <span className="text-stone-700 font-medium">watching</span>
            </div>
            <button
              type="button"
              onClick={share}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-900 text-white text-[11px] font-bold tracking-wider hover:bg-stone-800 transition"
            >
              <span aria-hidden>↗</span>
              SHARE
            </button>
            <Link
              href="/horse-race-demo"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white text-[11px] font-bold tracking-wider shadow-sm hover:from-fuchsia-600 hover:to-rose-600 transition"
            >
              JOIN ROUND $5 →
            </Link>
            <div
              className={`text-base font-mono tabular-nums font-bold ${
                urgent ? 'text-rose-600 animate-pulse' : 'text-stone-900'
              }`}
            >
              {resolved ? 'FINAL' : `T-${timeLabel}`}
            </div>
          </div>
        </header>

        {/* Resolved banner — bumped to a hero-style payoff moment so the
            resolution doesn't fly by. Persists until the user navigates. */}
        {resolved && winnerId && (
          <div
            className="rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 text-white p-5 shadow-lg ring-2 ring-emerald-400 flex items-center gap-4 flex-wrap"
            style={{ animation: 'spec-finale-in 320ms cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <style>{`@keyframes spec-finale-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <span className="text-3xl" aria-hidden>🏁</span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold tracking-[0.2em] text-emerald-100 uppercase">
                Final
              </div>
              <div className="font-extrabold text-lg leading-tight tracking-tight">
                Winning strike: {STRIKE_DEFS.find((s) => s.id === winnerId)?.label}
              </div>
              <div className="text-[12px] text-emerald-50 mt-0.5">
                Top finishers split the prize pool. Want in on the next round?
              </div>
            </div>
            <Link
              href="/dashboard/horse-race"
              className="bg-white text-emerald-700 hover:bg-emerald-50 font-bold tracking-wider text-xs px-4 py-2 rounded-full shadow-sm shrink-0"
            >
              NEXT ROUND →
            </Link>
          </div>
        )}

        {/* Two-pane body — same shape as the participant demo, minus trade UI */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
          {/* Left column — strike race lanes (read-only) + leaderboard */}
          <div className="space-y-4 min-w-0">
            <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-3 shadow-sm space-y-2">
              <div className="text-[10px] font-bold tracking-wider text-stone-700 uppercase px-1">
                Strikes · live
              </div>
              <div className="space-y-2">
                {[...strikes]
                  .sort((a, b) => b.yesProb - a.yesProb)
                  .map((s, idx) => (
                    <SpectatorLane key={s.id} strike={s} rank={idx + 1} />
                  ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white ring-1 ring-stone-200 overflow-hidden">
              <header className="px-4 py-2.5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider text-stone-700">
                    LEADERBOARD
                  </span>
                  <span className="text-[10px] text-stone-700 font-mono">
                    {leaderboardEntries.length} players
                  </span>
                </div>
                <span className="text-[10px] tracking-wider font-bold text-stone-700">
                  RANKED BY EQUITY
                </span>
              </header>
              <div className="p-3">
                <LeaderboardTable
                  entries={leaderboardEntries.slice(0, 10)}
                  formatScore={(score) => `$${score.toFixed(2)}`}
                />
              </div>
            </div>
          </div>

          {/* Right column — BTC chart with horse cursor + reaction overlay */}
          <div className="relative rounded-2xl bg-white ring-1 ring-stone-200 p-4 shadow-sm min-h-[480px] flex flex-col">
            <FloatingReactions reactions={reactions} onExpire={expireReaction} />
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <div className="text-[10px] font-bold tracking-wider text-stone-700 uppercase">
                  BTC · USD
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums text-stone-900">
                  ${btcPrice.toFixed(0)}
                </div>
              </div>
              <div className="text-[10px] text-stone-700 font-mono">
                {btcHistory.length} pts
              </div>
            </div>
            <div className="flex-1">
              <RobinhoodChartV2
                points={btcHistory}
                height={420}
                hideRangePicker
                showReferenceLine
                pulseEndpoint
                endpointEmoji="🏇"
                formatValue={(v) => `$${v.toFixed(0)}`}
                formatTs={(ms) => {
                  const d = new Date(ms)
                  return `${d.getMinutes()}:${d.getSeconds().toString().padStart(2, '0')}`
                }}
              />
            </div>
            <div className="text-[10px] text-stone-700 font-mono mt-2">
              Watch only — bet-behind a player coming in Phase 2
            </div>
          </div>
        </div>

        <footer className="border-t border-stone-200 pt-3 text-[11px] text-stone-700">
          You&apos;re watching tournament <span className="font-mono">{tournamentId}</span>.
          Read-only mode — no buy / sell. Joining the next round buys you in
          via Sneakers&apos; tournament escrow (smart contract on Base, coming soon).
        </footer>

        {/* Share toast */}
        {shareToast && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-full bg-stone-900 text-white text-sm font-bold shadow-lg z-50"
            role="status"
            aria-live="polite"
            style={{ animation: 'fadeIn 200ms ease-out' }}
          >
            {shareToast}
          </div>
        )}
      </div>
    </main>
  )
}

// Lightweight read-only lane — same horse pill visual as the
// participant version, but with no trade panel underneath.
function SpectatorLane({ strike, rank }: { strike: Strike; rank: number }) {
  const lanePct = Math.max(2, Math.min(98, strike.yesProb * 100))
  const isLeader = rank === 1
  return (
    <div className="rounded-xl bg-stone-50 ring-1 ring-stone-200 overflow-hidden">
      <div className="relative h-12">
        <div
          className="absolute inset-y-0 pointer-events-none"
          style={{
            left: '8%',
            right: '4%',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(168,162,158,0.18) 30%, rgba(168,162,158,0.18) 70%, transparent 100%)',
          }}
          aria-hidden
        />
        <div
          className="absolute top-1 bottom-1 w-px bg-stone-300 opacity-60"
          style={{ left: '7%' }}
          aria-hidden
        />
        <div
          className="absolute top-1 bottom-1 w-px"
          style={{
            right: '3%',
            background:
              'repeating-linear-gradient(0deg, rgba(0,112,60,0.7) 0 4px, transparent 4px 8px)',
          }}
          aria-hidden
        />
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
          <span className="font-mono tabular-nums text-[11px] font-bold text-stone-700">
            #{rank}
          </span>
          <span className="text-sm font-bold text-stone-900">{strike.label}</span>
          {isLeader && (
            <span className="text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-800">
              LEADER
            </span>
          )}
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20"
          style={{
            left: `calc(8% + ${(lanePct / 100) * 88}%)`,
            transition: 'left 800ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-500 to-rose-500 text-white inline-flex items-center justify-center text-xl shadow-md ring-2 ring-white">
            <span aria-hidden>{strike.emoji}</span>
          </div>
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 font-mono tabular-nums text-[12px] font-bold text-stone-800">
          {Math.round(strike.yesProb * 100)}%
        </div>
      </div>
    </div>
  )
}
