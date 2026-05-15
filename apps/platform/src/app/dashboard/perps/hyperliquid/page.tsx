import Link from 'next/link'
import { getTierIdentity } from '@/lib/require-tier'
import {
  getAllHlPerps,
  getFundingOutliers,
  type HlPerp,
} from '@/lib/hyperliquid-data'
import { findVenue } from '@/lib/venues'

// User-facing Hyperliquid perps view. Free tier sees a delayed top-10
// snapshot; Pro+ gets live data, full table, and funding outliers.
//
// Data path is the same lib/hyperliquid-data.ts that the admin signals
// view uses; only the cache mode differs ('delayed' for free → 15-min
// TTL, 'live' for Pro+ → 30s TTL).
//
// Pricing surface: perps are continuous price + leverage, not binary,
// so this page deliberately doesn't go through the prediction-market
// listing infrastructure. Different vehicle, different UX.

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Hyperliquid perps — Sneakers Terminal',
}

const FREE_TIER_TOP_N = 10
const FREE_TIER_REFRESH_LABEL = '15-minute snapshot'
const LIVE_REFRESH_LABEL = 'Live · 30s refresh'

function fmtUsdCompact(n: number | null): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  if (abs >= 1) return `$${n.toFixed(2)}`
  // Sub-dollar prices (memecoins, FARTCOIN-style): show 4 sig figs.
  return `$${n.toPrecision(4)}`
}

function fmtPct(n: number | null, opts?: { decimals?: number }): string {
  if (n == null) return '—'
  const d = opts?.decimals ?? 2
  return `${(n * 100).toFixed(d)}%`
}

function fmtRefreshTs(ms: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  return `${Math.floor(diffSec / 3600)}h ago`
}

function pctClass(n: number | null): string {
  if (n == null || n === 0) return 'text-stone-600'
  return n > 0 ? 'text-emerald-700' : 'text-red-700'
}

export default async function DashboardHyperliquidPage() {
  const me = await getTierIdentity()
  const isPaid = me.tier !== 'free'
  const mode = isPaid ? 'live' : 'delayed'

  const { perps, fetchedAt } = await getAllHlPerps({ mode })

  const topByOi = perps
    .filter((p) => p.open_interest_usd != null)
    .sort((a, b) => (b.open_interest_usd ?? 0) - (a.open_interest_usd ?? 0))
  const visible = isPaid ? topByOi : topByOi.slice(0, FREE_TIER_TOP_N)

  // Funding outliers are a Pro+ insight — free tier doesn't see them.
  const [topPositive, topNegative] = isPaid
    ? await Promise.all([
        getFundingOutliers({ direction: 'positive', limit: 5, minOiUsd: 1_000_000 }),
        getFundingOutliers({ direction: 'negative', limit: 5, minOiUsd: 1_000_000 }),
      ])
    : [[], []]

  const venue = findVenue('hyperliquid')
  const tradeUrl = venue?.affiliateUrl ?? 'https://app.hyperliquid.xyz/'

  return (
    <main className="min-h-full bg-stone-50 text-stone-900">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        <header className="space-y-2">
          <div className="text-xs text-[#004225] tracking-wider">{'>'} PERPS · HYPERLIQUID</div>
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h1 className="text-3xl md:text-4xl font-bold">Hyperliquid perps</h1>
            <RefreshBadge isPaid={isPaid} fetchedAt={fetchedAt} />
          </div>
          <p className="text-sm text-stone-600 max-w-3xl">
            On-chain perpetual futures across {perps.length} markets. Up to 50× leverage.
            We surface where the open interest sits and what funding is paying — useful for
            value reads and crowd positioning, not settlement-style arbitrage.
          </p>
        </header>

        {!isPaid && <FreeTierBanner />}

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold tracking-wide text-stone-900">
              {isPaid ? 'All markets by open interest' : `Top ${FREE_TIER_TOP_N} by open interest`}
            </h2>
            <span className="text-xs text-stone-500">
              {visible.length} of {perps.length}
            </span>
          </div>
          <PerpsTable rows={visible} isPaid={isPaid} tradeUrl={tradeUrl} />
        </section>

        {isPaid && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FundingOutlierCard
              title="Crowded longs"
              subtitle="Highest funding APR — longs paying shorts. Often a contrarian short signal."
              rows={topPositive}
              tone="positive"
              tradeUrl={tradeUrl}
            />
            <FundingOutlierCard
              title="Crowded shorts"
              subtitle="Most negative funding — shorts paying longs. Often a contrarian long signal."
              rows={topNegative}
              tone="negative"
              tradeUrl={tradeUrl}
            />
          </section>
        )}

        <footer className="border-t border-stone-200 pt-4 text-[11px] text-stone-500 max-w-3xl">
          Hyperliquid is an on-chain perpetual futures exchange. Sneakers does not custody
          your funds — clicking through opens Hyperliquid&apos;s app where you trade with your
          own wallet. Perp futures carry liquidation risk; leverage amplifies losses as well
          as gains.
        </footer>
      </div>
    </main>
  )
}

function RefreshBadge({ isPaid, fetchedAt }: { isPaid: boolean; fetchedAt: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-stone-500">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          isPaid ? 'bg-emerald-500' : 'bg-stone-400'
        }`}
      />
      <span>{isPaid ? LIVE_REFRESH_LABEL : FREE_TIER_REFRESH_LABEL}</span>
      <span className="text-stone-400">· updated {fmtRefreshTs(fetchedAt)}</span>
    </div>
  )
}

function FreeTierBanner() {
  return (
    <div className="border border-emerald-200 bg-emerald-50 rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="text-sm text-stone-800">
        <span className="font-semibold text-emerald-900">15-minute delayed snapshot.</span>{' '}
        Pro unlocks live prices, the full 200+ market table, funding outliers, and search.
      </div>
      <Link
        href="/dashboard/billing"
        className="inline-block bg-[#004225] text-white text-xs font-semibold tracking-wider px-3 py-2 rounded hover:bg-[#003520] transition"
      >
        UPGRADE
      </Link>
    </div>
  )
}

interface TableProps {
  rows: HlPerp[]
  isPaid: boolean
  tradeUrl: string
}

function PerpsTable({ rows, isPaid, tradeUrl }: TableProps) {
  return (
    <div className="border border-stone-200 bg-white rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-600 text-[11px] tracking-wider">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">COIN</th>
              <th className="px-4 py-2.5 text-right font-semibold">MARK</th>
              <th className="px-4 py-2.5 text-right font-semibold">24H</th>
              {isPaid && (
                <>
                  <th className="px-4 py-2.5 text-right font-semibold">FUNDING APR</th>
                  <th className="px-4 py-2.5 text-right font-semibold">OI (USD)</th>
                  <th className="px-4 py-2.5 text-right font-semibold">VOLUME 24H</th>
                  <th className="px-4 py-2.5 text-right font-semibold">MAX LEV</th>
                </>
              )}
              <th className="px-4 py-2.5 text-right font-semibold w-28"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.coin}
                className="border-t border-stone-100 hover:bg-stone-50 transition"
              >
                <td className="px-4 py-2.5 font-semibold text-stone-900">{p.coin}</td>
                <td className="px-4 py-2.5 text-right font-mono text-stone-800">
                  {fmtUsdCompact(p.mark_px)}
                </td>
                <td className={`px-4 py-2.5 text-right font-mono ${pctClass(p.pct_24h)}`}>
                  {fmtPct(p.pct_24h)}
                </td>
                {isPaid && (
                  <>
                    <td className={`px-4 py-2.5 text-right font-mono ${pctClass(p.funding_apr)}`}>
                      {fmtPct(p.funding_apr)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-stone-700">
                      {fmtUsdCompact(p.open_interest_usd)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-stone-700">
                      {fmtUsdCompact(p.day_ntl_vlm)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-stone-500">
                      {p.max_leverage ?? '—'}×
                    </td>
                  </>
                )}
                <td className="px-4 py-2.5 text-right">
                  <a
                    href={tradeUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="inline-block text-[11px] tracking-wider font-semibold text-[#004225] border border-[#004225]/30 px-2.5 py-1 rounded hover:bg-[#004225] hover:text-white transition"
                  >
                    TRADE →
                  </a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={isPaid ? 8 : 4}
                  className="px-4 py-12 text-center text-stone-500 text-sm"
                >
                  No markets to display.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FundingOutlierCard({
  title,
  subtitle,
  rows,
  tone,
  tradeUrl,
}: {
  title: string
  subtitle: string
  rows: HlPerp[]
  tone: 'positive' | 'negative'
  tradeUrl: string
}) {
  const toneClass = tone === 'positive' ? 'text-emerald-700' : 'text-red-700'
  return (
    <div className="border border-stone-200 bg-white rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100">
        <div className="text-sm font-semibold text-stone-900">{title}</div>
        <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-600 text-[11px] tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">COIN</th>
              <th className="px-4 py-2 text-right font-semibold">FUNDING APR</th>
              <th className="px-4 py-2 text-right font-semibold">MARK</th>
              <th className="px-4 py-2 text-right font-semibold">OI</th>
              <th className="px-4 py-2 text-right font-semibold w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-500 text-xs">
                  No markets above the OI floor.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.coin} className="border-t border-stone-100">
                  <td className="px-4 py-2 font-semibold text-stone-900">{p.coin}</td>
                  <td className={`px-4 py-2 text-right font-mono ${toneClass}`}>
                    {fmtPct(p.funding_apr)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-stone-700">
                    {fmtUsdCompact(p.mark_px)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-stone-700">
                    {fmtUsdCompact(p.open_interest_usd)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <a
                      href={tradeUrl}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="inline-block text-[10px] tracking-wider font-semibold text-[#004225] hover:underline"
                    >
                      TRADE →
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
