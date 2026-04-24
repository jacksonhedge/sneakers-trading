import Image from 'next/image'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { LandingAccess } from '../landing-access'
import { ConnectWalletButton } from '@/components/connect-wallet-button'
import { isValidReferralCodeFormat } from '@/lib/referral-code'
import { getSignupConfig } from '@/lib/signup-config'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Hardware — Sneakers Terminal',
  description:
    'A Mac, pre-loaded with Sneakers, shipped to your house. Mac Studio for the common room or MacBook Pro for the road. Optional add-on to the Fraternity tier.',
  openGraph: {
    title: 'Sneakers Terminal — Hardware',
    description:
      'Bring the terminal home. We pre-load a Mac with Sneakers, ship it, and set it up. Your common room becomes a trading floor.',
    url: 'https://sneakersterminal.com/hardware',
    siteName: 'Sneakers Terminal',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'Sneakers Terminal — Hardware',
    description:
      'A Mac, pre-loaded with Sneakers, shipped to your house. Make your common room the trading floor.',
  },
}

export default async function HardwarePage() {
  const cookieStore = await cookies()
  const rawRef = cookieStore.get('sneakers_ref')?.value ?? null
  const referralCode = rawRef && isValidReferralCodeFormat(rawRef) ? rawRef : null

  const signupCfg = getSignupConfig()

  return (
    <main className="min-h-screen bg-stone-950 text-white">
      {/* Top nav — mirrors landing */}
      <nav className="relative z-10 px-6 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="text-xs text-emerald-300/80 tracking-wider hover:text-emerald-300"
        >
          ← SNEAKERS TERMINAL
        </Link>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <ConnectWalletButton variant="dark" />
          <a
            href="/students#alumni"
            className="hidden sm:inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs font-medium tracking-wider text-white/70 ring-1 ring-white/15 hover:bg-white/10 hover:text-white hover:ring-white/30 transition"
          >
            Recent grad?
          </a>
          {signupCfg.organizationEnabled && (
            <LandingAccess
              referralCode={referralCode}
              variant="nav"
              mode="organization"
              tone="secondary"
            />
          )}
          {signupCfg.individualEnabled && (
            <LandingAccess
              referralCode={referralCode}
              variant="nav"
              mode="individual"
              tone="primary"
            />
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 py-12 md:py-20 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-xs text-emerald-300/80 tracking-wider mb-4">
            SNEAKERS TERMINAL · HARDWARE
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 text-white">
            Bring the terminal home.
          </h1>
          <p className="text-base md:text-lg text-white/75 max-w-2xl mx-auto leading-relaxed">
            We pre-load a Mac with Sneakers, ship it to your house, and set it up.
            Your common room becomes a trading floor.
          </p>
        </div>

        {/* Hero image — Mac Studio with the decal */}
        <div className="relative max-w-3xl mx-auto rounded-2xl overflow-hidden ring-1 ring-emerald-400/20 bg-gradient-to-b from-stone-900 to-stone-950 p-6 md:p-12 shadow-[0_24px_72px_rgba(16,185,129,0.15)]">
          <Image
            src="/hardware/mac-studio.png"
            alt="Mac Studio with custom Sneakers Terminal decal"
            width={1200}
            height={900}
            priority
            className="w-full h-auto"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-10">
          <a
            href="#pricing"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-8 py-4 text-base font-bold tracking-wider text-black ring-1 ring-emerald-400 shadow-[0_8px_32px_rgba(16,185,129,0.4)] hover:bg-emerald-400 transition"
          >
            See pricing →
          </a>
          {signupCfg.organizationEnabled && (
            <LandingAccess
              referralCode={referralCode}
              variant="hero"
              mode="organization"
              tone="secondary"
              label="Sign up your org"
            />
          )}
        </div>
      </section>

      {/* Two options side-by-side */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-xs text-emerald-300/80 tracking-wider mb-2">
            TWO OPTIONS
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Permanent install or take it on the road.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Mac Studio */}
          <div className="rounded-2xl ring-1 ring-white/10 bg-stone-900 overflow-hidden">
            <div className="bg-stone-950 p-6 md:p-8 flex items-center justify-center">
              <Image
                src="/hardware/mac-studio.png"
                alt="Mac Studio"
                width={800}
                height={600}
                className="w-full h-auto max-h-72 object-contain"
              />
            </div>
            <div className="p-6 md:p-8">
              <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-2">
                MAC STUDIO
              </div>
              <h3 className="text-xl md:text-2xl font-bold tracking-tight mb-2">
                Always on. Always in the common room.
              </h3>
              <div className="text-xs text-white/65 mb-5 leading-relaxed">
                Mac Studio M3 · 256 GB SSD · 32 GB RAM. Ships with dual 27&quot;
                monitors, mechanical keyboard, mouse, all cables.
              </div>
              <div className="text-xs text-white/85 leading-relaxed mb-4">
                <span className="text-emerald-300 font-semibold">Best for:</span>{' '}
                frats with a permanent install location, dorm common rooms, club
                houses with a dedicated trading nook.
              </div>
              <div className="text-sm text-white/90 italic">
                &quot;Plug in, never unplug.&quot;
              </div>
            </div>
          </div>

          {/* MacBook Pro */}
          <div className="rounded-2xl ring-1 ring-white/10 bg-stone-900 overflow-hidden">
            <div className="bg-stone-950 p-6 md:p-8 flex items-center justify-center">
              <Image
                src="/hardware/macbook-pro.png"
                alt="MacBook Pro with Sneakers wordmark"
                width={800}
                height={600}
                className="w-full h-auto max-h-72 object-contain"
              />
            </div>
            <div className="p-6 md:p-8">
              <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-2">
                MACBOOK PRO
              </div>
              <h3 className="text-xl md:text-2xl font-bold tracking-tight mb-2">
                Take the desk to the library, the Vegas trip, anywhere.
              </h3>
              <div className="text-xs text-white/65 mb-5 leading-relaxed">
                14&quot; MacBook Pro M3 · 16 GB RAM · 512 GB SSD. Soft case +
                charger included.
              </div>
              <div className="text-xs text-white/85 leading-relaxed mb-4">
                <span className="text-emerald-300 font-semibold">Best for:</span>{' '}
                a single brother running the trades on behalf of the chapter +
                traveling, road trips, away games.
              </div>
              <div className="text-sm text-white/90 italic">
                &quot;Trading floor in a backpack.&quot;
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-xs text-emerald-300/80 tracking-wider mb-2">
            WHAT&apos;S INCLUDED
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Everything boxed, shipped, and set up for you.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Inclusion
            icon="⚙"
            title="Pre-loaded software"
            body="Boots straight into the Sneakers dashboard, signed in as the captain. No setup wizard, no copy-paste of API keys."
          />
          <Inclusion
            icon="📦"
            title="Free shipping + setup"
            body="UPS Premier with insurance, AppleCare 1-year, no setup cost. Ships within 5 business days of order."
          />
          <Inclusion
            icon="🎓"
            title="1-on-1 onboarding"
            body="30-min Zoom with the team. Walkthrough of every feature, alert setup, captain controls. Bring your questions."
          />
          <Inclusion
            icon="🛠"
            title="Hardware support"
            body="Broken? We&apos;ll swap it. Lost? Insurance has you. Damaged? Case-by-case but we work with you."
          />
        </div>
      </section>

      {/* Pricing block — orgs (live) + individuals (coming soon) side by side */}
      <section
        id="pricing"
        className="px-6 py-16 max-w-5xl mx-auto scroll-mt-8"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Org pricing — live */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-950 via-stone-900 to-stone-950 ring-1 ring-emerald-400/30 p-7 md:p-9 text-center shadow-[0_24px_72px_rgba(16,185,129,0.15)] flex flex-col">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="text-xs text-emerald-300/80 tracking-wider">
                FOR ORGANIZATIONS
              </div>
              <span className="text-[9px] tracking-[0.15em] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/50">
                LIVE
              </span>
            </div>
            <div className="text-5xl md:text-6xl font-bold tracking-tight mb-2">
              +<span className="font-mono tabular-nums">$199</span>
              <span className="text-2xl text-white/60 font-normal">/mo</span>
            </div>
            <div className="text-sm text-white/70 mb-6 leading-relaxed flex-1">
              Added to your{' '}
              <span className="text-emerald-300 font-semibold">Fraternity</span>{' '}
              subscription ($799/mo software, 25 seats). Cancel anytime —
              we&apos;ll send a return label.
            </div>
            {signupCfg.organizationEnabled ? (
              <LandingAccess
                referralCode={referralCode}
                variant="hero"
                mode="organization"
                tone="primary"
                label="Sign up your org →"
              />
            ) : (
              <div className="rounded-lg ring-1 ring-amber-400/40 bg-amber-500/10 px-5 py-3 text-sm text-white/85">
                Org signups paused — check back soon.
              </div>
            )}
            <div className="text-[11px] text-white/50 mt-4">
              Buyout option after 24 months — depreciated value.
            </div>
          </div>

          {/* Individual pricing — coming soon */}
          <div className="rounded-2xl bg-stone-900/60 ring-1 ring-white/15 p-7 md:p-9 text-center flex flex-col">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="text-xs text-white/60 tracking-wider">
                FOR INDIVIDUALS
              </div>
              <span className="text-[9px] tracking-[0.15em] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40">
                COMING SOON
              </span>
            </div>
            <div className="text-5xl md:text-6xl font-bold tracking-tight mb-2 text-white/85">
              <span className="text-white/40">+</span>
              <span className="font-mono tabular-nums">$—</span>
              <span className="text-2xl text-white/40 font-normal">/mo</span>
            </div>
            <div className="text-sm text-white/65 mb-6 leading-relaxed flex-1">
              Solo hardware rental — a Mac on your desk, pre-loaded with
              Sneakers — is up next. Join the list and we&apos;ll email when
              it&apos;s available, with first-cohort pricing.
            </div>
            <a
              href="mailto:desk@sneakersterminal.com?subject=Individual%20hardware%20%E2%80%94%20notify%20me&body=I%27d%20like%20to%20be%20notified%20when%20individual%20hardware%20rental%20is%20available."
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/5 px-8 py-4 text-base font-bold tracking-wider text-white ring-1 ring-white/30 hover:bg-white/10 hover:ring-white/60 transition"
            >
              Notify me →
            </a>
            <div className="text-[11px] text-white/45 mt-4">
              Email-list only for now. No card, no commitment.
            </div>
          </div>
        </div>
      </section>

      {/* B2B tease — looking ahead */}
      <section className="px-6 py-16 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-xs text-emerald-300/80 tracking-wider mb-2">
            NOT A FRATERNITY?
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
            We&apos;re also talking to a few others.
          </h2>
          <p className="text-sm text-white/65 max-w-2xl mx-auto leading-relaxed">
            The hardware play scales. If any of these sound like you, we&apos;d like
            to hear what your setup looks like.
          </p>
        </div>

        <div className="space-y-3">
          <BizLine
            icon="🎯"
            title="Indie sharp running a 5-person syndicate?"
            sub="Custom seat counts, private Slack, real-time push feeds."
          />
          <BizLine
            icon="💼"
            title="Family office adding sports as an alt-asset?"
            sub="Dedicated solutions engineer, on-prem option, audit logs."
          />
          <BizLine
            icon="🔗"
            title="Crypto market-maker needing cross-venue feeds?"
            sub="Real-time push API across Polymarket, Kalshi, NoVig, ProphetX, sportsbooks."
          />
        </div>

        <div className="text-center mt-8">
          <a
            href="mailto:desk@sneakersterminal.com?subject=Hardware%20%2B%20desk%20setup"
            className="inline-flex items-center gap-2 rounded-full bg-white/5 px-5 py-2.5 text-sm font-semibold tracking-wider text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-white/10 hover:ring-emerald-400 transition"
          >
            desk@sneakersterminal.com
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-xs text-emerald-300/80 tracking-wider mb-2">
            FAQ
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Quick ones.
          </h2>
        </div>

        <div className="space-y-3">
          <Faq
            q="Do I have to take the hardware to use Sneakers?"
            a="No. Hardware is optional. The Sneakers software runs in any browser — desktop, laptop, phone. The hardware add-on is for orgs that want a dedicated, always-on terminal in the house."
          />
          <Faq
            q="What if our chapter dissolves or moves?"
            a="Return the hardware (we send a label, no return shipping cost), cancel the subscription, no penalty beyond the current month."
          />
          <Faq
            q="Can I upgrade from MacBook Pro to Mac Studio mid-term?"
            a="Yes. We swap the device and you cover the price difference. No fees beyond that."
          />
          <Faq
            q="Is this leased or owned?"
            a="Leased. After 24 months you can buy out at depreciated value, swap into a newer model, or return and cancel."
          />
          <Faq
            q="What about Apple Care?"
            a="Year 1 is included. After that we cover hardware support directly — broken keys, dead pixels, swollen batteries, all covered while you're a subscriber."
          />
        </div>
      </section>

      {/* Footer breadcrumb */}
      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-white/50">
        <Link href="/pricing" className="text-emerald-300/80 hover:text-emerald-300">
          ← Back to pricing
        </Link>
        <span className="mx-3 text-white/20">·</span>
        <Link href="/" className="text-emerald-300/80 hover:text-emerald-300">
          Sneakers Terminal home
        </Link>
      </footer>
    </main>
  )
}

function Inclusion({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl bg-stone-900 ring-1 ring-white/10 p-5">
      <div className="text-3xl mb-3" aria-hidden>
        {icon}
      </div>
      <div className="text-sm font-semibold text-white mb-1">{title}</div>
      <div className="text-xs text-white/65 leading-relaxed">{body}</div>
    </div>
  )
}

function BizLine({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-4 rounded-xl bg-stone-900 ring-1 ring-white/10 px-5 py-4">
      <div className="text-2xl flex-shrink-0" aria-hidden>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-white/65 mt-0.5 leading-relaxed">{sub}</div>
      </div>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl bg-stone-900 ring-1 ring-white/10 px-5 py-3 [&_summary]:cursor-pointer">
      <summary className="flex items-center justify-between text-sm font-semibold text-white list-none">
        <span>{q}</span>
        <span className="text-emerald-300 group-open:rotate-45 transition-transform text-xl leading-none">
          +
        </span>
      </summary>
      <div className="text-xs text-white/70 mt-3 leading-relaxed">{a}</div>
    </details>
  )
}
