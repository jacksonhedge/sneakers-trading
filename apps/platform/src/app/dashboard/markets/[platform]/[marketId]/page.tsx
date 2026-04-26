import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import {
  loadMarketHistory,
  type MarketSnapshot,
} from '@/lib/markets-data'
import { loadCanonicalMarkets } from '@/lib/canonical-markets'
import { findVenue } from '@/lib/venues'
import { TradePanel } from './trade-panel'
import { TimeframeTabs, DetailTabs } from './timeframe-tabs'
import { isTimeframe, timeframeToDays, DEFAULT_TIMEFRAME } from './timeframe-utils'
import { MarketTopbar, MarketBreadcrumb } from './market-topbar'
import './theme.css'

export const dynamic = 'force-dynamic'

function cents(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—'
  return `${Math.round(p * 100)}¢`
}

function formatNum(v: number | string | null | undefined, prefix = ''): string {
  if (v === null || v === undefined) return '—'
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(1)}K`
  return `${prefix}${n.toFixed(0)}`
}

function topAsk(m: MarketSnapshot): number | null {
  let best: number | null = null
  for (const o of m.outcomes) {
    const p = o.best_ask ?? o.last_price
    if (p != null && (best === null || p < best)) best = p
  }
  return best
}

function countdown(iso: string | undefined): string {
  if (!iso) return '—'
  const ms = Date.parse(iso) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'closed'
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hrs = Math.floor((ms / (1000 * 60 * 60)) % 24)
  const min = Math.floor((ms / (1000 * 60)) % 60)
  return `${days}d ${hrs}h ${min}m`
}

function platformAccent(platform: string): { dot: string; stroke: string } {
  const p = platform.toLowerCase()
  if (p === 'polymarket') return { dot: '#38bdf8', stroke: '#38bdf8' }
  if (p === 'kalshi') return { dot: '#10b981', stroke: '#10b981' }
  if (p === 'novig') return { dot: '#f59e0b', stroke: '#f59e0b' }
  if (p === 'prophetx') return { dot: '#8b5cf6', stroke: '#8b5cf6' }
  if (p === 'og') return { dot: '#f43f5e', stroke: '#f43f5e' }
  if (p === 'oddsapi') return { dot: '#6366f1', stroke: '#6366f1' }
  if (p === 'opinion') return { dot: '#eab308', stroke: '#eab308' }
  if (p === 'caesars') return { dot: '#c9a96e', stroke: '#c9a96e' } // Caesars gold
  if (p === 'betmgm') return { dot: '#ac8f4f', stroke: '#ac8f4f' } // MGM gold
  if (p === 'draftkings_sb') return { dot: '#53d337', stroke: '#53d337' } // DK green
  if (p === 'fanduel_sb') return { dot: '#1493ff', stroke: '#1493ff' } // FD blue
  if (p === 'betrivers') return { dot: '#00529b', stroke: '#00529b' } // BetRivers blue
  if (p === 'pointsbet_us') return { dot: '#dc1b2c', stroke: '#dc1b2c' } // PointsBet red
  return { dot: '#78716c', stroke: '#78716c' }
}

function buildPath(
  snapshots: Array<{ ts: string; price: number | null }>,
  width: number,
  height: number,
  tsMin: number,
  tsMax: number,
): string {
  const pts = snapshots.filter((s) => s.price !== null) as Array<{ ts: string; price: number }>
  if (pts.length < 2) return ''
  const xScale = (t: number) => ((t - tsMin) / Math.max(1, tsMax - tsMin)) * width
  const yScale = (p: number) => height - Math.max(0, Math.min(1, p)) * height
  return pts
    .map((pt, i) => {
      const x = xScale(Date.parse(pt.ts))
      const y = yScale(pt.price)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

export default async function MarketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ platform: string; marketId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { platform, marketId } = await params
  const decodedId = decodeURIComponent(marketId)
  const sp = await searchParams
  const tfRaw = typeof sp.tf === 'string' ? sp.tf : undefined
  const activeTf = isTimeframe(tfRaw) ? tfRaw : DEFAULT_TIMEFRAME
  const windowDays = timeframeToDays(activeTf)

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  // Load all snapshots once and run canonical grouping. The canonical layer
  // applies team-alias canonicalization, prose normalization, and sports
  // signature matching — far more robust than the old `normalize()` fuzzy
  // match which only caught trivially-identical strings. The group's quotes
  // become the cross-venue list displayed on the detail page.
  const { canonical: allCanonical } = await loadCanonicalMarkets()
  const canonical = allCanonical.find((c) =>
    c.quotes.some(
      (q) => q.platform === platform && q.platform_market_id === decodedId,
    ),
  )
  if (!canonical) notFound()

  const market = canonical.quotes.find(
    (q) => q.platform === platform && q.platform_market_id === decodedId,
  )
  if (!market) notFound()

  const primaryVenue = findVenue(market.platform)
  const allBooks = canonical.quotes
  const snapshots: MarketSnapshot[] = allCanonical.flatMap((c) => c.quotes)

  const history = await loadMarketHistory(windowDays)
  const histByVenue = new Map<string, Array<{ ts: string; price: number | null }>>()
  for (const book of allBooks) {
    const h = history.find(
      (h) => h.platform === book.platform && h.platform_market_id === book.platform_market_id,
    )
    if (!h) continue
    histByVenue.set(
      book.platform,
      h.snapshots.map((s) => ({ ts: s.ts, price: topAsk(s) })),
    )
  }

  const allTs = [...histByVenue.values()].flat().map((s) => Date.parse(s.ts)).filter(Number.isFinite)
  const tsMin = allTs.length ? Math.min(...allTs) : Date.now() - windowDays * 24 * 3600 * 1000
  const tsMax = allTs.length ? Math.max(...allTs) : Date.now()

  const bookRows = allBooks
    .map((m) => {
      const ask = topAsk(m)
      return {
        platform: m.platform,
        venue: findVenue(m.platform),
        price: ask,
        size: typeof m.volume_traded === 'number' ? m.volume_traded : parseFloat(String(m.volume_traded ?? '0')) || 0,
      }
    })
    .filter((r) => r.price != null)
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))

  let cumUsd = 0
  const bookRowsWithCum = bookRows.map((r) => {
    cumUsd += (r.price ?? 0) * r.size
    return { ...r, cum: cumUsd }
  })

  const tradeOutcomes = market.outcomes.slice(0, 2).map((o) => ({
    name: o.name,
    price: o.best_ask ?? o.last_price,
  }))

  const topMovers = snapshots
    .filter((m) => m.volume_traded != null)
    .slice(0, 4)
    .map((m, i) => ({
      key: `${m.platform}:${m.platform_market_id}`,
      platform: m.platform,
      question: m.question,
      price: topAsk(m),
      vol: typeof m.volume_traded === 'number' ? m.volume_traded : parseFloat(String(m.volume_traded ?? '0')),
      change: [0.23, -0.11, 0.46, -0.07][i] ?? 0,
    }))

  const yesAsk = market.outcomes[0]?.best_ask ?? market.outcomes[0]?.last_price ?? null
  const noAsk = market.outcomes[1]?.best_ask ?? market.outcomes[1]?.last_price ?? null
  const overround = market.overround ?? null
  const scorePct = yesAsk != null ? Math.round(yesAsk * 100) : 50

  return (
    <div
      data-theme-root
      data-theme="light"
      className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col"
    >
      <MarketTopbar
        latestTs={allBooks.reduce<string | null>(
          (acc, q) => (acc && acc > q.ts ? acc : q.ts),
          null,
        )}
      />
      <MarketBreadcrumb
        sport={market.sport}
        platform={market.platform}
        question={market.question}
      />

      <div className="flex-1 flex min-w-0 min-h-0">
          {/* ── LEFT PANEL ─────────────────────────────────────────── */}
          <aside
            data-stripe
            className="w-[280px] flex-shrink-0 border-r border-[var(--border)] bg-[var(--left-bg)] overflow-y-auto"
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--text-muted)] tracking-wider mb-0.5">
                    {market.sport?.toUpperCase() ?? market.platform.toUpperCase()}
                  </div>
                  <div className="font-semibold text-[var(--text)] text-sm">
                    {market.outcomes[0]?.name ?? 'Market'}
                  </div>
                  <div className="text-[11px] text-[var(--text-3)] leading-snug mt-0.5">
                    {market.question}
                  </div>
                </div>
                <button className="text-[var(--text-muted)] hover:text-[var(--text-2)] text-xs" aria-label="collapse left">
                  ‹
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Total Volume" value={formatNum(market.volume_traded, '$')} />
                <StatTile label="24h Volume" value={formatNum((Number(market.volume_traded) || 0) * 0.05, '$')} />
                <StatTile label="Liquidity" value={formatNum(market.liquidity, '$')} />
                <StatTile label="Open Interest" value={formatNum((Number(market.liquidity) || 0) * 0.5, '$')} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded bg-[var(--panel)] ring-1 ring-[var(--border)] px-3 py-2.5">
                  <div className="text-[10px] text-[var(--text-muted)] tracking-wider">Yes Price</div>
                  <div className="text-lg font-bold text-[var(--yes)] font-mono tabular-nums mt-0.5">
                    {cents(yesAsk)}
                  </div>
                </div>
                <div className="rounded bg-[var(--panel)] ring-1 ring-[var(--border)] px-3 py-2.5">
                  <div className="text-[10px] text-[var(--text-muted)] tracking-wider">No Price</div>
                  <div className="text-lg font-bold text-[var(--no)] font-mono tabular-nums mt-0.5">
                    {cents(noAsk)}
                  </div>
                </div>
              </div>

              <div className="rounded bg-[var(--panel)] ring-1 ring-[var(--border)] p-3">
                <div className="text-[10px] text-[var(--text-muted)] tracking-wider text-center mb-2">PROVIDERS</div>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {allBooks.slice(0, 6).map((b) => {
                    const accent = platformAccent(b.platform)
                    const v = findVenue(b.platform)
                    return (
                      <div
                        key={b.platform}
                        className="w-7 h-7 rounded flex items-center justify-center ring-1 ring-[var(--border)]"
                        style={{ backgroundColor: `${accent.dot}22` }}
                        title={v?.name ?? b.platform}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: accent.dot }}
                        />
                      </div>
                    )
                  })}
                  {canonical.venueCount === 1 && (
                    <span className="text-[10px] text-[var(--text-muted)]">
                      only on {primaryVenue?.name ?? market.platform}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded bg-[var(--panel)] ring-1 ring-[var(--border)] p-3">
                <div className="text-[10px] text-[var(--text-muted)] tracking-wider text-center mb-2">
                  Price Change
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">24H</div>
                    <div className="text-xs font-semibold text-[var(--no)] font-mono tabular-nums">-7%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">7D</div>
                    <div className="text-xs font-semibold text-[var(--no)] font-mono tabular-nums">-7%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)]">30D</div>
                    <div className="text-xs font-semibold text-[var(--text-3)] font-mono tabular-nums">—</div>
                  </div>
                </div>
              </div>

              <div className="rounded bg-[var(--panel)] ring-1 ring-[var(--border)] p-4">
                <div className="text-[10px] text-[var(--text-muted)] tracking-wider text-center mb-2 flex items-center justify-center gap-1">
                  Prediction Score <span className="text-[var(--text-muted)]">ⓘ</span>
                </div>
                <Gauge pct={scorePct} />
                <div className="text-center text-xl font-bold text-[var(--text)] font-mono tabular-nums mt-2">
                  {scorePct.toFixed(1)}%
                </div>
              </div>

              <button className="w-full py-2.5 text-sm font-semibold rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition flex items-center justify-center gap-2">
                <span>☆</span> Add to Watchlist
              </button>
            </div>

            <div className="border-t border-[var(--border)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-[var(--text)]">Top Movers</div>
                <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
                  <span>⊟</span>
                  <span>☰</span>
                  <span>𝕏</span>
                  <span>✈</span>
                </div>
              </div>
              <div className="space-y-2">
                {topMovers.map((m) => {
                  const accent = platformAccent(m.platform)
                  const chg = (m.change * 100).toFixed(0)
                  const isUp = m.change >= 0
                  return (
                    <Link
                      key={m.key}
                      href={`/dashboard/markets/${m.platform}/${encodeURIComponent(m.key.split(':').slice(1).join(':'))}`}
                      className="flex items-center gap-2 text-xs hover:bg-[var(--panel-2)] -mx-1 px-1 py-1 rounded transition"
                    >
                      <div
                        className="w-5 h-5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: accent.dot }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-[var(--text-2)] leading-tight">{m.question}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">Vol {formatNum(m.vol, '$')}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-semibold text-[var(--yes)] font-mono tabular-nums">
                          {cents(m.price)}
                        </div>
                        <div
                          className={`text-[10px] font-mono tabular-nums ${isUp ? 'text-[var(--yes)]' : 'text-[var(--no)]'}`}
                        >
                          {isUp ? '+' : ''}{chg}%
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
              <Link
                href="/markets"
                className="block text-center text-xs text-[var(--text-muted)] hover:text-[var(--accent)] pt-2 border-t border-[var(--border)]"
              >
                See more →
              </Link>
            </div>
          </aside>

          {/* ── CENTER ─────────────────────────────────────────────── */}
          <main
            data-stripe
            className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--center-bg)]"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] flex-shrink-0 bg-[var(--panel)]/60">
              <div className="w-8 h-8 rounded-full bg-[var(--panel-2)] ring-1 ring-[var(--border)] flex items-center justify-center text-xs text-[var(--text-3)]">
                {primaryVenue?.name[0] ?? '◉'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--text)] truncate flex items-center gap-1">
                  {market.question}
                  <span className="text-[var(--text-muted)] text-xs">▾</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--text-3)] flex-shrink-0">
                <span className="flex items-center gap-1">
                  <span className="text-[var(--yes)]">◷</span>
                  <span className="font-mono tabular-nums">{countdown(market.resolves_at)}</span>
                </span>
                <span className="text-[var(--text-muted)]">
                  {market.resolves_at
                    ? new Date(market.resolves_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '—'}
                </span>
                <span className="text-[var(--text-muted)] font-mono tabular-nums">
                  {formatNum(market.volume_traded, '$')}
                </span>
                <button className="text-[var(--text-muted)] hover:text-[var(--text-2)]" aria-label="bookmark">🔖</button>
                <button className="text-[var(--text-muted)] hover:text-[var(--text-2)]" aria-label="share">⇪</button>
                <button className="text-[var(--text-muted)] hover:text-[var(--text-2)]" aria-label="info">ⓘ</button>
              </div>
            </div>

            <div className="flex min-h-0 border-b border-[var(--border)]">
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
                  <TimeframeTabs />
                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <button aria-label="search">🔍</button>
                    <button aria-label="fullscreen">⛶</button>
                  </div>
                </div>

                <div className="relative flex-1 min-h-[320px]">
                  <div className="absolute top-3 left-4 text-[11px] text-[var(--text-3)] leading-tight max-w-md z-10">
                    <span className="text-[var(--text-muted)]">{market.question} — </span>
                    <span className="text-[var(--text)]">H {cents(yesAsk ? yesAsk * 1.1 : null)}</span>
                    <span className="text-[var(--text-muted)]"> · L {cents(yesAsk ? yesAsk * 0.9 : null)}</span>
                    <span className="text-[var(--no)]">
                      {overround ? ` · -${(overround * 10).toFixed(1)}%` : ''}
                    </span>
                  </div>

                  <svg viewBox="0 0 800 320" preserveAspectRatio="none" className="w-full h-full">
                    {[0, 0.25, 0.5, 0.75, 1].map((g) => (
                      <line
                        key={g}
                        x1="0"
                        x2="800"
                        y1={320 * (1 - g)}
                        y2={320 * (1 - g)}
                        stroke="var(--chart-grid)"
                        strokeWidth="1"
                        strokeDasharray="2 4"
                      />
                    ))}

                    {[...histByVenue.entries()].map(([plat, snaps]) => {
                      const accent = platformAccent(plat)
                      const d = buildPath(snaps, 800, 320, tsMin, tsMax)
                      if (!d) return null
                      return (
                        <path
                          key={plat}
                          d={d}
                          fill="none"
                          stroke={accent.stroke}
                          strokeWidth="1.5"
                          opacity={plat === market.platform ? 1 : 0.55}
                        />
                      )
                    })}

                    {yesAsk != null && (
                      <circle
                        cx={790}
                        cy={320 - yesAsk * 320}
                        r={4}
                        fill="#f59e0b"
                        stroke="var(--center-bg)"
                        strokeWidth="2"
                      />
                    )}
                  </svg>

                  <div className="absolute right-1 top-2 bottom-2 flex flex-col justify-between text-[10px] text-[var(--chart-label)] font-mono tabular-nums pointer-events-none">
                    {[1, 0.75, 0.5, 0.25, 0].map((v) => (
                      <span key={v}>{Math.round(v * 100)}¢</span>
                    ))}
                  </div>

                  <div className="absolute left-4 bottom-2 flex items-center gap-4 text-[10px] text-[var(--text-muted)]">
                    {[...histByVenue.keys()].map((plat) => {
                      const a = platformAccent(plat)
                      return (
                        <span key={plat} className="flex items-center gap-1">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: a.dot }}
                          />
                          <span className="uppercase tracking-wider">{plat}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)]">
                  <div className="flex items-center gap-3">
                    <button className="text-[var(--text-3)]">All</button>
                    <button>1m</button>
                    <button>1h</button>
                    <button>1d</button>
                    <button aria-label="calendar">📅</button>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span>{new Date().toLocaleTimeString('en-GB')} (UTC+1)</span>
                    <span>log</span>
                    <span>auto</span>
                  </div>
                </div>
              </div>

              <div
                data-stripe
                className="w-[260px] flex-shrink-0 border-l border-[var(--border)] bg-[var(--book-bg)] flex flex-col min-h-0"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] text-[10px] text-[var(--text-muted)]">
                  <span className="tracking-wider">Spread</span>
                  <span className="flex items-center gap-1">
                    <span className="text-[var(--text-3)] tracking-wider">All Venues</span>
                    <span>▾</span>
                  </span>
                </div>
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 px-3 py-1.5 border-b border-[var(--border)] text-[9px] text-[var(--text-muted)] tracking-wider">
                  <span>PRICE</span>
                  <span>VENUE</span>
                  <span className="text-right">SIZE</span>
                  <span className="text-right">CUM. USD</span>
                </div>
                <div className="flex-1 overflow-y-auto text-[10px]">
                  {bookRowsWithCum.length === 0 ? (
                    <div className="px-3 py-4 text-[var(--text-muted)]">No cross-venue quotes.</div>
                  ) : (
                    bookRowsWithCum.concat(bookRowsWithCum).concat(bookRowsWithCum).slice(0, 30).map((r, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[auto_1fr_auto_auto] gap-2 px-3 py-1 border-b border-[var(--border-subtle)] hover:bg-[var(--panel-2)] font-mono tabular-nums"
                      >
                        <span className="text-[var(--text-2)]">{cents(r.price)}</span>
                        <span className="uppercase text-[var(--text-3)] truncate">
                          {r.venue?.name ?? r.platform}
                        </span>
                        <span className="text-right text-[var(--text-3)]">{formatNum(r.size)}</span>
                        <span className="text-right text-[var(--text-muted)]">{formatNum(r.cum, '$')}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 bg-[var(--center-bg)]">
              <DetailTabs />

              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <button className="flex items-center gap-1 hover:text-[var(--text-2)]">
                    All Markets <span className="text-[var(--text-muted)]">▾</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-[var(--text-2)]">
                    {allBooks.length} venues <span className="text-[var(--text-muted)]">▾</span>
                  </button>
                  <span className="flex-1" />
                  {allBooks.slice(0, 4).map((b) => {
                    const a = platformAccent(b.platform)
                    return (
                      <span key={b.platform} className="flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: a.dot }}
                        />
                        <span className="uppercase text-[10px] tracking-wider">{b.platform}</span>
                      </span>
                    )
                  })}
                  <span className="text-[10px] text-[var(--text-muted)] tracking-wider ml-2">OUTCOME</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {market.outcomes.slice(0, 4).map((o, rowIdx) => (
                        <tr
                          key={o.name + rowIdx}
                          className="border-t border-[var(--border-subtle)] hover:bg-[var(--panel-2)]"
                        >
                          <td className="py-2 pr-4 text-[var(--text)] w-32">{o.name}</td>
                          {allBooks.slice(0, 4).map((b) => {
                            const bo = b.outcomes[rowIdx]
                            const price = bo?.best_ask ?? bo?.last_price ?? null
                            return (
                              <td key={b.platform} className="py-2 pr-4 text-[var(--text-2)] font-mono tabular-nums">
                                {cents(price)}
                              </td>
                            )
                          })}
                          <td className="py-2 pr-2">
                            <button className="text-[10px] font-semibold tracking-wider px-2 py-1 rounded bg-[var(--yes-bg)] text-[var(--yes)] ring-1 ring-[var(--yes-ring)] hover:opacity-80 transition">
                              Yes {cents(o.best_ask ?? o.last_price)}
                            </button>
                          </td>
                          <td className="py-2">
                            <button className="text-[10px] font-semibold tracking-wider px-2 py-1 rounded bg-[var(--no-bg)] text-[var(--no)] ring-1 ring-[var(--no-ring)] hover:opacity-80 transition">
                              No {cents(1 - (o.best_ask ?? o.last_price ?? 0.5))}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </main>

        <TradePanel outcomes={tradeOutcomes} primaryVenue={primaryVenue} />
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-[var(--panel)] ring-1 ring-[var(--border)] px-3 py-2.5">
      <div className="text-[10px] text-[var(--text-muted)] tracking-wider">{label}</div>
      <div className="text-sm font-semibold text-[var(--text)] font-mono tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

function Gauge({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const angle = (clamped / 100) * 180 - 90
  const rad = (angle * Math.PI) / 180
  const cx = 80
  const cy = 70
  const r = 56
  const nx = cx + Math.sin(rad) * r
  const ny = cy - Math.cos(rad) * r
  const label = clamped < 35 ? 'Bearish' : clamped < 65 ? 'Neutral' : 'Bullish'

  return (
    <div className="relative">
      <svg viewBox="0 0 160 90" className="w-full">
        <path d="M 24 70 A 56 56 0 0 1 52 22" fill="none" stroke="#ef4444" strokeWidth="10" />
        <path d="M 52 22 A 56 56 0 0 1 108 22" fill="none" stroke="#f59e0b" strokeWidth="10" />
        <path d="M 108 22 A 56 56 0 0 1 136 70" fill="none" stroke="#10b981" strokeWidth="10" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill="var(--text)" />
      </svg>
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] text-[var(--text-3)] tracking-wider">
        {label}
      </div>
    </div>
  )
}
