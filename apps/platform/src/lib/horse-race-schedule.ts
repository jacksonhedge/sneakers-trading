// Crypto Horse Race tournament schedule — shared between the full
// /dashboard/horse-race lobby and the compact dashboard tile.
//
// Pure logic + types. No React, no client-only APIs — safe to import
// from server or client modules.

export type TournamentMode = 'manual' | 'autobot'
export type TournamentSize = 2 | 5 | 10
export type TournamentStatus =
  | 'waiting'     // registration open, > 30s to start
  | 'locked'      // ≤30s to start AND filled to size
  | 'underfilled' // ≤30s to start AND NOT filled — round won't run
  | 'starting'    // last 5s
  | 'live'        // round in progress (started)
  | 'resolved'

export type Venue = 'polymarket' | 'limitless' | 'og' | 'hyperliquid' | 'kalshi'

export interface Tournament {
  id: string
  asset: 'BTC' | 'ETH' | 'SOL'
  durationMin: 5 | 15 | 30 | 60
  buyInUsd: number
  startsInSec: number
  registered: number
  cap: number
  flavor: string
  mode: TournamentMode
  size: TournamentSize
  status: TournamentStatus
  venue: Venue
}

// Lock-in window: at this many seconds before start, the system checks
// if the tournament has its minimum players. If it does → LOCKED (will
// run). If not → UNDERFILLED (refund + roll over to next round).
export const LOCK_IN_WINDOW_SEC = 30

export const SIZE_LABEL: Record<TournamentSize, string> = {
  2: '1V1 DUEL',
  5: '5P TABLE',
  10: '10P TABLE',
}

export const ASSET_EMOJI: Record<Tournament['asset'], string> = {
  BTC: '₿',
  ETH: 'Ξ',
  SOL: '◎',
}

export const ASSET_COLOR: Record<Tournament['asset'], string> = {
  BTC: 'from-orange-500 to-amber-500',
  ETH: 'from-indigo-500 to-violet-500',
  SOL: 'from-violet-500 to-fuchsia-500',
}

export const VENUE_NAME: Record<Venue, string> = {
  polymarket: 'Polymarket',
  limitless: 'Limitless',
  og: 'OG',
  hyperliquid: 'Hyperliquid',
  kalshi: 'Kalshi',
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h
}

export function fmtCountdown(sec: number): string {
  if (sec <= 0) return 'now'
  if (sec < 60) return `0:${sec.toString().padStart(2, '0')}`
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  if (m < 60) return `${m}:${s.toString().padStart(2, '0')}`
  const h = Math.floor(m / 60)
  return `${h}h ${(m - h * 60).toString().padStart(2, '0')}m`
}

export function cashFor(buyInUsd: number): number {
  return buyInUsd * 0.9
}

// Rolling schedule generator.
//
// Real production cadence (5/15/30/60 min) × three table sizes (2/5/10
// players). Each (asset, duration, size) generates the next round at
// the right boundary. Status is derived from the countdown + the
// registered count: tournaments that fail to fill by the 30-second
// lock-in window go UNDERFILLED (would refund in production).
export function generateSchedule(now: Date): Tournament[] {
  const out: Tournament[] = []
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)

  function nextBoundary(intervalMin: number): Date {
    const minutes = (now.getTime() - dayStart.getTime()) / 60_000
    const next = Math.ceil(minutes / intervalMin) * intervalMin
    const d = new Date(dayStart)
    d.setMinutes(next, 0, 0)
    return d
  }

  function deriveStatus(startsInSec: number, registered: number, cap: number): TournamentStatus {
    if (startsInSec > LOCK_IN_WINDOW_SEC) return 'waiting'
    if (startsInSec <= 0) return 'live'
    if (startsInSec <= 5 && registered >= cap) return 'starting'
    if (registered >= cap) return 'locked'
    return 'underfilled'
  }

  function estimateRegistered(id: string, size: TournamentSize, secsToStart: number): number {
    const totalRegWindowSec = 600
    const elapsed = Math.max(0, totalRegWindowSec - secsToStart)
    const elapsedFrac = Math.min(1, elapsed / totalRegWindowSec)
    const fillRateBySize: Record<TournamentSize, number> = { 2: 1.6, 5: 1.1, 10: 0.85 }
    const baseFrac = elapsedFrac * fillRateBySize[size]
    const h = hashStr(id) / 0xffffffff
    const noise = (h - 0.5) * 0.25
    const frac = Math.max(0, Math.min(1, baseFrac + noise))
    return Math.floor(frac * size)
  }

  const cadences: Array<{
    durationMin: 5 | 15 | 30
    buyInUsd: number
    asset: 'BTC' | 'ETH' | 'SOL'
    flavor: string
    mode: TournamentMode
    venue: Venue
  }> = [
    { durationMin: 5, buyInUsd: 5, asset: 'BTC', flavor: 'BTC sprint', mode: 'manual', venue: 'polymarket' },
    { durationMin: 5, buyInUsd: 5, asset: 'ETH', flavor: 'ETH sprint', mode: 'manual', venue: 'limitless' },
    { durationMin: 15, buyInUsd: 20, asset: 'BTC', flavor: 'BTC classic', mode: 'autobot', venue: 'polymarket' },
    { durationMin: 15, buyInUsd: 10, asset: 'SOL', flavor: 'SOL classic', mode: 'manual', venue: 'og' },
    { durationMin: 30, buyInUsd: 50, asset: 'BTC', flavor: 'BTC marathon', mode: 'autobot', venue: 'hyperliquid' },
  ]
  const sizes: TournamentSize[] = [2, 5, 10]

  for (const c of cadences) {
    const start = nextBoundary(c.durationMin)
    const startsInSec = Math.max(0, Math.round((start.getTime() - now.getTime()) / 1000))
    for (const size of sizes) {
      const id = `${c.asset}-${c.durationMin}-${size}-${start.getTime()}`
      const registered = estimateRegistered(id, size, startsInSec)
      out.push({
        id,
        asset: c.asset,
        durationMin: c.durationMin,
        buyInUsd: c.buyInUsd,
        startsInSec,
        registered,
        cap: size,
        flavor: c.flavor,
        mode: c.mode,
        size,
        status: deriveStatus(startsInSec, registered, size),
        venue: c.venue,
      })
    }
  }
  out.sort((a, b) => a.startsInSec - b.startsInSec)
  return out
}
