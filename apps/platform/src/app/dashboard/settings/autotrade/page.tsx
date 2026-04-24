import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { AutotradeWaitlistForm } from './waitlist-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Autotrade waitlist — Sneakers Terminal',
}

// Autotrade settings. Full product is months out (PLAN_GROUPS Terminal tier
// work), so this page is a waitlist capture + explainer. We write opt-ins
// to a Supabase column on user_profiles so we can email the list when the
// feature is live.

export default async function AutotradeSettingsPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  // Check if they're already on the autotrade waitlist
  const admin = getServerClient()
  const { data: profile } = await admin
    .from('user_profiles')
    .select('autotrade_waitlist_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const alreadyOnList = Boolean(profile?.autotrade_waitlist_at)

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        <div className="mt-6 mb-8">
          <div className="text-xs text-amber-700 tracking-wider font-semibold mb-2">
            AUTOTRADE · COMING SOON
          </div>
          <h1 className="text-3xl font-bold mb-2">Let O&apos;Toole place the trades.</h1>
          <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
            Configure rules in plain English. When conditions hit, O&apos;Toole places the trade
            on your behalf. Polymarket first, NoVig and ProphetX second. Every trade is
            consent-gated and fully audited.
          </p>
        </div>

        {/* How it will work */}
        <section className="rounded-lg bg-white ring-1 ring-stone-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">How it will work</h2>
          <ol className="space-y-4 text-sm text-stone-700 leading-relaxed">
            <Step
              n={1}
              title="Describe your strategy in English"
              body='Example: "When Kalshi has Yankees ML at 55¢ or lower and Polymarket has the same market above 58¢, buy $50 on Kalshi."'
            />
            <Step
              n={2}
              title="O'Toole compiles it to a rule"
              body="You review the parsed rule and approve it. No trade runs without an approved config."
            />
            <Step
              n={3}
              title="The rule watches markets 24/7"
              body="When conditions hit, O'Toole places the trade on your connected wallet. You get a real-time push notification + every fill in your trade journal."
            />
            <Step
              n={4}
              title="Kill switch always available"
              body='One-click "pause all rules" on the dashboard. Daily P&L limits + per-trade stake caps are built in.'
            />
          </ol>
        </section>

        {/* Waitlist */}
        <section className="rounded-lg bg-white ring-1 ring-stone-200 p-6">
          <h2 className="text-lg font-semibold mb-3">Join the autotrade waitlist</h2>
          {alreadyOnList ? (
            <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              ✓ You&apos;re on the list. We&apos;ll email when the first Polymarket-integrated
              rules go live.
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-600 mb-4 leading-relaxed">
                First cohort gets early access + a direct feedback line to the team building
                this. Expect a ~4 week beta starting when the autotrade-tos branch merges.
              </p>
              <AutotradeWaitlistForm />
            </>
          )}
        </section>

        <div className="mt-8 text-xs text-stone-500 leading-relaxed">
          Regulatory note: autotrade operates on <strong>user-owned wallets</strong> via
          read/trade-scoped permissions. Sneakers never custodies funds. Real-money flows go
          to Polymarket (on-chain, public), NoVig, and ProphetX. Sportsbook autotrade is not
          on the roadmap — too many venue-specific ToS concerns.
        </div>
      </div>
    </main>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
        {n}
      </span>
      <div>
        <div className="font-semibold text-stone-900">{title}</div>
        <div className="text-stone-700 mt-1">{body}</div>
      </div>
    </li>
  )
}
