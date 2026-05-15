import Image from 'next/image'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { LandingAccess } from './landing-access'
import { VenueTicker } from './venue-ticker'
import { LandingSignupButton } from './landing-signup-button'
import { getWaitlistCount, displayedPosition } from '@/lib/waitlist'
import { isValidReferralCodeFormat } from '@/lib/referral-code'
import { VENUES } from '@/lib/venues'
import { loadMarketCount } from '@/lib/markets-data'
import { getSignupConfig } from '@/lib/signup-config'
import { LandingMobileNav } from './landing-mobile-nav'

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const realCount = await getWaitlistCount().catch(() => 0)
  const displayCount = displayedPosition(realCount)

  const cookieStore = await cookies()
  const rawRef = cookieStore.get('sneakers_ref')?.value ?? null
  const referralCode =
    rawRef && isValidReferralCodeFormat(rawRef) ? rawRef : null

  // Stats strip inputs — fail soft so a scraper blip doesn't blank the page.
  const venueCount = VENUES.length
  const marketCount = await loadMarketCount().catch(() => 0)
  // Kept friendly: round down to nearest 10 so it doesn't look like a ticker
  // that moves by one every minute.
  const roundedMarkets = marketCount >= 100 ? Math.floor(marketCount / 10) * 10 : marketCount

  const signupCfg = getSignupConfig()

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 pt-28 pb-32 overflow-hidden isolate">
      {/* Background image — optimized via next/image */}
      <Image
        src="/hero-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover -z-20"
      />
      {/* Darkening overlay — dual-layer for extra contrast on the skyline */}
      <div className="absolute inset-0 bg-black/75 -z-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60 -z-10" />

      {/* Top nav: just LOG IN + SIGN UP. SIGN UP opens a small dropdown with
          Individual / Organization options so we don't clutter the bar with
          four separate buttons. */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 justify-end">
        <div className="hidden sm:flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs font-semibold tracking-wider text-white ring-1 ring-white/30 backdrop-blur-sm hover:bg-white/10 hover:ring-white/60 transition"
          >
            LOG IN
          </Link>
          {(signupCfg.individualEnabled || signupCfg.organizationEnabled) && (
            <LandingSignupButton
              referralCode={referralCode}
              individualEnabled={signupCfg.individualEnabled}
              organizationEnabled={signupCfg.organizationEnabled}
            />
          )}
        </div>
        {/* Mobile: hamburger + slide-down panel */}
        <LandingMobileNav referralCode={referralCode} signupCfg={signupCfg} />
      </div>

      <div className="max-w-2xl w-full space-y-8 text-center text-white">
        <div className="flex flex-col items-center">
          <div className="text-xs text-emerald-300/80 mb-6 tracking-wider">
            SNEAKERS TERMINAL · FOR COLLEGE STUDENTS
          </div>
          <div className="mb-4 rounded-full bg-stone-950 p-6 ring-1 ring-emerald-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.55),0_0_48px_rgba(0,112,60,0.18)]">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={280}
              height={280}
              priority
              className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
            />
          </div>
          <h1 className="sr-only">Sneakers Terminal — the prediction market terminal for college</h1>
          <div className="text-emerald-400 text-2xl md:text-3xl font-bold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            The prediction terminal for college.
          </div>
          <div className="mt-3 text-white/85 text-base md:text-lg drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] max-w-lg">
            Every market on Kalshi, Polymarket, NoVig, Opinion and 30+ sportsbooks — in one
            place, ranked against your classmates.
          </div>

          {/* Primary CTAs — moved up directly under the subtitle so the
              first action a visitor sees is "Get in", not "scroll to learn
              more". Same conditional rendering driven by signup-config. */}
          <div className="mt-7 w-full">
            {signupCfg.allClosed ? (
              <div className="rounded-lg ring-1 ring-amber-400/40 bg-amber-500/10 backdrop-blur-sm px-6 py-5 max-w-md mx-auto text-center">
                <div className="text-[10px] tracking-[0.2em] text-amber-300 font-semibold mb-1">
                  SIGNUPS PAUSED
                </div>
                <div className="text-sm text-white/85 leading-relaxed">
                  {signupCfg.banner ?? 'Signups are temporarily paused. Check back soon.'}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {signupCfg.banner && (
                  <div className="text-xs text-amber-200/90 max-w-md mx-auto px-4 py-2 rounded bg-amber-500/10 ring-1 ring-amber-400/30 text-center">
                    {signupCfg.banner}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                  {signupCfg.individualEnabled && (
                    <LandingAccess
                      referralCode={referralCode}
                      variant="hero"
                      mode="individual"
                      tone="primary"
                    />
                  )}
                  {signupCfg.organizationEnabled && (
                    <LandingAccess
                      referralCode={referralCode}
                      variant="hero"
                      mode="organization"
                      tone="secondary"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Three pillars that make this a college-first product — directly
            below the CTAs so visitors scan value props after seeing the
            primary action. Stats strip lives after the pillars. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mx-auto max-w-xl text-left">
          <div className="rounded-lg bg-black/40 backdrop-blur-sm border border-emerald-400/30 px-4 py-3">
            <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-1">
              75% OFF
            </div>
            <div className="text-xs text-white/85 leading-snug">
              Verified <span className="text-emerald-300 font-semibold">.edu</span> students get
              2 weeks free, then 75% off forever.
            </div>
          </div>
          <div className="rounded-lg bg-black/40 backdrop-blur-sm border border-emerald-400/30 px-4 py-3">
            <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-1">
              LEADERBOARDS
            </div>
            <div className="text-xs text-white/85 leading-snug">
              Compete on <span className="text-emerald-300 font-semibold">rate of return</span>{' '}
              — per-school + national.
            </div>
          </div>
          <div className="rounded-lg bg-black/40 backdrop-blur-sm border border-emerald-400/30 px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold">
                GROUPS
              </div>
              <div className="text-[9px] tracking-[0.15em] text-amber-300/80 font-semibold bg-amber-500/10 ring-1 ring-amber-400/30 px-1.5 py-0.5 rounded">
                EARLY ACCESS
              </div>
            </div>
            <div className="text-xs text-white/85 leading-snug">
              Build a team with your{' '}
              <span className="text-emerald-300 font-semibold">frat, dorm, or class</span>.
              Captains sign up now, members onboard as we ship.{' '}
              <Link
                href="/chapter-preview"
                className="text-emerald-300/90 hover:text-emerald-300 underline underline-offset-2 whitespace-nowrap"
              >
                See the preview →
              </Link>
            </div>
          </div>
        </div>

        {/* Live stats strip — real numbers, no theater. Lives after the
            pillars so it reads as supporting detail, not primary content. */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] tracking-wider drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono tabular-nums text-emerald-300 font-bold text-sm">
              {venueCount}
            </span>
            <span className="text-white/60 uppercase">venues tracked</span>
          </div>
          <span className="text-white/20" aria-hidden>·</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono tabular-nums text-emerald-300 font-bold text-sm">
              {roundedMarkets > 0 ? `${roundedMarkets}+` : '—'}
            </span>
            <span className="text-white/60 uppercase">live markets</span>
          </div>
          <span className="text-white/20" aria-hidden>·</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono tabular-nums text-emerald-300 font-bold text-sm">
              10m
            </span>
            <span className="text-white/60 uppercase">refresh cadence</span>
          </div>
        </div>

        {referralCode && (
          <div className="mx-auto max-w-md border border-emerald-400/50 bg-black/40 backdrop-blur-sm px-4 py-3 text-xs text-white/90">
            <div>
              {'>'} Referred by{' '}
              <span className="text-emerald-400 tracking-wider font-semibold">{referralCode}</span>
            </div>
            <div className="text-white/60 mt-1">
              Your signup boosts them 5 positions in the queue.
            </div>
          </div>
        )}

        <div className="text-xs text-emerald-300 tracking-wider drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          {'>'} {displayCount} STUDENTS ON THE LIST
        </div>

        <div className="text-[11px] text-white/60 tracking-wide space-x-4">
          <a
            href="/students"
            className="text-emerald-300/90 hover:text-emerald-300 underline underline-offset-4"
          >
            How student verification works →
          </a>
          <span className="text-white/20">·</span>
          <a
            href="/venues"
            className="text-white/60 hover:text-white/90 underline underline-offset-4"
          >
            Venues we track
          </a>
        </div>
      </div>

      <VenueTicker />
    </main>
  )
}
