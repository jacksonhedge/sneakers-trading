import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAuthClient } from '@/lib/supabase-auth'
import { loadMinuteMarkets, type MinuteMarket, type MinuteGroup } from '@/lib/minute-markets'
import { AutoRefresh } from './auto-refresh'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Minute Markets — Sneakers Terminal' }

interface PageProps {
  searchParams: Promise<{ within?: string; asset?: string }>
}

function fmtMinutes(m: number): string {
  if (m < 1) return `${Math.max(0, Math.round(m * 60))}s`
  if (m < 60) return `${m.toFixed(1)}m`
  const h = Math.floor(m / 60)
  const rem = Math.round(m - h * 60)
  return `${h}h ${rem}m`
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

function fmtAsk(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—'
  return p.toFixed(3)
}

function fmtChange(c: number | null, samples: number): string {
  if (c == null || samples < 2) return '—'
  const sign = c > 0 ? '+' : ''
  return `${sign}${(c * 100).toFixed(2)}pp`
}

function changeColor(c: number | null): string {
  if (c == null) return 'text-stone-500'
  if (c > 0.005) return 'text-emerald-400'
  if (c < -0.005) return 'text-red-400'
  return 'text-stone-400'
}

function platformDot(p: string): string {
  // Distinct color per platform so the strike ladder reads visually.
  switch (p) {
    case 'limitless': return 'bg-fuchsia-400'
    case 'og': return 'bg-amber-400'
    case 'kalshi': return 'bg-cyan-400'
    case 'polymarket': return 'bg-violet-400'
    default: return 'bg-stone-400'
  }
}

function GroupCard({ group }: { group: MinuteGroup }) {
  const yesAskOf = (m: MinuteMarket) => {
    // AMM platforms (Limitless) emit "Yes"/"No"; OG emits "YES X"/"NO X".
    // For the ladder we only care about the YES side ask. Try a few patterns.
    const yes = m.outcomes.find((o) => /^yes\b|\byes\s/i.test(o.name))
    return yes?.best_ask ?? m.outcomes[0]?.best_ask ?? null
  }

  return (
    <div className="border border-stone-800 bg-stone-950 rounded">
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <span className="font-mono text-emerald-400 text-sm font-bold">{group.asset ?? '—'}</span>
          <span className="text-stone-500 text-xs">resolves in</span>
          <span className="font-mono text-stone-100 text-sm font-semibold">
            {fmtMinutes(group.minutes_to_resolve)}
          </span>
          <span className="text-stone-600 text-xs">·</span>
          <span className="font-mono text-stone-400 text-xs">
            {new Date(group.resolves_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} UTC
          </span>
        </div>
        <div className="flex items-center gap-2">
          {group.platforms.map((p) => (
            <span key={p} className="flex items-center gap-1 text-xs">
              <span className={`w-2 h-2 rounded-full ${platformDot(p)}`} />
              <span className="font-mono text-stone-400">{p}</span>
            </span>
          ))}
          <span className="text-stone-600 text-xs">·</span>
          <span className="font-mono text-stone-400 text-xs">{group.market_count} strikes</span>
        </div>
      </div>
      <table className="w-full font-mono text-xs">
        <thead className="text-stone-500 border-b border-stone-800">
          <tr>
            <th className="text-left  px-3 py-1.5 font-normal">platform</th>
            <th className="text-right px-3 py-1.5 font-normal">strike</th>
            <th className="text-left  px-3 py-1.5 font-normal">dir</th>
            <th className="text-right px-3 py-1.5 font-normal">yes</th>
            <th className="text-right px-3 py-1.5 font-normal">Δ5m</th>
            <th className="text-right px-3 py-1.5 font-normal">vol</th>
          </tr>
        </thead>
        <tbody>
          {group.markets.map((m) => {
            const ask = yesAskOf(m)
            return (
              <tr key={`${m.platform}:${m.market_id}`} className="border-b border-stone-900 hover:bg-stone-900/50">
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${platformDot(m.platform)}`} />
                    <span className="text-stone-300">{m.platform}</span>
                  </span>
                </td>
                <td className="text-right px-3 py-1.5 text-stone-200 tabular-nums">
                  {m.strike != null ? `$${m.strike.toLocaleString()}` : '—'}
                </td>
                <td className="text-left px-3 py-1.5 text-stone-400">{m.direction ?? '—'}</td>
                <td className="text-right px-3 py-1.5 text-emerald-300 tabular-nums">{fmtAsk(ask)}</td>
                <td className={`text-right px-3 py-1.5 tabular-nums ${changeColor(m.change_5m)}`}>
                  {fmtChange(m.change_5m, m.movement_samples)}
                </td>
                <td className="text-right px-3 py-1.5 text-stone-400 tabular-nums">{fmtMoney(m.volume)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default async function MinuteMarketsPage({ searchParams }: PageProps) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/login')

  const sp = await searchParams
  const withinNum = parseInt(sp.within ?? '60', 10)
  const within = Number.isFinite(withinNum) ? Math.min(240, Math.max(5, withinNum)) : 60
  const asset = sp.asset?.toUpperCase() ?? null

  const result = await loadMinuteMarkets({ within, asset, grouped: true, cryptoOnly: true })
  const groups = result.groups ?? []

  const lastScrape = result.lastUpdated
    ? `${Math.round((Date.now() - new Date(result.lastUpdated).getTime()) / 1000)}s ago`
    : 'never'

  return (
    <>
      {/* Auto-refresh every 15s via router.refresh() in a tiny client component.
          Replaces <meta http-equiv="refresh"> which would steal in-flight clicks
          on the asset/window filters. AutoRefresh re-fetches data without
          touching the URL or scroll position. */}
      <AutoRefresh intervalMs={15000} />
      <div className="min-h-screen bg-stone-950 text-stone-100 font-sans">
        <header className="border-b border-stone-800 px-6 py-4 sticky top-0 bg-stone-950 z-10">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-4">
              <h1 className="text-lg font-mono font-bold tracking-wider text-emerald-400">
                MINUTE MARKETS
              </h1>
              <Link href="/dashboard" className="font-mono text-xs text-stone-500 hover:text-stone-300">
                ← dashboard
              </Link>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-stone-500">
              <span>last scrape: <span className="text-stone-300">{lastScrape}</span></span>
              <span>auto-refresh: 15s</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs font-mono">
            <span className="text-stone-500 mr-1">window:</span>
            {[5, 15, 30, 60, 120, 240].map((n) => {
              const active = within === n
              const href = (() => {
                const p = new URLSearchParams()
                if (n !== 60) p.set('within', String(n))
                if (asset) p.set('asset', asset)
                const qs = p.toString()
                return qs ? `?${qs}` : '/dashboard/minute'
              })()
              return (
                <Link
                  key={n}
                  href={href}
                  className={`px-2 py-0.5 border ${active ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-stone-700 text-stone-400 hover:text-stone-200 hover:border-stone-500'}`}
                >
                  {n < 60 ? `${n}m` : `${n / 60}h`}
                </Link>
              )
            })}
            <span className="text-stone-700 mx-2">·</span>
            <span className="text-stone-500 mr-1">asset:</span>
            {[null, 'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', ...result.assetsAvailable.filter((a) => !['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'].includes(a))].slice(0, 12).map((a) => {
              const active = asset === a || (asset === null && a === null)
              const href = (() => {
                const p = new URLSearchParams()
                if (within !== 60) p.set('within', String(within))
                if (a) p.set('asset', a)
                const qs = p.toString()
                return qs ? `?${qs}` : '/dashboard/minute'
              })()
              return (
                <Link
                  key={a ?? 'all'}
                  href={href}
                  className={`px-2 py-0.5 border ${active ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-stone-700 text-stone-400 hover:text-stone-200 hover:border-stone-500'}`}
                >
                  {a ?? 'all'}
                </Link>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs font-mono text-stone-500">
            <span>{result.totalMarkets} markets</span>
            <span>·</span>
            <span>{result.totalGroups ?? 0} groups</span>
            <span>·</span>
            <span>5m: <span className="text-stone-300">{result.bucketCounts['5m']}</span></span>
            <span>15m: <span className="text-stone-300">{result.bucketCounts['15m']}</span></span>
            <span>30m: <span className="text-stone-300">{result.bucketCounts['30m']}</span></span>
            <span>60m: <span className="text-stone-300">{result.bucketCounts['60m']}</span></span>
          </div>
        </header>

        <main className="px-6 py-4 space-y-3">
          {groups.length === 0 ? (
            <div className="border border-stone-800 bg-stone-950 rounded p-8 text-center">
              <div className="font-mono text-stone-400 mb-1">no minute markets in window</div>
              <div className="font-mono text-xs text-stone-500">
                Either nothing is currently resolving in the next {within}m, or the scrape data is stale
                (last: {lastScrape}). The /tmp/scrape-minute-loop.sh background job pulls Limitless + OG
                every 75s — running it should populate this view within ~2 minutes.
              </div>
            </div>
          ) : (
            groups.map((g) => <GroupCard key={`${g.asset}:${g.resolves_at}`} group={g} />)
          )}
        </main>
      </div>
    </>
  )
}
