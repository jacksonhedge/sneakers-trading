import { getAllHlPerps, getFundingOutliers, type HlPerp } from '@/lib/hyperliquid-data'
import { RollingNumber } from '@/components/rolling-number'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Hyperliquid signals — Admin — Sneakers Terminal',
}

function fmtUsd(n: number | null, opts?: { compact?: boolean }): string {
  if (n == null) return '—'
  if (opts?.compact) {
    const abs = Math.abs(n)
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
    return `$${n.toFixed(2)}`
  }
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function fmtPct(n: number | null): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(2)}%`
}

function fmtTs(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function pctClass(n: number | null): string {
  if (n == null || n === 0) return 'text-stone-600'
  return n > 0 ? 'text-emerald-700' : 'text-red-700'
}

export default async function AdminHlPage() {
  const { perps, fetchedAt, fromCache } = await getAllHlPerps()
  const [topPositive, topNegative] = await Promise.all([
    getFundingOutliers({ direction: 'positive', limit: 10, minOiUsd: 1_000_000 }),
    getFundingOutliers({ direction: 'negative', limit: 10, minOiUsd: 1_000_000 }),
  ])
  const topOi = perps
    .filter((p) => p.open_interest_usd != null)
    .sort((a, b) => (b.open_interest_usd ?? 0) - (a.open_interest_usd ?? 0))
    .slice(0, 10)

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">
          {'>'} HYPERLIQUID — PERPS SIGNALS
        </div>
        <h1 className="text-2xl font-bold text-stone-900">
          Live perpetuals state
        </h1>
        <p className="text-sm text-stone-600 mt-1 max-w-3xl">
          Direct-from-API snapshot of all {perps.length} Hyperliquid perps. Cached 30s
          server-side. Used by O&apos;Toole&apos;s
          <code className="bg-stone-100 px-1 mx-1">get_hl_perp</code> and
          <code className="bg-stone-100 px-1 mx-1">get_hl_funding_outliers</code>
          tools to supply analytical context on funding pressure and crowd positioning.
          Hyperliquid is a perp DEX — useful for value/positioning reads, not for
          settlement-style arbitrage.
        </p>
        <div className="text-[11px] text-stone-500 mt-2">
          fetched {fmtTs(fetchedAt)}
          {fromCache && ' · from cache'}
        </div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FundingTable
          title="Crowded longs (highest funding)"
          subtitle="longs paying shorts — contrarian short signal"
          rows={topPositive}
          signClass="text-emerald-700"
        />
        <FundingTable
          title="Crowded shorts (lowest funding)"
          subtitle="shorts paying longs — contrarian long signal"
          rows={topNegative}
          signClass="text-red-700"
        />
      </section>

      <section>
        <h2 className="text-sm font-bold text-stone-800 tracking-wider mb-1">
          TOP OI (USD)
        </h2>
        <p className="text-[11px] text-stone-500 mb-2">
          Where the dollars actually sit. Big OI + extreme funding = a real
          positioning story; small OI + extreme funding = noise.
        </p>
        <div className="border border-stone-300 bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-100 text-stone-600 tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">COIN</th>
                <th className="px-3 py-2 text-right">MARK</th>
                <th className="px-3 py-2 text-right">24H %</th>
                <th className="px-3 py-2 text-right">FUND APR</th>
                <th className="px-3 py-2 text-right">OI USD</th>
                <th className="px-3 py-2 text-right">VLM 24H</th>
                <th className="px-3 py-2 text-right">MAX LEV</th>
              </tr>
            </thead>
            <tbody>
              {topOi.map((p) => (
                <tr key={p.coin} className="border-t border-stone-200">
                  <td className="px-3 py-1.5 font-semibold">{p.coin}</td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {p.mark_px == null ? (
                      '—'
                    ) : (
                      <RollingNumber
                        value={p.mark_px}
                        format={(n) => fmtUsd(n, { compact: true })}
                        flashScale={Math.max(0.01, p.mark_px * 0.005)}
                        ariaLabel={`${p.coin} mark ${fmtUsd(p.mark_px, { compact: true })}`}
                      />
                    )}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${pctClass(p.pct_24h)}`}>
                    {p.pct_24h == null ? (
                      '—'
                    ) : (
                      <RollingNumber
                        value={p.pct_24h}
                        format={fmtPct}
                        flashScale={0.005}
                        ariaLabel={`${p.coin} 24h change ${fmtPct(p.pct_24h)}`}
                      />
                    )}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${pctClass(p.funding_apr)}`}>
                    {p.funding_apr == null ? (
                      '—'
                    ) : (
                      <RollingNumber
                        value={p.funding_apr}
                        format={fmtPct}
                        flashScale={0.05}
                        ariaLabel={`${p.coin} funding APR ${fmtPct(p.funding_apr)}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {fmtUsd(p.open_interest_usd, { compact: true })}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {fmtUsd(p.day_ntl_vlm, { compact: true })}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-stone-500">
                    {p.max_leverage ?? '—'}×
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-stone-200 pt-4 text-[11px] text-stone-500">
        <div className="font-semibold text-stone-600 tracking-wider mb-1">
          {'>'} NEXT
        </div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Spot + HIP-3 builder-deployed markets (separate API calls; not yet wired)</li>
          <li>1h / 24h OI delta — needs scraper backfill (run <code className="bg-stone-100 px-1">pnpm scrape:hyperliquid</code> on a cron)</li>
          <li>Liquidation feed via WebSocket (separate workstream)</li>
          <li>Cross-venue narrative diff: HL perp move vs Polymarket / Kalshi for the same underlying</li>
        </ul>
      </section>
    </div>
  )
}

function FundingTable({
  title,
  subtitle,
  rows,
  signClass,
}: {
  title: string
  subtitle: string
  rows: HlPerp[]
  signClass: string
}) {
  return (
    <div>
      <h2 className="text-sm font-bold text-stone-800 tracking-wider mb-1">
        {title.toUpperCase()}
      </h2>
      <p className="text-[11px] text-stone-500 mb-2">{subtitle}</p>
      <div className="border border-stone-300 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-100 text-stone-600 tracking-wider text-[10px]">
            <tr>
              <th className="px-3 py-2 text-left">COIN</th>
              <th className="px-3 py-2 text-right">FUND APR</th>
              <th className="px-3 py-2 text-right">MARK</th>
              <th className="px-3 py-2 text-right">OI USD</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-stone-500">
                  no rows above OI floor
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.coin} className="border-t border-stone-200">
                  <td className="px-3 py-1.5 font-semibold">{p.coin}</td>
                  <td className={`px-3 py-1.5 text-right font-mono ${signClass}`}>
                    {p.funding_apr == null ? (
                      '—'
                    ) : (
                      <RollingNumber
                        value={p.funding_apr}
                        format={fmtPct}
                        flashScale={0.05}
                        ariaLabel={`${p.coin} funding APR ${fmtPct(p.funding_apr)}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {p.mark_px == null ? (
                      '—'
                    ) : (
                      <RollingNumber
                        value={p.mark_px}
                        format={(n) => fmtUsd(n, { compact: true })}
                        flashScale={Math.max(0.01, p.mark_px * 0.005)}
                        ariaLabel={`${p.coin} mark ${fmtUsd(p.mark_px, { compact: true })}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {fmtUsd(p.open_interest_usd, { compact: true })}
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
