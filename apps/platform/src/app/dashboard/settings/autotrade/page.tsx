import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { getCredentialMeta } from '@/lib/autotrade/credentials'
import { AutotradeWaitlistForm } from './waitlist-form'
import { PolymarketConnectForm } from './connect-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Trade settings — Sneakers Terminal',
}

// Trade-execution settings. Two layers on the same page:
//
//   1. Manual Polymarket trading (live now) — paste API key trio +
//      private key, test connection, then the trade panel on each
//      Polymarket market detail page becomes BUY-able.
//
//   2. Autotrade (coming) — rules-driven execution. Keeps the waitlist
//      capture for the broader product surface; eventually merges into
//      the same credential bundle.

export default async function AutotradeSettingsPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  const admin = getServerClient()
  const [{ data: existing }, polyMeta] = await Promise.all([
    admin.from('autotrade_waitlist').select('id').eq('user_id', user.id).maybeSingle(),
    getCredentialMeta(user.id, 'polymarket'),
  ])

  const alreadyOnList = Boolean(existing)

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
          <div className="text-xs text-emerald-700 tracking-wider font-semibold mb-2">
            TRADE SETTINGS
          </div>
          <h1 className="text-3xl font-bold mb-2">Connect your trading accounts.</h1>
          <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
            Manual trading on Polymarket works now — paste your CLOB API
            credentials below and the BUY/SELL buttons on every Polymarket
            market light up. Autotrade (rules-driven) is on the roadmap.
          </p>
        </div>

        {/* 1. Manual Polymarket connect — live */}
        <section className="rounded-lg bg-white ring-1 ring-stone-200 p-6 mb-6">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-lg font-semibold">Polymarket</h2>
            <span className="text-[10px] tracking-wider font-semibold text-emerald-700">
              MANUAL TRADING · LIVE
            </span>
          </div>
          <p className="text-xs text-stone-600 mb-4 leading-relaxed">
            Non-custodial — credentials authenticate API calls against your own
            Polymarket wallet. We never see funds; you keep withdrawal control via
            polymarket.com.
          </p>
          <PolymarketConnectForm
            initial={{
              hasCreds: Boolean(polyMeta),
              testConnectionOk: polyMeta?.testConnectionOk ?? false,
              testConnectionAt: polyMeta?.testConnectionAt ?? null,
              hasPrivateKey: polyMeta?.hasPrivateKey ?? false,
              funderAddress: polyMeta?.funderAddress ?? null,
              label: polyMeta?.label ?? null,
            }}
          />
        </section>

        {/* 2. Co-pilot — live */}
        <section className="rounded-lg bg-white ring-1 ring-stone-200 p-6 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold">O&apos;Toole co-pilot</h2>
            <span className="text-[10px] tracking-wider font-semibold text-emerald-700">
              LIVE — PROPOSE / CONFIRM
            </span>
          </div>
          <ol className="space-y-3 text-sm text-stone-700 leading-relaxed mb-4">
            <Step
              n={1}
              title="Chat with O'Toole"
              body='Ask things like "find me Polymarket trades in the 10–35¢ range" or "propose a YES trade on the closest sports market." O&apos;Toole reads the markets and writes a trade proposal.'
            />
            <Step
              n={2}
              title="Review the card in the chat panel"
              body="Each proposal shows side, size, limit price, the market, and O&apos;Toole&apos;s rationale. Nothing fires until you click CONFIRM."
            />
            <Step
              n={3}
              title="5 risk gates run on confirm"
              body="Kill switch off · size ≤ per-trade cap · daily-cap headroom · market still tradeable · live Polymarket creds + USDC balance. Any fail blocks the trade and shows you which gate said no."
            />
            <Step
              n={4}
              title="Defaults: $50 per trade · $200 per day"
              body="Caps are adjustable in settings, enforced on every trade. The kill switch (one click) cancels every pending draft and pauses all future proposals until you turn it back on."
            />
          </ol>
          <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 leading-relaxed">
            <strong>Coming next:</strong> always-on auto-pilot that watches
            the markets and proposes 24/7 (no chat needed). For now the
            co-pilot only proposes when you ask it to.
          </div>
        </section>

        {/* 3. Autotrade rules — still pre-launch */}
        <section className="rounded-lg bg-white ring-1 ring-stone-200 p-6 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold">Autotrade (rules)</h2>
            <span className="text-[10px] tracking-wider font-semibold text-amber-700">
              COMING SOON
            </span>
          </div>
          <p className="text-sm text-stone-700 leading-relaxed mb-4">
            Always-on auto-pilot that watches the markets, evaluates the
            rules you set, and fires trades without you having to chat. Same
            risk gates and audit trail as the co-pilot above.
          </p>
          {alreadyOnList ? (
            <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              ✓ You&apos;re on the autotrade waitlist.
            </div>
          ) : (
            <AutotradeWaitlistForm />
          )}
        </section>

        <div className="mt-8 text-xs text-stone-500 leading-relaxed">
          Regulatory note: trading operates on <strong>user-owned wallets</strong> via
          read/trade-scoped permissions. Sneakers never custodies funds. Real-money flows go
          to Polymarket (on-chain, public). The wallet private key is encrypted at rest and
          decrypted only inside the order-placing process — but if the server is compromised,
          a funded wallet could be drained. Don&apos;t fund the trading wallet beyond what
          you&apos;re comfortable losing in that scenario.
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
