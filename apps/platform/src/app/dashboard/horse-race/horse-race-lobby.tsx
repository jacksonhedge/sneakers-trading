'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ASSET_COLOR,
  ASSET_EMOJI,
  LOCK_IN_WINDOW_SEC,
  SIZE_LABEL,
  cashFor,
  fmtCountdown,
  generateSchedule,
  type Tournament,
  type TournamentMode,
  type TournamentSize,
  type TournamentStatus,
  type Venue,
} from '@/lib/horse-race-schedule'

// Tournament lobby teaser. Three sections:
//   1. Hero — what is this product
//   2. How it works — buy-in / chips / fee / payout
//   3. Upcoming tournaments — fake countdowns to make the cadence feel real
//
// No actual chip ledger or buy-in flow yet; CTA is "Notify me when live".

interface VenueDef {
  name: string
  logo: string
  fallback: string
  tint: string
  /** Affiliate / signup URL — opened in a new tab when the user picks
   *  "Sign up via Sneakers". Pre-tagged with our referral code where
   *  available. Per memory: WINDAILY for sportsbooks; placeholder for
   *  prediction-market venues until those affiliate deals lock. */
  signupUrl: string
  /** What format the venue uses for username — shapes the connect-form
   *  placeholder text and the simulated validation. */
  identifierLabel: string
  identifierPlaceholder: string
}

const VENUE_INFO: Record<Venue, VenueDef> = {
  polymarket: {
    name: 'Polymarket',
    logo: '/SneakersLogos/partners/polymarket.png',
    fallback: 'P',
    tint: 'bg-sky-500',
    signupUrl: 'https://polymarket.com/?ref=SNEAKERS',
    identifierLabel: 'Polymarket username or wallet',
    identifierPlaceholder: 'jackson_btc OR 0x123…',
  },
  limitless: {
    name: 'Limitless',
    logo: '/SneakersLogos/partners/limitless.svg',
    fallback: 'L',
    tint: 'bg-stone-900',
    signupUrl: 'https://limitless.exchange/?ref=SNEAKERS',
    identifierLabel: 'Limitless wallet address',
    identifierPlaceholder: '0x123…',
  },
  og: {
    name: 'OG',
    logo: '/SneakersLogos/partners/og.png',
    fallback: 'O',
    tint: 'bg-rose-600',
    signupUrl: 'https://og.markets/?ref=WINDAILY',
    identifierLabel: 'OG username',
    identifierPlaceholder: 'jackson_og',
  },
  hyperliquid: {
    name: 'Hyperliquid',
    logo: '',
    fallback: 'H',
    tint: 'bg-emerald-700',
    signupUrl: 'https://app.hyperliquid.xyz/?ref=SNEAKERS',
    identifierLabel: 'Hyperliquid wallet address',
    identifierPlaceholder: '0x123…',
  },
  kalshi: {
    name: 'Kalshi',
    logo: '/SneakersLogos/partners/kalshi.png',
    fallback: 'K',
    tint: 'bg-emerald-600',
    signupUrl: 'https://kalshi.com/signup?referral=SNEAKERS',
    identifierLabel: 'Kalshi email',
    identifierPlaceholder: 'you@example.com',
  },
}

function fmtUsd(v: number): string {
  return `$${v.toFixed(v < 10 ? 2 : 0)}`
}

// Identifier truncator — shows head…tail for wallets, or short-tail
// for handles / emails. Keeps the toast tight on long inputs and
// readable for short ones (no awkward "0xab…" with 4 chars on each side).
function truncateIdentifier(id: string): string {
  // Anything 14+ chars gets truncated; <14 is short enough to read in
  // a toast unmodified. Threshold lives here so the spec example
  // "0xdeadbeef1234" (14 chars) collapses to "0xdead…1234".
  if (id.length < 14) return id
  // Wallet-shaped → 0xabcd…1234 style
  if (/^0x/i.test(id)) return `${id.slice(0, 6)}…${id.slice(-4)}`
  // Email → preserve the @domain side
  const at = id.indexOf('@')
  if (at > 0) {
    const local = id.slice(0, at)
    const domain = id.slice(at)
    if (local.length > 6) return `${local.slice(0, 5)}…${domain}`
    return id
  }
  // Handle → first 11 chars + ellipsis
  return `${id.slice(0, 11)}…`
}

// Indicative BTC price for the prototype's "≈ X BTC" displays on prize
// pools. Production will fetch this live from /api/btc-price (or
// Coinbase index). Round numbers keep the math obvious.
const BTC_INDICATIVE_USD = 80_000

function fmtBtc(usd: number): string {
  const btc = usd / BTC_INDICATIVE_USD
  if (btc >= 1) return `${btc.toFixed(4)} BTC`
  if (btc >= 0.001) return `${btc.toFixed(5)} BTC`
  const sats = Math.round(btc * 1e8)
  return `${sats.toLocaleString()} sats`
}

export type AffiliateOverride = { signupUrl: string; promoCode: string | null }

export function HorseRaceLobby({
  affiliateOverrides,
}: {
  // Map venue → admin-edited link + optional promo code (read server-side
  // from public.venue_affiliate_links, see /admin/affiliates). When a
  // venue is missing from the map or the prop is undefined, the modal
  // falls back to VENUE_INFO[venue].signupUrl. Server component passes
  // this in via props so the lobby itself stays a client component.
  affiliateOverrides?: Partial<Record<Venue, AffiliateOverride>>
} = {}) {
  function affiliateFor(venue: Venue): AffiliateOverride {
    const o = affiliateOverrides?.[venue]
    if (o) return o
    return { signupUrl: VENUE_INFO[venue].signupUrl, promoCode: null }
  }
  // Live rolling schedule — regenerated each second from the real clock
  // so the next 5/15/30-min boundaries are always accurate.
  //
  // `now` is null on the server / first client render so the schedule
  // doesn't get computed during SSR (server time != client time would
  // produce a hydration mismatch on countdowns). We hydrate to live
  // time in the mount effect; the brief no-rows skeleton state
  // self-resolves within one paint.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const allTournaments = now ? generateSchedule(now) : []
  const mounted = now !== null

  // Size toggle — at the top of the page, lets user filter to one size.
  const [sizeFilter, setSizeFilter] = useState<'all' | 2 | 5 | 10>('all')
  const tournaments = allTournaments.filter((t) =>
    sizeFilter === 'all' ? true : t.size === sizeFilter,
  )

  // Toasts — emitted on lifecycle transitions for tournaments the user
  // is "watching" (in this prototype, all visible ones). Diffs the
  // status field between renders to detect transitions.
  const prevStatusesRef = useRef<Map<string, TournamentStatus>>(new Map())
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastIdRef = useRef(0)
  function pushToast(t: Omit<Toast, 'id' | 'createdAt'>) {
    const id = `t-${++toastIdRef.current}`
    const toast: Toast = { id, createdAt: Date.now(), ...t }
    setToasts((prev) => [...prev, toast])
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, 5000)
  }
  useEffect(() => {
    const prev = prevStatusesRef.current
    for (const t of allTournaments) {
      const old = prev.get(t.id)
      if (old !== t.status) {
        if (old !== undefined) {
          // Only emit on real transitions, not first observation.
          if (t.status === 'locked' && old === 'waiting') {
            pushToast({
              kind: 'success',
              title: 'Tournament filled',
              body: `${t.flavor} · ${SIZE_LABEL[t.size]} · locking in. Starts in ${t.startsInSec}s.`,
            })
          } else if (t.status === 'underfilled' && old === 'waiting') {
            pushToast({
              kind: 'warn',
              title: 'Tournament underfilled',
              body: `${t.flavor} · ${SIZE_LABEL[t.size]} couldn't fill. Buy-ins refund — try the next round.`,
            })
          } else if (t.status === 'starting' && (old === 'locked' || old === 'waiting')) {
            pushToast({
              kind: 'info',
              title: 'Round starting',
              body: `${t.flavor} · ${SIZE_LABEL[t.size]} kicks off in 5s.`,
            })
          } else if (t.status === 'live' && old !== 'live') {
            pushToast({
              kind: 'info',
              title: 'Round live',
              body: `${t.flavor} · ${SIZE_LABEL[t.size]} is live.`,
            })
          }
        }
        prev.set(t.id, t.status)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now])

  // Join modal state — opens when user clicks BUY IN. Walks them
  // through venue-account validation (or sign-up via Sneakers) before
  // the actual buy-in ever fires.
  const [joinModalFor, setJoinModalFor] = useState<Tournament | null>(null)

  // Per-venue verification state — once a user verifies a venue, we
  // track it in this set so subsequent tournament joins on the same
  // venue skip the choose+connect steps and go straight to a buy-in
  // confirmation. Backs the footer copy's "future tournaments on X
  // skip this step" promise. In production this lives in a DB row;
  // in the prototype it's session-scoped state.
  const [verifiedVenues, setVerifiedVenues] = useState<
    Map<Venue, { identifier: string; verifiedAt: number }>
  >(new Map())

  function openJoinModal(t: Tournament) {
    setJoinModalFor(t)
  }
  function closeJoinModal() {
    setJoinModalFor(null)
  }
  function onJoinSuccess(t: Tournament, identifier: string) {
    setVerifiedVenues((prev) => {
      const next = new Map(prev)
      next.set(t.venue, { identifier, verifiedAt: Date.now() })
      return next
    })
    closeJoinModal()
    pushToast({
      kind: 'success',
      title: `Connected — ${VENUE_INFO[t.venue].name} verified`,
      body: `Account ${truncateIdentifier(identifier)} ready. Tournament buy-ins go live next round.`,
    })
  }
  function onFastTrackBuyIn(t: Tournament) {
    closeJoinModal()
    pushToast({
      kind: 'success',
      title: `Buy-in queued — ${t.flavor}`,
      body: `${SIZE_LABEL[t.size]} on ${VENUE_INFO[t.venue].name}. Live escrow + payment goes live next round.`,
    })
  }
  function notifyMe() {
    pushToast({
      kind: 'success',
      title: "You're on the list",
      body: 'We\'ll email you the moment the first round runs.',
    })
  }

  return (
    <main className="px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* SNEAKERS TOURNAMENTS — branded league strip at the very top */}
        <BrandStrip />

        {/* Hero */}
        <header className="space-y-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white text-[10px] font-bold tracking-wider shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            NEW · CRYPTO HORSE RACE
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Tournaments for{' '}
            <span className="bg-gradient-to-r from-fuchsia-500 to-rose-500 bg-clip-text text-transparent">
              5-minute markets
            </span>
          </h1>
          <p className="text-base text-stone-600 max-w-2xl leading-relaxed">
            Pay a buy-in, get cash, trade short-duration BTC/ETH/SOL strike
            markets against everyone else in the round. Top stacks at
            resolution split a percentage of whatever&apos;s left in the
            pool.
          </p>
        </header>

        {/* Tournaments — TOP, full width */}
        <section>
          <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-[11px] font-bold tracking-wider text-stone-700 uppercase">
              Next races · live schedule
            </h2>
            <div className="inline-flex items-center gap-0.5 rounded-md ring-1 ring-stone-200 bg-stone-50 p-0.5">
              {(['all', 2, 5, 10] as const).map((size) => (
                <button
                  key={String(size)}
                  type="button"
                  onClick={() => setSizeFilter(size)}
                  className={`text-[10px] tracking-wider font-bold px-2.5 py-1 rounded transition uppercase ${
                    sizeFilter === size
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-700 hover:text-stone-900'
                  }`}
                >
                  {size === 'all' ? 'ALL' : size === 2 ? '1V1' : `${size}P`}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-stone-600 font-mono">
              {tournaments.length} of {allTournaments.length}
            </span>
          </div>
          <div className="space-y-2">
            {!mounted ? (
              // Pre-hydration skeleton — three placeholder rows so the
              // section doesn't collapse to nothing during the first paint.
              // Replaced with the live schedule on mount.
              <>
                {[0, 1, 2].map((i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="rounded-xl bg-white ring-1 ring-stone-200 p-3 h-[88px] animate-pulse"
                  />
                ))}
              </>
            ) : tournaments.length === 0 ? (
              <div className="rounded-xl bg-white ring-1 ring-stone-200 p-6 text-center text-sm text-stone-700">
                No tournaments at this size right now. Try a different filter.
              </div>
            ) : (
              tournaments.map((t) => (
                <TournamentRow
                  key={t.id}
                  t={t}
                  venueVerified={verifiedVenues.has(t.venue)}
                  onBuyIn={() => openJoinModal(t)}
                />
              ))
            )}
          </div>
        </section>

        {/* Two-column body: left = formats / math / CTA / FAQ; right = how-it-works */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
          {/* LEFT — formats, math, CTA, open questions */}
          <div className="space-y-8 min-w-0">
            {/* Two formats */}
            <section>
              <h2 className="text-[11px] font-bold tracking-wider text-stone-700 uppercase mb-3">
                Two formats
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl bg-white ring-1 ring-stone-200 p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-stone-900 text-white inline-flex items-center justify-center text-sm">
                      ✋
                    </span>
                    <span className="text-sm font-bold text-stone-900">Manual</span>
                    <span className="text-[9px] tracking-wider px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 font-bold">
                      YOU TRADE
                    </span>
                  </div>
                  <p className="text-[12px] text-stone-600 leading-relaxed">
                    You watch the race, you click. Buy strikes, sell strikes,
                    rebalance — every move is on you. Best for hands-on traders
                    who want their own read on which way BTC is heading.
                  </p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-emerald-50 via-emerald-50/60 to-white ring-1 ring-emerald-200 p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-[#00703c] text-white inline-flex items-center justify-center text-sm">
                      🤖
                    </span>
                    <span className="text-sm font-bold text-stone-900">Auto Bot</span>
                    <span className="text-[9px] tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                      O&apos;TOOLE TRADES
                    </span>
                  </div>
                  <p className="text-[12px] text-stone-600 leading-relaxed">
                    Pick a strategy, buy in, walk away. O&apos;Toole runs the
                    trades on your stack against the same field. Effectively a
                    contest between strategies — your bot vs. theirs over the
                    round.
                  </p>
                </div>
              </div>
            </section>

            {/* Sample math */}
            <section className="rounded-2xl bg-gradient-to-br from-fuchsia-50 via-rose-50 to-amber-50 ring-1 ring-rose-200 p-5 space-y-3">
              <div className="text-[10px] font-bold tracking-wider text-rose-700 uppercase">
                Example · BTC 5-min sprint
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <Stat label="Buy-in" value="$20" />
                <Stat label="Sneakers fee (10%)" value="$2" tone="text-stone-600" />
                <Stat label="Net to prize pool" value="$18" tone="text-emerald-700" />
                <Stat label="Your starting cash" value="$18" tone="text-rose-700" mono />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm pt-2 border-t border-rose-200/60">
                <Stat label="Players (cap)" value="10" />
                <Stat label="Total prize pool" value="$180" tone="text-emerald-700" sub={`≈ ${fmtBtc(180)}`} />
                <Stat label="1st place (40%)" value="$72" mono sub={`≈ ${fmtBtc(72)}`} />
                <Stat label="Top 5 paid" value="40 / 25 / 15 / 12 / 8" tone="text-stone-600 text-xs" />
              </div>
            </section>

            {/* Payout / settlement options — open product question */}
            <section>
              <h2 className="text-[11px] font-bold tracking-wider text-stone-700 uppercase mb-3">
                Settlement · open call
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SettlementCard
                  badge="Option A"
                  title="Sneakers bankroll"
                  body="Users fund a custodial USDC bankroll once. Buy-ins + payouts are bookkeeping entries. Withdraw to external wallet anytime."
                  pros={['Smoothest UX', 'Instant payouts', 'No friction per round']}
                  cons={['Custody / MTL burden', 'Hot-wallet risk', 'Heaviest legal lift']}
                />
                <SettlementCard
                  badge="Option B"
                  title="Crypto.com / Coinbase resell"
                  body="Each buy-in pulls from the user's existing crypto exchange. Payouts return there. Sneakers never holds funds."
                  pros={['No custody', 'Lighter legal load', 'Use existing balance']}
                  cons={['Per-tx friction', 'Depends on exchange API', 'Slight settle delay']}
                  accent
                />
                <SettlementCard
                  badge="Option C"
                  title="BTC-denominated, on-chain"
                  body="Buy-ins + payouts in BTC (or sats for sub-$1 amounts). Either Lightning for speed or on-chain for larger pools."
                  pros={['Crypto-native', 'No exchange dependency', 'Public auditability']}
                  cons={['Volatility intra-round', 'Lightning UX maturity', 'On-chain fees']}
                />
              </div>
              <div className="mt-3 text-[11px] text-stone-700">
                Indicative BTC equivalents above use a fixed{' '}
                <span className="font-mono tabular-nums">${BTC_INDICATIVE_USD.toLocaleString()}</span>
                /BTC. Production pulls live from a price index.
              </div>
            </section>
          </div>

          {/* RIGHT — How it works (sticky vertical stack) */}
          <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
            <h2 className="text-[11px] font-bold tracking-wider text-stone-700 uppercase">
              How it works
            </h2>
            <div className="space-y-2.5">
              <Step
                n={1}
                title="Buy in"
                body="Drop $5 / $20 / $100 (or whatever the round costs). 10% goes to Sneakers as the rake. The other 90% lands in the prize pool."
              />
              <Step
                n={2}
                title="Get cash"
                body="Your buy-in (minus the fee) becomes your starting cash. A $20 entry gives you $18 in tournament cash. Same denomination as dollars — no chip abstraction."
                accent
              />
              <Step
                n={3}
                title="Trade the race"
                body="The round opens with 4–8 strikes (BTC > $80k, > $80.5k, etc.). Trade with your cash on whichever you think will hit. Manual rounds = you click. Auto Bot rounds = O'Toole trades for you on a strategy."
              />
              <Step
                n={4}
                title="Top returns pay out"
                body="At resolution we measure each player's total return — final cash vs. starting cash — and pay top finishers a percentage of the prize pool, ranked by that return."
                accent
              />
            </div>
          </aside>
        </div>

        {/* CTA */}
        <section className="rounded-2xl bg-stone-900 text-white p-6 space-y-3">
          <h2 className="text-xl font-bold tracking-tight">Heads up before the gates open</h2>
          <p className="text-sm text-stone-700 max-w-2xl leading-relaxed">
            Horse Race is in design. Chip economics, payout curves, and
            tournament cadence are still being tuned. This page is a teaser
            so you can see the shape of it. We&apos;ll notify everyone on
            the waitlist when the first round runs.
          </p>
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <Link
              href="/horse-race-demo"
              className="bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white font-bold tracking-wider text-xs px-5 py-2.5 rounded-full shadow-sm hover:from-fuchsia-600 hover:to-rose-600 transition"
            >
              TRY THE LIVE DEMO →
            </Link>
            <button
              type="button"
              onClick={notifyMe}
              className="border border-stone-700 text-white font-bold tracking-wider text-xs px-5 py-2.5 rounded-full hover:bg-stone-800 transition"
            >
              NOTIFY ME
            </button>
            <Link
              href="/dashboard/quick"
              className="text-xs tracking-wider font-bold text-stone-600 hover:text-white transition"
            >
              Browse 5-min markets →
            </Link>
          </div>
        </section>

        {/* Open design questions — keep visible while we iterate. Hide
            once the product locks. */}
        <section className="border border-dashed border-stone-300 rounded-xl p-4 text-[11px] text-stone-700 leading-relaxed space-y-2">
          <div className="font-bold tracking-wider text-stone-600 uppercase text-[10px]">
            Open product questions
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Payout curve — winner-take-all, top-3 split, top-10 deep, or pay-out scaled to remaining cash at resolution?</li>
            <li>In-tournament trade frictions — buy-in fee only, or also a tiny per-trade rake?</li>
            <li>Auto-trade in tournaments — allowed (co-pilot using your tournament cash) or manual only?</li>
            <li>Late entry — can you buy in mid-race, or registration closes at gate?</li>
            <li>Re-buys / add-ons after going bust, or one-and-done?</li>
            <li>KYC / regulatory — how does the cash buy-in sit alongside the existing Polymarket / Kalshi flow?</li>
          </ul>
        </section>
      </div>
      <ToastStack toasts={toasts} />
      {joinModalFor && (
        <JoinTournamentModal
          tournament={joinModalFor}
          affiliate={affiliateFor(joinModalFor.venue)}
          alreadyVerifiedAs={verifiedVenues.get(joinModalFor.venue)?.identifier ?? null}
          onClose={closeJoinModal}
          onSuccess={(identifier) => onJoinSuccess(joinModalFor, identifier)}
          onFastTrackBuyIn={() => onFastTrackBuyIn(joinModalFor)}
        />
      )}
    </main>
  )
}

function Step({ n, title, body, accent }: { n: number; title: string; body: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl p-4 ring-1 ${
        accent ? 'bg-rose-50 ring-rose-200' : 'bg-white ring-stone-200'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
            accent ? 'bg-rose-500 text-white' : 'bg-stone-900 text-white'
          }`}
        >
          {n}
        </span>
        <span className="font-bold text-sm text-stone-900">{title}</span>
      </div>
      <p className="text-[12px] text-stone-600 leading-relaxed">{body}</p>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  mono,
  sub,
}: {
  label: string
  value: string
  tone?: string
  mono?: boolean
  sub?: string
}) {
  return (
    <div>
      <div className="text-[9px] tracking-wider text-stone-700 uppercase font-medium">{label}</div>
      <div className={`mt-0.5 font-bold ${mono ? 'font-mono tabular-nums' : ''} ${tone ?? 'text-stone-900'}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-stone-700 font-mono tabular-nums mt-0.5">{sub}</div>
      )}
    </div>
  )
}

const STATUS_PILL: Record<TournamentStatus, { label: string; cls: string }> = {
  waiting: { label: 'WAITING', cls: 'bg-stone-100 text-stone-600' },
  locked: { label: 'LOCKED · WILL RUN', cls: 'bg-emerald-100 text-emerald-800' },
  underfilled: { label: 'UNDERFILLED · REFUND', cls: 'bg-amber-100 text-amber-800' },
  starting: { label: 'STARTING', cls: 'bg-rose-500 text-white animate-pulse' },
  live: { label: 'LIVE', cls: 'bg-rose-600 text-white' },
  resolved: { label: 'RESOLVED', cls: 'bg-stone-200 text-stone-700' },
}

function TournamentRow({
  t,
  onBuyIn,
  venueVerified,
}: {
  t: Tournament
  onBuyIn: () => void
  venueVerified: boolean
}) {
  const cash = cashFor(t.buyInUsd)
  const fillPct = Math.min(100, (t.registered / t.cap) * 100)
  const pool = t.buyInUsd * 0.9 * t.cap
  const startsLabel = t.startsInSec === 0 ? 'NOW' : fmtCountdown(t.startsInSec)
  const urgent =
    t.startsInSec > 0 && (t.startsInSec <= LOCK_IN_WINDOW_SEC || t.status === 'starting')
  const isUnderfilled = t.status === 'underfilled'
  const isLive = t.status === 'live' || t.status === 'starting'
  const isLocked = t.status === 'locked'
  const venue = VENUE_INFO[t.venue]

  // Yahoo Sports-style "live strip" across the top of LIVE / STARTING cards.
  // Picks the right copy per status.
  const liveStripCopy = (() => {
    if (t.status === 'live') return 'LIVE NOW'
    if (t.status === 'starting') return 'STARTING'
    return null
  })()

  return (
    <article
      className={`group relative overflow-hidden rounded-xl bg-white ring-1 transition-all ${
        isUnderfilled
          ? 'ring-amber-200 opacity-75'
          : isLive
            ? 'ring-rose-300 shadow-md shadow-rose-100'
            : isLocked
              ? 'ring-emerald-300 shadow-sm'
              : 'ring-stone-200 hover:shadow-md hover:ring-stone-300'
      }`}
    >
      {/* Yahoo-style live strip — only visible on LIVE / STARTING rounds */}
      {liveStripCopy && (
        <div
          className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold tracking-[0.15em] text-white ${
            t.status === 'live' ? 'bg-rose-600' : 'bg-rose-500 animate-pulse'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          {liveStripCopy}
          <span className="ml-auto font-mono tabular-nums">
            {t.status === 'live' ? `${t.durationMin}MIN ROUND` : `T-${startsLabel}`}
          </span>
        </div>
      )}

      <div className="p-3 flex items-center gap-4 flex-wrap sm:flex-nowrap">
        {/* Asset "team logo" — bigger, brighter, Yahoo-Sports style */}
        <div className="shrink-0">
          <div
            className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${ASSET_COLOR[t.asset]} text-white inline-flex items-center justify-center text-2xl font-bold ring-2 ring-white shadow-md`}
            aria-hidden
          >
            {ASSET_EMOJI[t.asset]}
          </div>
        </div>

        {/* Center column — title, badges, venue, fill bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-extrabold tracking-tight text-stone-900">
              {t.flavor}
            </span>
            <SizeBadge size={t.size} />
            <span className="text-[10px] tracking-wider px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-700 font-bold">
              {t.durationMin}MIN
            </span>
            <ModePill mode={t.mode} />
            <StatusPill status={t.status} />
          </div>

          {/* Money row + venue */}
          <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-stone-600">
            <span className="font-bold text-stone-900">${t.buyInUsd}</span>
            <span className="text-stone-600">buy-in</span>
            <span className="text-stone-700">·</span>
            <span>{fmtUsd(cash)} cash</span>
            <span className="text-stone-700">·</span>
            <span>
              pool <span className="font-bold text-stone-900">{fmtUsd(pool)}</span>
              <span className="ml-1 text-stone-600 font-mono tabular-nums">≈ {fmtBtc(pool)}</span>
            </span>
            <span className="text-stone-700">·</span>
            <VenueBadge venueId={t.venue} />
          </div>

          {/* Fill bar with player count baked in */}
          <div className="mt-2 relative h-2.5 bg-stone-100 rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                t.registered >= t.cap
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                  : isUnderfilled
                    ? 'bg-gradient-to-r from-amber-300 to-amber-500'
                    : 'bg-gradient-to-r from-stone-400 to-stone-500'
              }`}
              style={{ width: `${fillPct}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tracking-wider text-white drop-shadow-sm pointer-events-none">
              {t.registered} / {t.cap} players
            </span>
          </div>
        </div>

        {/* Right column — countdown clock + BUY IN */}
        <div className="text-right shrink-0 flex sm:flex-col items-end gap-2 sm:gap-1.5 w-full sm:w-auto">
          <div className="flex flex-col items-end">
            <span className="text-[9px] tracking-[0.15em] text-stone-600 font-bold uppercase">
              {t.status === 'live' ? 'time left' : 'starts in'}
            </span>
            <span
              className={`font-mono tabular-nums font-extrabold text-2xl leading-none ${
                t.status === 'live'
                  ? 'text-rose-600'
                  : urgent
                    ? 'text-rose-600 animate-pulse'
                    : 'text-stone-900'
              }`}
            >
              {startsLabel}
            </span>
          </div>
          {isLive ? (
            <Link
              href={`/dashboard/horse-race/${t.id}`}
              className="text-[11px] tracking-wider font-bold px-4 py-2 rounded-full transition shadow-sm bg-rose-600 text-white hover:bg-rose-700 hover:shadow-md inline-flex items-center gap-1"
              title="Watch this race live"
            >
              👁 WATCH
            </Link>
          ) : isUnderfilled ? (
            <button
              type="button"
              disabled
              className="text-[11px] tracking-wider font-bold px-4 py-2 rounded-full bg-stone-100 text-stone-700 cursor-not-allowed"
              title="Underfilled — buy-ins refunded, try the next round"
            >
              CLOSED
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <Link
                href={`/dashboard/horse-race/${t.id}`}
                className="text-[12px] tracking-wider font-bold px-2 py-2 rounded-full text-stone-700 hover:bg-stone-100 transition"
                title="Spectate (no buy-in)"
                aria-label="Watch this race"
              >
                👁
              </Link>
              <button
                type="button"
                onClick={onBuyIn}
                aria-label={
                  venueVerified
                    ? `Join ${t.flavor} (${SIZE_LABEL[t.size]}) on ${VENUE_INFO[t.venue].name} — venue already connected, one-tap buy-in`
                    : `Join ${t.flavor} (${SIZE_LABEL[t.size]}) on ${VENUE_INFO[t.venue].name}`
                }
                className={`text-[11px] tracking-wider font-bold px-4 py-2 rounded-full transition shadow-sm cursor-pointer inline-flex items-center gap-1.5 ${
                  venueVerified
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 hover:shadow-md ring-1 ring-emerald-200'
                    : 'bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white hover:from-fuchsia-600 hover:to-rose-600 hover:shadow-md'
                }`}
                title={
                  venueVerified
                    ? `${VENUE_INFO[t.venue].name} already connected — one-tap buy-in for ${t.flavor}`
                    : `Join ${t.flavor} on ${VENUE_INFO[t.venue].name}`
                }
              >
                {venueVerified && <span aria-hidden>✓</span>}
                BUY IN →
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function SizeBadge({ size }: { size: TournamentSize }) {
  const palette: Record<TournamentSize, string> = {
    2: 'bg-fuchsia-600 text-white',
    5: 'bg-fuchsia-100 text-fuchsia-800',
    10: 'bg-stone-900 text-white',
  }
  return (
    <span
      className={`text-[10px] tracking-wider px-1.5 py-0.5 rounded-full font-bold ${palette[size]}`}
    >
      {SIZE_LABEL[size]}
    </span>
  )
}

function ModePill({ mode }: { mode: TournamentMode }) {
  return (
    <span
      className={`text-[10px] tracking-wider px-1.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
        mode === 'autobot'
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-stone-100 text-stone-700'
      }`}
    >
      <span aria-hidden>{mode === 'autobot' ? '🤖' : '✋'}</span>
      {mode === 'autobot' ? 'AUTO' : 'MANUAL'}
    </span>
  )
}

function StatusPill({ status }: { status: TournamentStatus }) {
  const pill = STATUS_PILL[status]
  return (
    <span
      className={`text-[10px] tracking-wider px-1.5 py-0.5 rounded-full font-bold ${pill.cls}`}
    >
      {pill.label}
    </span>
  )
}

function VenueBadge({ venueId }: { venueId: Venue }) {
  const v = VENUE_INFO[venueId]
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-stone-700">
      <span
        className={`w-3.5 h-3.5 rounded-full overflow-hidden inline-flex items-center justify-center text-[7px] font-bold text-white ring-1 ring-stone-300 ${
          v.logo ? 'bg-white' : v.tint
        }`}
        aria-hidden
      >
        {v.logo ? (
          <img src={v.logo} alt="" className="w-full h-full object-cover" />
        ) : (
          v.fallback
        )}
      </span>
      <span className="font-semibold">on {v.name}</span>
    </span>
  )
}

// ── Toast notifications ────────────────────────────────────────────

type ToastKind = 'success' | 'info' | 'warn'

interface Toast {
  id: string
  createdAt: number
  kind: ToastKind
  title: string
  body?: string
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
      <style>{`
        @keyframes toast-slide-in {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastCard({ toast }: { toast: Toast }) {
  const kindCls: Record<ToastKind, string> = {
    success: 'bg-emerald-50 ring-emerald-200 text-emerald-900',
    info: 'bg-stone-900 ring-stone-700 text-white',
    warn: 'bg-amber-50 ring-amber-200 text-amber-900',
  }
  const icon: Record<ToastKind, string> = {
    success: '✓',
    info: '🏇',
    warn: '⚠',
  }
  return (
    <div
      className={`rounded-xl ring-1 shadow-lg px-3.5 py-3 ${kindCls[toast.kind]}`}
      style={{
        animation: 'toast-slide-in 250ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <span className="text-base shrink-0 leading-none mt-0.5" aria-hidden>
          {icon[toast.kind]}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold leading-tight">{toast.title}</div>
          {toast.body && (
            <div className="text-[11px] mt-0.5 leading-snug opacity-90">{toast.body}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Branded "league" header ────────────────────────────────────────
//
// Sports-network style top strip: the Sneakers mark on the left,
// "TOURNAMENTS" wordmark, and a live-now indicator on the right.
// Establishes the surface as a real product, not a feature button.

function BrandStrip() {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950 ring-1 ring-stone-800 px-5 py-3 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl bg-stone-950 ring-1 ring-emerald-500/40 inline-flex items-center justify-center overflow-hidden p-1.5">
          {/* Sneakers logo lives at /logo.png; render via plain img so this
              file stays free of next/image setup overhead for a teaser. */}
          <img src="/logo.png" alt="Sneakers" className="w-full h-full object-contain" />
        </span>
        <div className="leading-tight">
          <div className="text-[9px] font-bold tracking-[0.25em] text-emerald-400">
            SNEAKERS
          </div>
          <div className="text-base font-extrabold tracking-tight text-white">
            Tournaments
          </div>
        </div>
      </div>

      <span className="hidden sm:inline-block w-px h-7 bg-stone-700 mx-2" aria-hidden />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold tracking-wider text-stone-700 uppercase">
          BTC · ETH · SOL
        </span>
        <span className="text-stone-600">·</span>
        <span className="text-[10px] font-bold tracking-wider text-stone-700 uppercase">
          5/15/30 min
        </span>
        <span className="text-stone-600">·</span>
        <span className="text-[10px] font-bold tracking-wider text-stone-700 uppercase">
          1V1 · 5P · 10P
        </span>
      </div>

      <div className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-600 text-white text-[10px] font-bold tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        LIVE SCHEDULE
      </div>
    </div>
  )
}

// ── Settlement option card ─────────────────────────────────────────

function SettlementCard({
  badge,
  title,
  body,
  pros,
  cons,
  accent,
}: {
  badge: string
  title: string
  body: string
  pros: string[]
  cons: string[]
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-xl ring-1 p-4 space-y-2.5 ${
        accent
          ? 'bg-gradient-to-br from-emerald-50 via-emerald-50/50 to-white ring-emerald-300'
          : 'bg-white ring-stone-200'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded uppercase ${
            accent ? 'bg-emerald-600 text-white' : 'bg-stone-900 text-white'
          }`}
        >
          {badge}
        </span>
        <span className="text-sm font-bold text-stone-900">{title}</span>
      </div>
      <p className="text-[11px] text-stone-600 leading-relaxed">{body}</p>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <div className="text-emerald-700 font-bold tracking-wider mb-0.5">PROS</div>
          <ul className="space-y-0.5 text-stone-600">
            {pros.map((p) => (
              <li key={p}>+ {p}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-rose-700 font-bold tracking-wider mb-0.5">CONS</div>
          <ul className="space-y-0.5 text-stone-600">
            {cons.map((c) => (
              <li key={c}>− {c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Join tournament modal ─────────────────────────────────────────
//
// Gates the BUY IN flow on a venue-account check. Three states:
//   1. CHOOSE — user picks "Sign up via Sneakers" or "I have an account"
//   2. CONNECT — user pastes their venue identifier (username / wallet
//      / email), we hit a (simulated) validation endpoint
//   3. SUCCESS — the parent's onSuccess callback fires; modal closes
//
// In production:
//   - "Validate identifier" hits the venue's API (Polymarket gamma /
//     Hyperliquid info / Kalshi accounts) to confirm the account exists
//   - "Sign up via Sneakers" opens the affiliate URL in a new tab and
//     records the click for affiliate-revenue tracking
//   - On success we write a row into user_venue_credentials so future
//     buy-ins at this venue skip the gate

type JoinStep = 'fasttrack' | 'choose' | 'connect' | 'validating' | 'success' | 'error'

function JoinTournamentModal({
  tournament,
  affiliate,
  alreadyVerifiedAs,
  onClose,
  onSuccess,
  onFastTrackBuyIn,
}: {
  tournament: Tournament
  affiliate: AffiliateOverride
  alreadyVerifiedAs: string | null
  onClose: () => void
  onSuccess: (identifier: string) => void
  onFastTrackBuyIn: () => void
}) {
  const venue = VENUE_INFO[tournament.venue]
  const [step, setStep] = useState<JoinStep>(alreadyVerifiedAs ? 'fasttrack' : 'choose')
  const [identifier, setIdentifier] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [signupClicked, setSignupClicked] = useState(false)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  // Pointer-events shield for the first 250ms after open. Stops the
  // user's burst of BUY IN clicks from leaking through onto cards that
  // animate into the click point and triggering surprise affiliate
  // tabs / extra validation calls. Visual content stays opaque; only
  // hit-testing is suppressed during the window.
  const [clicksArmed, setClicksArmed] = useState(false)

  // Close on Escape — captures globally so it works regardless of
  // where focus currently is.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Click-shield window — see comment on `clicksArmed`. 250ms is long
  // enough to absorb burst clicks but short enough that a deliberate
  // user click feels instant.
  useEffect(() => {
    const id = window.setTimeout(() => setClicksArmed(true), 250)
    return () => window.clearTimeout(id)
  }, [])

  // Initial focus + return focus on close. We focus the dialog
  // container itself (tabIndex=-1) so screen readers announce the
  // dialog without us stealing keyboard focus from a specific control
  // — the user's first Tab press then walks them into the trap.
  useEffect(() => {
    const previouslyFocused =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
    dialogRef.current?.focus()
    return () => {
      previouslyFocused?.focus?.()
    }
  }, [])

  // Focus trap — Tab / Shift+Tab cycle within the modal's focusable
  // controls. Without this, keyboard users can Tab right out of the
  // modal into the lobby below and Enter their way to a different
  // page (a real a11y bug Chrome QA hit).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === root)
      if (focusables.length === 0) {
        e.preventDefault()
        root.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === first || active === root) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function handleSignup() {
    setSignupClicked(true)
    if (typeof window !== 'undefined') {
      window.open(affiliate.signupUrl, '_blank', 'noopener,noreferrer')
    }
    // After they signup, they come back to the modal and click
    // "I just signed up — connect" which moves them to the connect step.
  }

  function handleValidate() {
    const trimmed = identifier.trim()
    if (!trimmed) {
      setErrorMsg(`${venue.identifierLabel} required`)
      return
    }
    // Lightweight client-side sanity check by venue. Production hits a
    // real API endpoint that resolves the account on the venue.
    const looksLikeWallet = /^0x[a-fA-F0-9]{8,}$/.test(trimmed)
    const looksLikeEmail = /@/.test(trimmed)
    const looksLikeHandle = /^[a-zA-Z0-9_-]{3,32}$/.test(trimmed)
    // OG handles are alphanumeric — reject anything wallet-shaped so a
    // pasted 0xABC… doesn't get accepted as a legit handle.
    const looksLikeOgHandle = looksLikeHandle && !/^0x/i.test(trimmed)
    const passesShape =
      tournament.venue === 'kalshi'
        ? looksLikeEmail
        : tournament.venue === 'limitless' || tournament.venue === 'hyperliquid'
          ? looksLikeWallet
          : tournament.venue === 'og'
            ? looksLikeOgHandle
            : looksLikeWallet || looksLikeHandle
    if (!passesShape) {
      setErrorMsg(`That doesn't look like a valid ${venue.identifierLabel}.`)
      return
    }
    setErrorMsg(null)
    setStep('validating')
    // Simulated API call — 800ms to feel real, then succeeds 90% of
    // the time. Production: server route hits venue's account-lookup API.
    setTimeout(() => {
      const ok = Math.random() < 0.9
      if (ok) {
        setStep('success')
        setTimeout(() => onSuccess(trimmed), 600)
      } else {
        setErrorMsg(
          `Couldn't find that account on ${venue.name}. Double-check it, or sign up if you don't have one.`,
        )
        setStep('connect')
      }
    }, 800)
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Join ${tournament.flavor} (${SIZE_LABEL[tournament.size]} · ${tournament.durationMin}MIN) on ${venue.name}`}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md ring-1 ring-stone-200 overflow-hidden outline-none"
        style={clicksArmed ? undefined : { pointerEvents: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — tournament summary */}
        <div className="px-5 py-4 border-b border-stone-200 bg-gradient-to-br from-stone-50 to-white">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[10px] font-bold tracking-wider text-stone-700 uppercase">
              Join tournament
            </span>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="text-stone-700 hover:text-stone-900 text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-extrabold tracking-tight text-stone-900">
              {tournament.flavor}
            </span>
            <span className="text-[10px] tracking-wider px-1.5 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-800 font-bold">
              {SIZE_LABEL[tournament.size]}
            </span>
            <span className="text-[10px] tracking-wider px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-700 font-bold">
              {tournament.durationMin}MIN
            </span>
          </div>
          <div className="text-[11px] text-stone-700 mt-1">
            ${tournament.buyInUsd} buy-in · {fmtUsd(cashFor(tournament.buyInUsd))} cash · settles on{' '}
            <span className="font-semibold text-stone-900">{venue.name}</span>
          </div>
        </div>

        {/* Body — varies by step */}
        <div className="px-5 py-5 space-y-4">
          {step === 'fasttrack' && alreadyVerifiedAs && (
            <FastTrackStep
              venue={venue}
              tournament={tournament}
              identifier={alreadyVerifiedAs}
              onConfirm={onFastTrackBuyIn}
              onReverify={() => setStep('choose')}
            />
          )}

          {step === 'choose' && (
            <ChooseStep
              venue={venue}
              promoCode={affiliate.promoCode}
              signupClicked={signupClicked}
              onSignup={handleSignup}
              onConnect={() => setStep('connect')}
            />
          )}

          {(step === 'connect' || step === 'validating') && (
            <ConnectStep
              venue={venue}
              identifier={identifier}
              setIdentifier={setIdentifier}
              isValidating={step === 'validating'}
              errorMsg={errorMsg}
              onValidate={handleValidate}
              onBack={() => {
                setErrorMsg(null)
                setStep('choose')
              }}
            />
          )}

          {step === 'success' && (
            <div className="text-center space-y-2 py-4">
              <div className="text-3xl" aria-hidden>
                ✓
              </div>
              <div className="font-bold text-stone-900">{venue.name} account verified</div>
              <div className="text-[11px] text-stone-700">Routing you to buy-in…</div>
            </div>
          )}
        </div>

        {/* Footer note — what happens after success */}
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 text-[10px] text-stone-700 leading-relaxed">
          {`We verify your ${venue.name} account once. Future tournaments on ${venue.name} skip this step. Buy-ins settle via Sneakers' tournament escrow (smart contract on Base, coming soon).`}
        </div>
      </div>
    </div>
  )
}

function ChooseStep({
  venue,
  promoCode,
  signupClicked,
  onSignup,
  onConnect,
}: {
  venue: VenueDef
  promoCode: string | null
  signupClicked: boolean
  onSignup: () => void
  onConnect: () => void
}) {
  // "a OG" → "an OG" — pick the right article based on the first
  // letter of the venue's pronunciation. We approximate with the
  // first character: vowel-sounding letters (A, E, I, O, U) → "an".
  const article = /^[aeiouAEIOU]/.test(venue.name) ? 'an' : 'a'
  return (
    <div className="space-y-3">
      <div className="text-sm text-stone-800">
        We need to verify your {venue.name} account before you can join.
      </div>
      <button
        type="button"
        onClick={onSignup}
        className="w-full text-left rounded-xl ring-1 ring-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition px-4 py-3 flex items-center gap-3"
      >
        <span
          className={`w-9 h-9 rounded-lg ring-1 ring-stone-200 inline-flex items-center justify-center text-white font-bold shrink-0 ${
            venue.logo ? 'bg-white' : venue.tint
          }`}
          aria-hidden
        >
          {venue.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={venue.logo} alt="" className="w-full h-full object-cover rounded-lg" />
          ) : (
            venue.fallback
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-emerald-900 flex items-center gap-2 flex-wrap">
            Sign up via Sneakers
            {promoCode && (
              <span
                className="text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono"
                title={`Use promo code ${promoCode} during signup`}
              >
                CODE {promoCode}
              </span>
            )}
          </div>
          <div className="text-[11px] text-stone-700">
            Don&apos;t have {article} {venue.name} account? Open one with our referral —
            takes ~2 minutes.
          </div>
        </div>
        <span className="text-emerald-700 text-lg" aria-hidden>
          →
        </span>
      </button>

      {signupClicked && (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-[11px] text-amber-900 space-y-1">
          {promoCode && (
            <div className="font-semibold">
              Use code <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">{promoCode}</span>{' '}
              at signup.
            </div>
          )}
          <div>
            Tab opened. Once you finish signup, come back and click&nbsp;
            <button
              type="button"
              onClick={onConnect}
              className="font-bold underline hover:no-underline"
            >
              I just signed up — connect
            </button>
            .
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onConnect}
        className="w-full text-left rounded-xl ring-1 ring-stone-200 bg-white hover:ring-stone-400 transition px-4 py-3 flex items-center gap-3"
      >
        <span className="w-9 h-9 rounded-lg bg-stone-900 text-white inline-flex items-center justify-center font-bold shrink-0">
          ✓
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-stone-900">
            I already have one — connect
          </div>
          <div className="text-[11px] text-stone-700">
            Paste your {venue.identifierLabel} to verify.
          </div>
        </div>
        <span className="text-stone-700 text-lg" aria-hidden>
          →
        </span>
      </button>
    </div>
  )
}

function ConnectStep({
  venue,
  identifier,
  setIdentifier,
  isValidating,
  errorMsg,
  onValidate,
  onBack,
}: {
  venue: VenueDef
  identifier: string
  setIdentifier: (v: string) => void
  isValidating: boolean
  errorMsg: string | null
  onValidate: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="text-[11px] tracking-wider font-bold text-stone-700 hover:text-stone-900"
        disabled={isValidating}
      >
        ← BACK
      </button>
      <label className="block">
        <span className="block text-[10px] tracking-wider font-bold text-stone-700 uppercase mb-1.5">
          {venue.identifierLabel}
        </span>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={venue.identifierPlaceholder}
          disabled={isValidating}
          className="w-full px-3 py-2.5 rounded-lg ring-1 ring-stone-300 bg-white text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-50"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onValidate()
          }}
        />
      </label>
      {errorMsg && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-[11px] text-rose-900">
          {errorMsg}
        </div>
      )}
      <button
        type="button"
        onClick={onValidate}
        disabled={isValidating}
        className="w-full text-sm font-bold tracking-wider px-4 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white hover:from-fuchsia-600 hover:to-rose-600 transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
      >
        {isValidating ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            VERIFYING ON {venue.name.toUpperCase()}…
          </>
        ) : (
          <>VERIFY {venue.name.toUpperCase()} ACCOUNT</>
        )}
      </button>
      <div className="text-[10px] text-stone-700 text-center">
        We never see your password. We only confirm the account exists.
      </div>
    </div>
  )
}

// FastTrackStep — rendered when the user already verified this venue
// in the current session. Skips choose + connect entirely and goes
// straight to a buy-in confirmation, which is what the footer copy
// "future tournaments on {venue} skip this step" promises.
function FastTrackStep({
  venue,
  tournament,
  identifier,
  onConfirm,
  onReverify,
}: {
  venue: VenueDef
  tournament: Tournament
  identifier: string
  onConfirm: () => void
  onReverify: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl ring-1 ring-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
        <span
          className="w-9 h-9 rounded-lg bg-emerald-600 text-white inline-flex items-center justify-center font-bold shrink-0 text-base"
          aria-hidden
        >
          ✓
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-emerald-900">
            {venue.name} already connected
          </div>
          <div className="text-[11px] text-emerald-900/80 truncate">
            Account {truncateIdentifier(identifier)} · verified this session
          </div>
        </div>
      </div>

      <div className="rounded-xl ring-1 ring-stone-200 bg-white px-4 py-3 space-y-1">
        <div className="text-[10px] tracking-wider text-stone-700 font-bold uppercase">
          Buy-in summary
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-stone-700">{tournament.flavor} · {SIZE_LABEL[tournament.size]}</span>
          <span className="font-bold text-stone-900">${tournament.buyInUsd}</span>
        </div>
        <div className="flex items-baseline justify-between text-[11px] text-stone-700">
          <span>Tournament cash</span>
          <span className="font-mono tabular-nums">{fmtUsd(cashFor(tournament.buyInUsd))}</span>
        </div>
        <div className="flex items-baseline justify-between text-[11px] text-stone-700">
          <span>Settles on</span>
          <span className="font-semibold text-stone-900">{venue.name}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 transition shadow-sm hover:shadow-md tracking-wide"
      >
        CONFIRM BUY-IN — ${tournament.buyInUsd}
      </button>

      <button
        type="button"
        onClick={onReverify}
        className="w-full text-[11px] text-stone-700 hover:text-stone-900 underline-offset-4 hover:underline"
      >
        Re-verify {venue.name} account
      </button>
    </div>
  )
}
