'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { LeaderboardTable, type LeaderEntry } from '@/components/leaderboard-table'
import { LeaderboardRace } from '@/components/leaderboard-race'

// Standalone demo of the leaderboard table + race view. No auth, no DB.
// 50 fake users, scores tick on a global timer, ranks recompute, FLIP
// animations fire as positions change.
//
// Controls:
//   - PAUSE / RESUME — stops the score ticker
//   - CALM / NORMAL / FRENZY — tick rate (3000 / 1500 / 600 ms)
//   - TABLE / RACE / SPLIT — which view(s) to show
//
// One designated user (id "you") gets the YOU treatment so the personal-
// row highlight + sticky-you behavior can be evaluated.

const NAMES_PREFIX = [
  'cyan',
  'amber',
  'rose',
  'lime',
  'violet',
  'teal',
  'sky',
  'fuchsia',
  'orange',
  'emerald',
]
const NAMES_NOUN = [
  'otter',
  'falcon',
  'lynx',
  'orca',
  'puma',
  'heron',
  'ibex',
  'mantis',
  'badger',
  'osprey',
  'wolf',
  'fox',
  'mole',
  'kestrel',
  'shrike',
  'tiger',
  'shark',
  'eagle',
  'hawk',
  'raven',
]
const EMOJIS = ['🦊', '🐺', '🦅', '🦉', '🐆', '🐅', '🦌', '🦁', '🐯', '🐻', '🦘', '🐲', '🦏', '🦬']

const COLORS = [
  'emerald',
  'rose',
  'amber',
  'sky',
  'violet',
  'cyan',
  'fuchsia',
  'lime',
  'orange',
  'teal',
] as const

function seedRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function makeInitial(): LeaderEntry[] {
  const rand = seedRandom(20260504)
  const entries: LeaderEntry[] = []
  for (let i = 0; i < 50; i++) {
    const prefix = NAMES_PREFIX[Math.floor(rand() * NAMES_PREFIX.length)]
    const noun = NAMES_NOUN[Math.floor(rand() * NAMES_NOUN.length)]
    const num = Math.floor(rand() * 9999)
    const id = `u-${i}`
    const isMe = i === 12 // arbitrary; gives "you" a mid-pack starting position
    entries.push({
      id,
      name: isMe ? 'you' : `${prefix}_${noun}_${num}`,
      emoji: EMOJIS[Math.floor(rand() * EMOJIS.length)],
      color: COLORS[Math.floor(rand() * COLORS.length)],
      score: 200 + Math.floor(rand() * 1500),
      prevRank: i + 1,
      changedAt: 0,
      streak: 0,
      isMe,
    })
  }
  // Sort once + initialize prevRank correctly.
  entries.sort((a, b) => b.score - a.score)
  return entries.map((e, i) => ({ ...e, prevRank: i + 1 }))
}

function tickScores(prev: LeaderEntry[]): LeaderEntry[] {
  // Each tick, ~30% of users get a delta. Most are small (+/- 30); ~5%
  // chance of a bigger spike (+100 to +200) representing a winning trade.
  const updated = prev.map((e) => {
    if (Math.random() > 0.3) return e
    let delta = (Math.random() - 0.4) * 60 // slight upward bias
    if (Math.random() < 0.05) delta = 100 + Math.random() * 150
    if (Math.random() < 0.03) delta = -(50 + Math.random() * 80) // occasional loss
    const next = Math.max(50, e.score + delta)
    return { ...e, score: next }
  })
  // Sort + recompute rank state.
  updated.sort((a, b) => b.score - a.score)
  const now = Date.now()
  return updated.map((e, idx) => {
    const newRank = idx + 1
    const oldRank = prev.findIndex((p) => p.id === e.id) + 1
    const climbed = oldRank > newRank // smaller rank number = higher
    const stayed = oldRank === newRank
    const changed = oldRank !== newRank
    return {
      ...e,
      prevRank: oldRank,
      changedAt: changed ? now : e.changedAt,
      streak: climbed ? e.streak + 1 : stayed ? e.streak : 0,
    }
  })
}

type ViewMode = 'table' | 'race' | 'split'

export default function LeaderboardDemoPage() {
  const [entries, setEntries] = useState<LeaderEntry[]>(() => makeInitial())
  const [paused, setPaused] = useState(false)
  const [tickMs, setTickMs] = useState<3000 | 1500 | 600>(1500)
  const [view, setView] = useState<ViewMode>('split')
  const optsRef = useRef({ paused, tickMs })
  optsRef.current = { paused, tickMs }

  useEffect(() => {
    const id = setInterval(() => {
      if (optsRef.current.paused) return
      setEntries((prev) => tickScores(prev))
    }, tickMs)
    return () => clearInterval(id)
  }, [tickMs])

  const me = useMemo(() => entries.find((e) => e.isMe), [entries])
  const meRank = me ? entries.indexOf(me) + 1 : null

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LEADERBOARD RACE — PROTOTYPE
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            FLIP-animated rankings + horse-race lanes
          </h1>
          <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
            50 simulated users with random-walk scores. Each tick, ~30% get
            a delta; rank order recomputes; rows animate to their new
            positions via Framer&apos;s layout FLIP. Score uses{' '}
            <code className="bg-stone-100 px-1 rounded">RollingNumber</code>.
            Position changes show a ▲▼ badge that fades over 6s. 3+ climbs
            in a row light a streak ring. <strong>YOU</strong> is row id 12.
          </p>
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className={`text-xs px-3 py-1.5 rounded-full font-bold tracking-wider transition ${
                paused
                  ? 'bg-[#00703c] text-white hover:bg-[#003520]'
                  : 'border border-stone-300 hover:bg-stone-100'
              }`}
            >
              {paused ? 'RESUME' : 'PAUSE'}
            </button>
            <div className="inline-flex items-center gap-0.5 rounded-md ring-1 ring-stone-200 bg-stone-50 p-0.5">
              {([3000, 1500, 600] as const).map((ms) => (
                <button
                  key={ms}
                  type="button"
                  onClick={() => setTickMs(ms)}
                  className={`text-[10px] tracking-wider font-bold px-2.5 py-1 rounded transition ${
                    tickMs === ms
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {ms === 3000 ? 'CALM' : ms === 1500 ? 'NORMAL' : 'FRENZY'}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-0.5 rounded-md ring-1 ring-stone-200 bg-stone-50 p-0.5">
              {(['table', 'race', 'split'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  className={`text-[10px] tracking-wider font-bold px-2.5 py-1 rounded transition uppercase ${
                    view === mode
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-stone-500 font-mono">
              {paused
                ? 'paused'
                : `tick ${tickMs}ms · ${entries.length} users`}
              {me && meRank ? ` · you #${meRank}` : ''}
            </span>
          </div>
        </header>

        {view === 'split' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Standard table (FLIP reorder)">
              <LeaderboardTable entries={entries.slice(0, 20)} />
            </Section>
            <Section title="Race mode (top 10 horse pills)">
              <LeaderboardRace entries={entries} topN={10} />
              <SubNote />
            </Section>
          </div>
        ) : view === 'table' ? (
          <Section title="Standard table (top 25)">
            <LeaderboardTable entries={entries.slice(0, 25)} />
          </Section>
        ) : (
          <Section title="Race mode (top 10 horse pills)">
            <LeaderboardRace entries={entries} topN={10} />
            <SubNote />
          </Section>
        )}

        <footer className="border-t border-stone-200 pt-4 text-[11px] text-stone-500 max-w-3xl">
          Animation tokens: spring stiffness 350, damping 32 (table) / 380, 30
          (race lanes) · horse pill slide 800ms · rank-change badge 6s TTL ·
          streak threshold 3 consecutive climbs · brand-emerald glow ring.
          Respects prefers-reduced-motion (motion library handles it).
        </footer>
      </div>
    </main>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] tracking-wider font-bold text-stone-500 uppercase">
        {title}
      </h2>
      <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
        {children}
      </div>
    </section>
  )
}

function SubNote() {
  return (
    <div className="mt-3 px-3 py-2 rounded-lg bg-stone-50 ring-1 ring-stone-200 text-[10px] text-stone-500 leading-relaxed">
      Each lane swaps vertically when ranks flip; the horse pill inside
      slides horizontally based on score / leader-score. Two motions
      stacked = the &ldquo;race feel&rdquo;.
    </div>
  )
}
