import Link from 'next/link'
import {
  loadAllLatestSnapshots,
  type MarketSnapshot,
  type MarketPhase,
} from '@/lib/markets-data'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    platform?: string
    sport?: string
    phase?: string
    flag?: string
    q?: string
    sort?: string
  }>
}

// Admin market catalog — distinct from /admin/scrapers (scraper health) and
// /markets (user-facing browse). This page surfaces:
//   • The raw catalog with platform_market_id visible (for reverse-lookup)
//   • Stale rows (NOT filtered out — admin needs to see freshness gaps)
//   • Data-quality flags: wide overround, missing strike, no prices, etc.
//   • Per-row link to /dashboard/markets/[platform]/[id] for deep inspection
//
// Read path is the same loadAllLatestSnapshots() the user-facing /markets uses,
// so any quirk we see here matches what users see (just unfiltered).

const STALE_AFTER_MIN = 30 // rows older than this earn a STALE badge

interface MarketRow extends MarketSnapshot {
  ageMin: number | null
  flags: string[]
  yesAsk: number | null
}

function ageMinutes(ts: string | undefined): number | null {
  if (!ts) return null
  const ms = Date.now() - new Date(ts).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return ms / 60_000
}

function fmtAge(min: number | null): string {
  if (min == null) return '—'
  if (min < 1) return `${Math.round(min * 60)}s`
  if (min < 60) return `${Math.round(min)}m`
  if (min < 1440) return `${Math.round(min / 60)}h`
  return `${Math.round(min / 1440)}d`
}

function fmtNum(v: number | string | null | undefined): string {
  if (v == null) return '—'
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}

function fmtAsk(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—'
  return p.toFixed(3)
}

function pickYesAsk(s: MarketSnapshot): number | null {
  // Try Yes outcome first; fall back to first outcome (handles "above/below"
  // shapes from OG and AMM Yes/No pairs from Limitless).
  const yes = s.outcomes.find((o) => /^yes\b|\byes\s/i.test(o.name)) ?? s.outcomes[0]
  return yes?.best_ask ?? null
}

function deriveFlags(s: MarketSnapshot): string[] {
  const flags: string[] = []
  if (s.overround != null && s.overround > 1.1) flags.push('WIDE')
  if (s.outcomes.length === 0) flags.push('NO_OUTCOMES')
  else if (!s.outcomes.some((o) => o.best_ask != null)) flags.push('NO_PRICE')
  if (s.outcomes.some((o) => o.best_ask != null && (o.best_ask < 0 || o.best_ask > 1))) {
    flags.push('BAD_PRICE')
  }
  if (!s.resolves_at) flags.push('NO_RESOLVE')
  if (typeof s.volume_traded === 'number' && s.volume_traded === 0) flags.push('ZERO_VOL')
  return flags
}

function flagBadge(flag: string) {
  const colors: Record<string, string> = {
    STALE: 'bg-amber-100 text-amber-800 ring-amber-300',
    WIDE: 'bg-orange-100 text-orange-800 ring-orange-300',
    NO_PRICE: 'bg-red-100 text-red-800 ring-red-300',
    NO_OUTCOMES: 'bg-red-100 text-red-800 ring-red-300',
    BAD_PRICE: 'bg-red-100 text-red-800 ring-red-300',
    NO_RESOLVE: 'bg-stone-100 text-stone-700 ring-stone-300',
    ZERO_VOL: 'bg-stone-100 text-stone-600 ring-stone-200',
  }
  const cls = colors[flag] ?? 'bg-stone-100 text-stone-700 ring-stone-300'
  return (
    <span
      key={flag}
      className={`text-[9px] tracking-wider font-bold px-1.5 py-0.5 rounded ring-1 ${cls}`}
    >
      {flag}
    </span>
  )
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-[10px] text-stone-400 tracking-wider">{label.toUpperCase()}</div>
      <div className="text-2xl font-bold text-stone-900 tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-stone-500 mt-1">{sub}</div>}
    </div>
  )
}

function FilterChip({
  label,
  active,
  href,
}: {
  label: string
  active: boolean
  href: string
}) {
  return (
    <Link
      href={href}
      className={`text-[11px] px-2 py-0.5 rounded ring-1 transition tabular-nums ${
        active
          ? 'bg-[#00703c] text-white ring-[#00703c]'
          : 'bg-white text-stone-700 ring-stone-300 hover:ring-stone-500'
      }`}
    >
      {label}
    </Link>
  )
}

export default async function AdminMarketsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const platformF = sp.platform?.toLowerCase().trim() || null
  const sportF = sp.sport?.toLowerCase().trim() || null
  const phaseF = (sp.phase as MarketPhase | undefined) ?? null
  const flagF = sp.flag?.toUpperCase().trim() || null
  const q = sp.q?.trim().toLowerCase() ?? ''
  const sort = sp.sort ?? 'fresh'

  const { snapshots, perPlatform, latestDate } = await loadAllLatestSnapshots()

  // Build enriched rows once.
  const allRows: MarketRow[] = snapshots.map((s) => {
    const ageMin = ageMinutes(s.ts)
    const flags = deriveFlags(s)
    if (ageMin != null && ageMin > STALE_AFTER_MIN) flags.unshift('STALE')
    return { ...s, ageMin, flags, yesAsk: pickYesAsk(s) }
  })

  // Headline metrics (over ALL rows, not filtered — gives the operator the
  // total-state picture before they apply filters).
  const totalAll = allRows.length
  const staleCount = allRows.filter((r) => r.flags.includes('STALE')).length
  const wideCount = allRows.filter((r) => r.flags.includes('WIDE')).length
  const noPriceCount = allRows.filter(
    (r) => r.flags.includes('NO_PRICE') || r.flags.includes('NO_OUTCOMES'),
  ).length

  // Apply filters.
  let rows = allRows
  if (platformF) rows = rows.filter((r) => r.platform === platformF)
  if (sportF) rows = rows.filter((r) => (r.sport ?? '').toLowerCase() === sportF)
  if (phaseF) rows = rows.filter((r) => r.phase === phaseF)
  if (flagF) rows = rows.filter((r) => r.flags.includes(flagF))
  if (q) {
    rows = rows.filter(
      (r) =>
        r.question.toLowerCase().includes(q) ||
        r.platform_market_id.toLowerCase().includes(q),
    )
  }

  // Sort.
  rows = rows.slice().sort((a, b) => {
    switch (sort) {
      case 'volume': {
        const av = typeof a.volume_traded === 'number' ? a.volume_traded : 0
        const bv = typeof b.volume_traded === 'number' ? b.volume_traded : 0
        return bv - av
      }
      case 'overround':
        return (b.overround ?? 0) - (a.overround ?? 0)
      case 'flags':
        return b.flags.length - a.flags.length
      case 'stale':
        return (b.ageMin ?? 0) - (a.ageMin ?? 0)
      case 'fresh':
      default:
        return (a.ageMin ?? Infinity) - (b.ageMin ?? Infinity)
    }
  })

  // Cap to 200 rows in DOM. Admin can drill down via filters; rendering 60k
  // DOM nodes for a single SSR pass is wasteful and the page becomes unusable.
  const visible = rows.slice(0, 200)

  const availablePlatforms = [...new Set(allRows.map((r) => r.platform))].sort()
  const availableSports = [
    ...new Set(allRows.map((r) => r.sport).filter((s): s is string => !!s)),
  ].sort()

  const buildHref = (next: Partial<typeof sp>) => {
    const params = new URLSearchParams()
    const merged = { ...sp, ...next }
    for (const [k, v] of Object.entries(merged)) {
      if (typeof v === 'string' && v) params.set(k, v)
    }
    const qs = params.toString()
    return qs ? `/markets?${qs}` : '/markets'
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} ADMIN</div>
        <h1 className="text-2xl font-bold text-stone-900">Markets Catalog</h1>
        <p className="text-sm text-stone-600 mt-1">
          All scraped markets across every platform. Stale rows are NOT hidden —
          freshness is shown via the AGE column and STALE badge. Distinct from{' '}
          <Link href="/scrapers" className="underline">/scrapers</Link> which is about
          scraper-health (rows-on-disk, last-write-time).
          {latestDate && <span className="ml-1 text-stone-500">Latest data file: {latestDate}.</span>}
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total markets"
          value={totalAll.toLocaleString()}
          sub={`${availablePlatforms.length} platforms`}
        />
        <MetricCard
          label="Stale"
          value={staleCount.toLocaleString()}
          sub={`>${STALE_AFTER_MIN}m since last scrape`}
        />
        <MetricCard
          label="Wide overround"
          value={wideCount.toLocaleString()}
          sub=">110% on at least one side"
        />
        <MetricCard
          label="No price"
          value={noPriceCount.toLocaleString()}
          sub="missing best_ask / no outcomes"
        />
      </div>

      {/* Filter strip */}
      <section className="space-y-2">
        <div className="text-[10px] text-stone-400 tracking-wider">PLATFORM</div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="all" active={!platformF} href={buildHref({ platform: '' })} />
          {availablePlatforms.map((p) => {
            const count = allRows.filter((r) => r.platform === p).length
            return (
              <FilterChip
                key={p}
                label={`${p} ${count}`}
                active={platformF === p}
                href={buildHref({ platform: p })}
              />
            )
          })}
        </div>

        <div className="text-[10px] text-stone-400 tracking-wider mt-3">PHASE</div>
        <div className="flex flex-wrap gap-1.5">
          {(['', 'opening', 'pre_game', 'live', 'closed'] as const).map((p) => (
            <FilterChip
              key={p || 'any'}
              label={p || 'any'}
              active={phaseF === (p || null)}
              href={buildHref({ phase: p })}
            />
          ))}
        </div>

        <div className="text-[10px] text-stone-400 tracking-wider mt-3">FLAG</div>
        <div className="flex flex-wrap gap-1.5">
          {['', 'STALE', 'WIDE', 'NO_PRICE', 'BAD_PRICE', 'NO_RESOLVE', 'ZERO_VOL'].map((f) => (
            <FilterChip
              key={f || 'any'}
              label={f || 'any'}
              active={flagF === (f || null)}
              href={buildHref({ flag: f })}
            />
          ))}
        </div>

        <div className="text-[10px] text-stone-400 tracking-wider mt-3">SORT</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            ['fresh', 'freshest first'],
            ['stale', 'stalest first'],
            ['volume', 'volume desc'],
            ['overround', 'overround desc'],
            ['flags', 'most-flagged first'],
          ].map(([key, label]) => (
            <FilterChip
              key={key}
              label={label}
              active={sort === key}
              href={buildHref({ sort: key })}
            />
          ))}
        </div>

        <form className="flex gap-2 mt-3 max-w-md" action="/markets">
          {/* Persist active filters across the search submit */}
          {platformF && <input type="hidden" name="platform" value={platformF} />}
          {sportF && <input type="hidden" name="sport" value={sportF} />}
          {phaseF && <input type="hidden" name="phase" value={phaseF} />}
          {flagF && <input type="hidden" name="flag" value={flagF} />}
          {sort && <input type="hidden" name="sort" value={sort} />}
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="search question or platform_market_id…"
            className="flex-1 px-3 py-1.5 text-xs font-mono border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-[#00703c]"
          />
          <button
            type="submit"
            className="text-xs px-3 py-1.5 rounded bg-stone-900 text-white hover:bg-stone-700 transition tracking-wider"
          >
            SEARCH
          </button>
          {q && (
            <Link
              href={buildHref({ q: '' })}
              className="text-xs px-3 py-1.5 rounded ring-1 ring-stone-300 text-stone-700 hover:ring-stone-500"
            >
              clear
            </Link>
          )}
        </form>

        {availableSports.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] text-stone-400 tracking-wider mb-1">SPORT (top 12)</div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="all" active={!sportF} href={buildHref({ sport: '' })} />
              {availableSports.slice(0, 12).map((s) => (
                <FilterChip
                  key={s}
                  label={s}
                  active={sportF === s}
                  href={buildHref({ sport: s })}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Result summary line */}
      <div className="text-xs text-stone-500 font-mono flex items-baseline gap-3">
        <span>
          {rows.length.toLocaleString()} matching · showing {visible.length.toLocaleString()}
        </span>
        {rows.length > visible.length && (
          <span className="text-amber-700">
            (capped at 200; refine filters to see more specific subset)
          </span>
        )}
      </div>

      {/* Catalog table */}
      <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1000px]">
            <thead className="bg-stone-50 text-[10px] text-stone-400 tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">QUESTION</th>
                <th className="text-left px-3 py-2">PLATFORM / ID</th>
                <th className="text-left px-3 py-2">SPORT</th>
                <th className="text-right px-3 py-2">YES ASK</th>
                <th className="text-right px-3 py-2">OVERROUND</th>
                <th className="text-right px-3 py-2">VOLUME</th>
                <th className="text-left px-3 py-2">PHASE</th>
                <th className="text-right px-3 py-2">AGE</th>
                <th className="text-left px-3 py-2">FLAGS</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-sm text-stone-500">
                    No markets match these filters.
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const detailHref = `/dashboard/markets/${encodeURIComponent(r.platform)}/${encodeURIComponent(r.platform_market_id)}`
                  const isStale = r.flags.includes('STALE')
                  return (
                    <tr
                      key={`${r.platform}:${r.platform_market_id}`}
                      className={`border-t border-stone-100 hover:bg-stone-50 ${isStale ? 'bg-amber-50/40' : ''}`}
                    >
                      <td className="px-3 py-1.5 max-w-[280px]">
                        <Link href={detailHref} className="text-stone-900 hover:underline truncate block" title={r.question}>
                          {r.question}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 font-mono">
                        <div className="text-stone-900">{r.platform}</div>
                        <div className="text-[10px] text-stone-500 truncate max-w-[160px]" title={r.platform_market_id}>
                          {r.platform_market_id}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-stone-600">{r.sport ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                        {fmtAsk(r.yesAsk)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-stone-700">
                        {r.overround != null ? `${(r.overround * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-stone-600">
                        {fmtNum(r.volume_traded)}
                      </td>
                      <td className="px-3 py-1.5 text-stone-600 capitalize">{r.phase}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-stone-500">
                        {fmtAge(r.ageMin)}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex flex-wrap gap-0.5">
                          {r.flags.length === 0 ? (
                            <span className="text-stone-400 text-[10px]">ok</span>
                          ) : (
                            r.flags.map((f) => flagBadge(f))
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[11px] text-stone-500 pt-4 border-t border-stone-200 space-y-1">
        <div>
          Click any question to open <code className="bg-stone-100 px-1 rounded text-[10px]">/dashboard/markets/&lt;platform&gt;/&lt;id&gt;</code> for the full single-market detail view (charts, history, trade panel).
        </div>
        <div>
          Per-platform freshness summary lives at{' '}
          <Link href="/scrapers" className="underline">/scrapers</Link>; this view is the row-level catalog.
          Per-platform totals from the loader: {Object.entries(perPlatform)
            .map(([p, v]) => `${p}=${v.count}`)
            .join(' · ')}.
        </div>
      </div>
    </div>
  )
}
