import Link from 'next/link'
import { getTierIdentity } from '@/lib/require-tier'
import {
  loadMinuteMarkets,
  type Bucket,
  type MinuteMarket,
  type MinuteGroup,
} from '@/lib/minute-markets'
import { findVenue } from '@/lib/venues'
import { RollingNumber } from '@/components/rolling-number'

// Quick markets — consumer surface for short-duration prediction markets
// (≤ 60 min to resolution). Same data as /dashboard/minute, different
// audience: shoppable, big TRADE buttons, no terminal styling.
//
// Move B (round-up journeys) plugs into this surface — each round-up
// becomes a journey that deploys legs into these same markets. For now
// it's pure discovery + affiliate routing.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Quick markets — Sneakers Terminal' }

const FREE_TIER_DEFAULT_BUCKET: Bucket = '15m'
const ALL_BUCKETS: Bucket[] = ['5m', '15m', '30m', '60m']

interface PageProps {
  searchParams: Promise<{ b?: string; asset?: string }>
}

function fmtCountdown(minutes: number): string {
  if (minutes < 1) return `${Math.max(0, Math.round(minutes * 60))}s`
  if (minutes < 60) return `${minutes.toFixed(1)}m`
  const h = Math.floor(minutes / 60)
  const rem = Math.round(minutes - h * 60)
  return `${h}h ${rem}m`
}

function fmtAskCents(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—'
  return `${Math.round(p * 100)}¢`
}

function fmtDollarStrike(s: number | null): string {
  if (s == null) return '—'
  if (s >= 1000) return `$${(s / 1000).toFixed(s % 1000 === 0 ? 0 : 2)}k`
  return `$${s.toLocaleString()}`
}

function fmtChangePp(c: number | null, samples: number): string {
  if (c == null || samples < 2) return ''
  const sign = c > 0 ? '+' : ''
  return `${sign}${(c * 100).toFixed(1)}pp`
}

function changeClass(c: number | null): string {
  if (c == null) return 'text-stone-400'
  if (c > 0.005) return 'text-emerald-700'
  if (c < -0.005) return 'text-red-700'
  return 'text-stone-500'
}

function bucketColor(b: Bucket | null): string {
  switch (b) {
    case '5m':
      return 'bg-red-100 text-red-700'
    case '15m':
      return 'bg-amber-100 text-amber-800'
    case '30m':
      return 'bg-emerald-100 text-emerald-800'
    default:
      return 'bg-stone-100 text-stone-600'
  }
}

// Derive the YES side ask from the market's outcomes. Limitless emits
// "Yes"/"No"; OG emits "YES X"/"NO X"; Kalshi/Polymarket emit the contract
// name. Falls back to outcomes[0] which works for AMM markets where the
// first outcome is canonically YES.
function yesAsk(m: MinuteMarket): number | null {
  const yes = m.outcomes.find((o) => /^yes\b|\byes\s/i.test(o.name))
  return yes?.best_ask ?? m.outcomes[0]?.best_ask ?? null
}

function venueLabel(platform: string): string {
  const v = findVenue(platform)
  return v?.name ?? platform
}

function tradeUrlFor(platform: string): string {
  const v = findVenue(platform)
  return v?.affiliateUrl ?? `https://${platform}.com`
}

export default async function QuickMarketsPage({ searchParams }: PageProps) {
  const me = await getTierIdentity()
  const isPaid = me.tier !== 'free'
  const sp = await searchParams

  const requestedBucket = (sp.b ?? '').toLowerCase() as Bucket | ''
  const bucket: Bucket = ALL_BUCKETS.includes(requestedBucket as Bucket)
    ? (requestedBucket as Bucket)
    : isPaid
      ? '15m'
      : FREE_TIER_DEFAULT_BUCKET
  const asset = isPaid ? (sp.asset?.toUpperCase() || null) : null

  // Load the full 60m window once; bucket filter applies post-load so the
  // user sees what's in their picked window without re-querying.
  const result = await loadMinuteMarkets({
    within: 60,
    asset,
    grouped: true,
    cryptoOnly: true,
  })

  const allGroups = result.groups ?? []
  const groups = allGroups
    .map((g) => ({ ...g, markets: g.markets.filter((m) => m.bucket === bucket) }))
    .filter((g) => g.markets.length > 0)

  return (
    <main className="min-h-full bg-gradient-to-b from-stone-50 via-stone-50 to-white text-stone-900">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-bold tracking-tight">Resolves in minutes</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          </div>
          <span className="text-[11px] text-stone-500 font-mono tabular-nums">
            {result.totalMarkets} strikes · {result.totalGroups ?? 0} events
          </span>
        </header>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <BucketFilter active={bucket} asset={asset} />
          {isPaid && (
            <AssetFilter
              active={asset}
              available={result.assetsAvailable}
              bucket={bucket}
            />
          )}
        </div>

        {!isPaid && <AutoTradeBanner />}

        <section className="space-y-3">
          {groups.length === 0 ? (
            <EmptyState bucket={bucket} />
          ) : (
            groups.map((g) => <GroupCard key={`${g.asset}:${g.resolves_at}`} group={g} isPaid={isPaid} />)
          )}
        </section>

        <footer className="border-t border-stone-200 pt-5 text-[11px] text-stone-500 max-w-3xl leading-relaxed">
          Sneakers does not custody your funds. Trading on these markets happens on the
          venue you click through to, with your own wallet or account. Short-duration
          markets resolve fast and can lose 100% of stake in minutes — only stake what you
          can afford to lose.
        </footer>
      </div>
    </main>
  )
}

function BucketFilter({ active, asset }: { active: Bucket; asset: string | null }) {
  const buildHref = (b: Bucket) => {
    const params = new URLSearchParams()
    if (b !== '15m') params.set('b', b)
    if (asset) params.set('asset', asset)
    const qs = params.toString()
    return qs ? `/dashboard/quick?${qs}` : '/dashboard/quick'
  }
  return (
    <div className="inline-flex gap-1 p-1 rounded-full bg-white border border-stone-200 shadow-sm">
      {ALL_BUCKETS.map((b) => (
        <Link
          key={b}
          href={buildHref(b)}
          prefetch={false}
          className={`px-4 py-1.5 text-xs font-bold tracking-wider rounded-full transition ${
            b === active
              ? 'bg-[#004225] text-white shadow-sm'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          {b.toUpperCase()}
        </Link>
      ))}
    </div>
  )
}

function AssetFilter({
  active,
  available,
  bucket,
}: {
  active: string | null
  available: string[]
  bucket: Bucket
}) {
  // Top assets always pinned; rest follow if there's room.
  const PINNED = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']
  const visible = [
    ...PINNED.filter((a) => available.includes(a)),
    ...available.filter((a) => !PINNED.includes(a)),
  ].slice(0, 10)
  const buildHref = (a: string | null) => {
    const params = new URLSearchParams()
    if (bucket !== '15m') params.set('b', bucket)
    if (a) params.set('asset', a)
    const qs = params.toString()
    return qs ? `/dashboard/quick?${qs}` : '/dashboard/quick'
  }
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <span className="text-[11px] text-stone-500 tracking-wider">ASSET</span>
      <Link
        href={buildHref(null)}
        prefetch={false}
        className={`px-2.5 py-1 text-xs rounded-full border transition ${
          active === null
            ? 'bg-stone-900 text-white border-stone-900'
            : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
        }`}
      >
        all
      </Link>
      {visible.map((a) => (
        <Link
          key={a}
          href={buildHref(a)}
          prefetch={false}
          className={`px-2.5 py-1 text-xs rounded-full border transition ${
            active === a
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
          }`}
        >
          {a}
        </Link>
      ))}
    </div>
  )
}

function AutoTradeBanner() {
  return (
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-emerald-50/50 to-white px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#004225] text-white text-[10px] font-bold tracking-wider shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
          AUTO-TRADE
        </span>
        <div className="text-sm text-stone-700">
          <span className="font-semibold text-stone-900">Too fast to click manually.</span>{' '}
          <span className="text-stone-600">Upgrade to let O&apos;Toole auto-execute on your account.</span>
        </div>
      </div>
      <Link
        href="/dashboard/billing"
        className="inline-flex items-center gap-1.5 bg-[#004225] text-white text-xs font-bold tracking-wider px-4 py-2 rounded-full hover:bg-[#003520] hover:shadow-md transition-all shrink-0"
      >
        UPGRADE <span aria-hidden>→</span>
      </Link>
    </div>
  )
}

function EmptyState({ bucket }: { bucket: Bucket }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-2xl mb-4">
        ⏳
      </div>
      <div className="text-lg font-semibold text-stone-900 mb-1">
        Nothing in the {bucket} window right now
      </div>
      <div className="text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
        New strikes open continuously across Limitless, OG, Kalshi, and Polymarket.
        Try a different window or check back in a minute.
      </div>
    </div>
  )
}

function GroupCard({ group, isPaid }: { group: MinuteGroup; isPaid: boolean }) {
  const urgent = group.minutes_to_resolve <= 5
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap px-1">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold text-stone-900 tracking-tight">
            {group.asset ?? '—'}
          </span>
          <span
            className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${bucketColor(group.bucket)}`}
          >
            {group.bucket?.toUpperCase() ?? '—'}
          </span>
          <span className="text-xs text-stone-500 flex items-center gap-1.5">
            <span>resolves in</span>
            <span
              className={`font-mono tabular-nums font-bold ${urgent ? 'text-red-600 animate-pulse' : 'text-stone-900'}`}
            >
              {fmtCountdown(group.minutes_to_resolve)}
            </span>
          </span>
        </div>
        <div className="text-[10px] text-stone-400 tracking-wider uppercase">
          {group.platforms.join(' · ')}
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {group.markets.map((m) => (
          <MarketBox
            key={`${m.platform}:${m.market_id}`}
            m={m}
            asset={group.asset}
            isPaid={isPaid}
          />
        ))}
      </div>
    </section>
  )
}

function MarketBox({
  m,
  asset,
  isPaid,
}: {
  m: MinuteMarket
  asset: string | null
  isPaid: boolean
}) {
  const ask = yesAsk(m)
  return (
    <a
      href={tradeUrlFor(m.platform)}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group relative rounded-2xl border border-stone-200 bg-white p-4 flex flex-col gap-3 hover:border-[#004225] hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-stone-900 leading-tight tracking-tight">
          {asset} {m.direction ?? ''} {fmtDollarStrike(m.strike)}
        </div>
        <span className="text-[10px] text-stone-400 tracking-wider uppercase font-medium shrink-0">
          {venueLabel(m.platform)}
        </span>
      </div>

      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-emerald-700 font-mono tabular-nums leading-none">
            {ask == null ? (
              '—'
            ) : (
              <RollingNumber
                value={ask}
                format={(p) => `${Math.round(p * 100)}¢`}
                flashScale={0.03}
                ariaLabel={`YES ${fmtAskCents(ask)}`}
              />
            )}
          </span>
          <span className="text-[10px] text-stone-400 tracking-[0.15em]">YES</span>
        </div>
        {isPaid && m.change_5m != null && m.movement_samples >= 2 && (
          <span className={`font-mono tabular-nums text-[11px] ${changeClass(m.change_5m)}`}>
            {fmtChangePp(m.change_5m, m.movement_samples)} 5m
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-stone-100">
        <span className="text-[10px] text-stone-400 tracking-wider uppercase">
          Tap to trade
        </span>
        <span
          aria-hidden
          className="text-[#004225] text-sm font-bold transition-transform group-hover:translate-x-1"
        >
          →
        </span>
      </div>
    </a>
  )
}
