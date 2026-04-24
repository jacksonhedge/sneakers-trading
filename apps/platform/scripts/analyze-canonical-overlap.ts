/**
 * Scratch analyzer. Loads every current JSONL snapshot, runs
 * groupIntoCanonical, and prints a report we can eyeball for quality:
 *   - global stats (totals, multi-venue counts, largest group)
 *   - coverage per sport
 *   - top 30 multi-venue canonical groups (the ones we'd expect the UI to
 *     show as "offered on N books")
 *   - biggest groups that looked suspicious (3+ venues with different teams)
 *   - sample of Phase 2 (sports) groups so we can sanity-check the heuristic
 *   - sample of singletons in major sports — these are markets we SHOULD
 *     probably be matching but the current heuristic misses
 *
 * Run: pnpm --filter @sneakers/platform exec tsx scripts/analyze-canonical-overlap.ts
 */

import { loadAllLatestSnapshots } from '../src/lib/markets-data'
import { groupIntoCanonical, type CanonicalMarket } from '../src/lib/canonical-markets'

function pct(n: number, of: number): string {
  if (of === 0) return '0%'
  return `${((n / of) * 100).toFixed(1)}%`
}

function trunc(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

async function main() {
  console.log('Loading snapshots…')
  const { snapshots } = await loadAllLatestSnapshots()

  console.log(`Loaded ${snapshots.length} snapshots. Grouping…\n`)

  const { canonical, stats } = groupIntoCanonical(snapshots)

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' GLOBAL STATS')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Total snapshots:           ${stats.totalSnapshots.toLocaleString()}`)
  console.log(`Canonical markets:         ${stats.canonicalCount.toLocaleString()}`)
  console.log(
    `  single-venue:            ${stats.singleVenue.toLocaleString().padStart(6)}  (${pct(stats.singleVenue, stats.canonicalCount)})`,
  )
  console.log(
    `  two-venue:               ${stats.twoVenue.toLocaleString().padStart(6)}  (${pct(stats.twoVenue, stats.canonicalCount)})`,
  )
  console.log(
    `  three+ venue:            ${stats.threePlus.toLocaleString().padStart(6)}  (${pct(stats.threePlus, stats.canonicalCount)})`,
  )
  console.log(`  largest group:           ${stats.largestGroup} venues`)
  console.log()
  console.log('Grouping provenance:')
  console.log(`  phase 1 (exact string):  ${stats.phase1GroupedSnapshots.toLocaleString()} snapshots grouped`)
  console.log(`  phase 2 (sport sig):     ${stats.phase2GroupedSnapshots.toLocaleString()} snapshots grouped`)
  console.log(`  untouched singletons:    ${stats.untouchedSingletons.toLocaleString()} snapshots left alone`)
  console.log()

  // ── Source diversity (the real cross-book wins) ─────────────────
  // OddsAPI emits betmgm/betrivers/draftkings/fanduel as separate platforms.
  // "Within-source" = all venues for a canonical belong to the same upstream
  // scraper; "cross-source" = canonical has venues from 2+ different scrapers
  // (e.g., Polymarket + Kalshi + FanDuel). Cross-source is the real overlap
  // value prop — the headline number to optimize.
  const ODDSAPI_BOOKS = new Set(['betmgm', 'betrivers', 'draftkings', 'fanduel'])
  const sourceOf = (platform: string): string =>
    ODDSAPI_BOOKS.has(platform) ? 'oddsapi' : platform
  let crossSource = 0
  let withinSource = 0
  for (const c of canonical) {
    if (c.venueCount < 2) continue
    const sources = new Set(c.venues.map(sourceOf))
    if (sources.size >= 2) crossSource++
    else withinSource++
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' SOURCE DIVERSITY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Within-source multi-venue:  ${withinSource.toLocaleString()}  (e.g., all 4 OddsAPI books agreeing)`)
  console.log(`Cross-source multi-venue:   ${crossSource.toLocaleString()}  (e.g., Polymarket + Kalshi, or Kalshi + OddsAPI)`)
  console.log()

  // Show the cross-source groups specifically — these are the diamonds
  const crossSourceMarkets = canonical
    .filter((c) => c.venueCount >= 2)
    .filter((c) => new Set(c.venues.map(sourceOf)).size >= 2)
    .sort((a, b) => b.venueCount - a.venueCount)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(` CROSS-SOURCE MATCHES (${crossSourceMarkets.length} total) — first 25`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const c of crossSourceMarkets.slice(0, 25)) {
    const sources = [...new Set(c.venues.map(sourceOf))].join('+')
    console.log(`[${c.venueCount}v ${c.groupedBy.padEnd(3)}] ${sources.padEnd(28)} ${trunc(c.question, 60)}`)
    for (const q of c.quotes) {
      console.log(`       ${q.platform.padEnd(12)} ${trunc(q.question, 70)}`)
    }
    console.log()
  }

  // ── Per-sport coverage ──────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(' PER-SPORT COVERAGE')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const bySport = new Map<string, { total: number; multi: number; max: number }>()
  for (const c of canonical) {
    const sport = c.sport ?? '(none)'
    const bucket = bySport.get(sport) ?? { total: 0, multi: 0, max: 0 }
    bucket.total += 1
    if (c.venueCount >= 2) bucket.multi += 1
    if (c.venueCount > bucket.max) bucket.max = c.venueCount
    bySport.set(sport, bucket)
  }
  const sportRows = [...bySport.entries()].sort((a, b) => b[1].total - a[1].total)
  console.log('SPORT           TOTAL  MULTI-VENUE  COVERAGE  LARGEST')
  for (const [sport, b] of sportRows.slice(0, 20)) {
    console.log(
      `${sport.padEnd(15)}${b.total.toString().padStart(6)}${b.multi.toString().padStart(13)}${pct(b.multi, b.total).padStart(10)}${b.max.toString().padStart(9)}`,
    )
  }
  console.log()

  // ── Top multi-venue groups ──────────────────────────────────────
  const multi = canonical.filter((c) => c.venueCount >= 2).sort((a, b) => b.venueCount - a.venueCount)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(` TOP 30 MULTI-VENUE CANONICAL MARKETS (${multi.length} total with ≥2 venues)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const c of multi.slice(0, 30)) {
    console.log(
      `[${c.venueCount}v ${c.groupedBy.padEnd(3)}] ${c.venues.join(',').padEnd(40)} ${trunc(c.question, 70)}`,
    )
  }
  console.log()

  // ── Sample Phase-2 groups (quality check) ───────────────────────
  const phase2 = canonical.filter((c) => c.groupedBy === 'sport').sort((a, b) => b.venueCount - a.venueCount)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(` SAMPLE PHASE-2 GROUPS (${phase2.length} total) — first 15 by size`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const c of phase2.slice(0, 15)) {
    console.log(`\n [${c.venueCount}v] ${c.sport ?? '?'} ${c.marketType ?? '?'} ${c.resolveDate ?? '?'} teams=${(c.teams ?? []).join(',')}`)
    for (const q of c.quotes) {
      console.log(`   ${q.platform.padEnd(12)} ${trunc(q.question, 80)}`)
    }
  }
  console.log()

  // ── Sample missed singletons in major sports ────────────────────
  const MAJOR_SPORTS = new Set(['nba', 'basketball', 'nfl', 'football', 'mlb', 'baseball', 'nhl', 'ice_hockey', 'soccer'])
  const missedSports = canonical.filter(
    (c) => c.venueCount === 1 && c.sport && MAJOR_SPORTS.has(c.sport.toLowerCase()),
  )
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(` SAMPLE SINGLETONS IN MAJOR SPORTS (${missedSports.length} total — probable misses)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  for (const c of missedSports.slice(0, 20)) {
    const q = c.quotes[0]
    console.log(`${q.platform.padEnd(12)} ${(c.sport ?? '?').padEnd(12)} ${(c.resolveDate ?? '?').padEnd(12)} ${trunc(q.question, 80)}`)
  }
  console.log()

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
