import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { CREDIT_PACKS } from '@/lib/credits'
import { CreditPackButton } from './credit-pack-button'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Credits — Sneakers Terminal',
}

type TxnRow = {
  id: string
  kind: string
  delta: number
  description: string | null
  model_id: string | null
  created_at: string
}

function fmtCredits(n: number): string {
  return n.toLocaleString()
}

function fmtKindLabel(kind: string): string {
  switch (kind) {
    case 'purchase': return 'Purchased'
    case 'otoole_message': return "O'Toole message"
    case 'admin_grant': return 'Granted'
    case 'refund': return 'Refunded'
    case 'expiry': return 'Expired'
    default: return kind
  }
}

function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string; session_id?: string }>
}) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/billing/credits')

  const admin = getServerClient()

  const { data: balanceRow } = await admin
    .from('user_credits')
    .select('balance, lifetime_purchased, lifetime_spent, last_updated')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: recentTxns } = await admin
    .from('credit_transactions')
    .select('id, kind, delta, description, model_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(25)

  const balance = balanceRow?.balance ?? 0
  const lifetimePurchased = balanceRow?.lifetime_purchased ?? 0
  const lifetimeSpent = balanceRow?.lifetime_spent ?? 0

  const sp = await searchParams
  const purchaseStatus = sp.purchase ?? null

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href="/dashboard/billing"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← BILLING
        </Link>

        <header className="mt-6 mb-8">
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} CREDITS</div>
          <h1 className="text-3xl md:text-4xl font-bold">O&apos;Toole credits</h1>
          <p className="text-sm text-stone-600 mt-2 max-w-2xl">
            Credits pay for individual O&apos;Toole messages. Haiku ≈ 3 credits, Sonnet ≈ 30,
            Opus ≈ 150. Credits never expire and stack with any subscription — buy as many
            as you want, use them anytime.
          </p>
        </header>

        {purchaseStatus === 'success' && (
          <div className="mb-6 rounded bg-emerald-50 ring-1 ring-emerald-200 text-emerald-800 text-sm px-4 py-3">
            ✓ Purchase complete. Credits will appear in your balance within a few seconds.
          </div>
        )}
        {purchaseStatus === 'canceled' && (
          <div className="mb-6 rounded bg-stone-100 ring-1 ring-stone-200 text-stone-700 text-sm px-4 py-3">
            Checkout canceled. No charge was made.
          </div>
        )}

        {/* Balance card */}
        <div className="mb-10 rounded-lg bg-white ring-1 ring-stone-200 p-6 grid grid-cols-3 gap-6">
          <div>
            <div className="text-[10px] text-stone-500 tracking-wider mb-1">BALANCE</div>
            <div className="text-3xl font-bold tabular-nums">{fmtCredits(balance)}</div>
            <div className="text-xs text-stone-500 mt-1">credits available</div>
          </div>
          <div>
            <div className="text-[10px] text-stone-500 tracking-wider mb-1">LIFETIME PURCHASED</div>
            <div className="text-2xl font-bold tabular-nums text-stone-700">
              {fmtCredits(lifetimePurchased)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-stone-500 tracking-wider mb-1">LIFETIME SPENT</div>
            <div className="text-2xl font-bold tabular-nums text-stone-700">
              {fmtCredits(lifetimeSpent)}
            </div>
          </div>
        </div>

        {/* Credit packs */}
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">Buy credits</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CREDIT_PACKS.map((pack) => {
              const totalCredits = pack.credits + pack.bonus
              const bonusPct =
                pack.bonus > 0
                  ? Math.round((pack.bonus / pack.credits) * 100)
                  : 0
              return (
                <div
                  key={pack.id}
                  className="rounded-lg bg-white ring-1 ring-stone-200 p-5 flex flex-col"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-2xl font-bold tabular-nums">${pack.usd}</div>
                    {bonusPct > 0 && (
                      <div className="text-[10px] text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded px-2 py-0.5 tracking-wider">
                        +{bonusPct}%
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-stone-900">
                    {fmtCredits(totalCredits)} credits
                  </div>
                  {pack.bonus > 0 && (
                    <div className="text-[11px] text-stone-500 mt-1">
                      {fmtCredits(pack.credits)} base + {fmtCredits(pack.bonus)} bonus
                    </div>
                  )}
                  <div className="text-[11px] text-stone-500 mt-3 flex-1">
                    ≈ {Math.floor(totalCredits / 3).toLocaleString()} Haiku
                    <br />≈ {Math.floor(totalCredits / 30).toLocaleString()} Sonnet
                    <br />≈ {Math.floor(totalCredits / 150).toLocaleString()} Opus
                  </div>
                  <CreditPackButton packId={pack.id} label={`Buy $${pack.usd}`} />
                </div>
              )
            })}
          </div>
        </section>

        {/* Transaction history */}
        <section>
          <h2 className="text-xl font-bold mb-4">Recent activity</h2>
          {recentTxns && recentTxns.length > 0 ? (
            <div className="rounded-lg bg-white ring-1 ring-stone-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-[10px] tracking-wider text-stone-500">
                  <tr>
                    <th className="text-left px-4 py-2">When</th>
                    <th className="text-left px-4 py-2">Kind</th>
                    <th className="text-left px-4 py-2">Description</th>
                    <th className="text-right px-4 py-2">Δ Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentTxns as TxnRow[]).map((t) => (
                    <tr key={t.id} className="border-t border-stone-100">
                      <td className="px-4 py-2 text-stone-600 whitespace-nowrap">{when(t.created_at)}</td>
                      <td className="px-4 py-2">{fmtKindLabel(t.kind)}</td>
                      <td className="px-4 py-2 text-stone-600">
                        {t.description ?? (t.model_id ? t.model_id : '—')}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-mono tabular-nums ${
                          t.delta > 0 ? 'text-emerald-700' : 'text-stone-900'
                        }`}
                      >
                        {t.delta > 0 ? '+' : ''}
                        {fmtCredits(t.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg bg-white ring-1 ring-stone-200 p-8 text-center text-sm text-stone-500">
              No activity yet. Purchase credits above to get started.
            </div>
          )}
        </section>

        <footer className="mt-12 text-xs text-stone-500 max-w-2xl">
          Payments are processed by Stripe. Credit purchases are one-time charges — credits don&apos;t auto-renew.
          Credits never expire but are non-refundable once spent. Contact{' '}
          <a href="mailto:support@sneakersterminal.com" className="underline hover:text-stone-700">
            support
          </a>{' '}
          if something looks wrong.
        </footer>
      </div>
    </main>
  )
}
