import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { PricingTable, type PricingTableViewer } from './pricing-table'
import { BillingFlash } from './billing-flash'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Billing — Sneakers Terminal',
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>
}) {
  const supabase = await getAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/login?next=/dashboard/billing')

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('plan_tier, subscription_status, account_type, stripe_customer_id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  const viewer: PricingTableViewer = {
    email: user.email,
    tier: ((row?.plan_tier as string | null) ?? 'free') as PricingTableViewer['tier'],
    isActive:
      row?.subscription_status === 'active' || row?.subscription_status === 'trialing',
    accountType: ((row?.account_type as string | null) ?? 'individual') as PricingTableViewer['accountType'],
    hasStripeCustomer: Boolean(row?.stripe_customer_id),
    // Student verification ships in PR3 — assume false for now.
    studentDiscountApproved: false,
  }

  const sp = await searchParams

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        <header className="mt-6 mb-10">
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} BILLING</div>
          <h1 className="text-3xl md:text-4xl font-bold">Subscription</h1>
          <p className="text-sm text-stone-600 mt-2 max-w-2xl">
            Pick the tier that matches your workflow. Trials require a card; cancel anytime from
            the Stripe billing portal.
          </p>
        </header>

        <BillingFlash success={sp.success === 'true'} canceled={sp.canceled === 'true'} />

        <PricingTable viewer={viewer} />

        {/* Credits cross-link — credits are a separate one-time purchase that
            stacks on top of any subscription. See docs/OTOOLE_CREDITS_PLAN.md */}
        <section className="mt-12 rounded-lg bg-white ring-1 ring-stone-200 p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] text-[#004225] tracking-wider mb-1">{'>'} O&apos;TOOLE CREDITS</div>
            <h2 className="text-lg font-bold text-stone-900">Top up O&apos;Toole credits</h2>
            <p className="text-sm text-stone-600 mt-1 max-w-xl">
              Subscriptions include a free daily allowance. For heavier usage of Sonnet or Opus
              models, buy prepaid credit packs that stack on top of any plan.
            </p>
          </div>
          <Link
            href="/dashboard/billing/credits"
            className="px-4 py-2 text-xs tracking-wider font-semibold rounded bg-stone-900 text-white hover:bg-stone-800"
          >
            BUY CREDITS
          </Link>
        </section>
      </div>
    </main>
  )
}
