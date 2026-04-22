import Link from 'next/link'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { PricingTable, type PricingTableViewer } from '../dashboard/billing/pricing-table'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Pricing — Sneakers Terminal',
  description:
    'Plans for individual traders, business desks, and college fraternities. Free tier, 7-day trials, contact sales for enterprise.',
}

export default async function PricingPage() {
  // Show the same table as /dashboard/billing but with the public-facing
  // "Sign up" CTA when nobody is signed in. Logged-in users get the
  // current-plan strip + real Subscribe buttons.
  let viewer: PricingTableViewer | null = null
  try {
    const sb = await getAuthClient()
    const {
      data: { user },
    } = await sb.auth.getUser()
    if (user?.email) {
      const admin = getServerClient()
      const { data: row } = await admin
        .from('waitlist')
        .select('plan_tier, subscription_status, account_type, stripe_customer_id')
        .eq('email', user.email.toLowerCase())
        .maybeSingle()
      viewer = {
        email: user.email,
        tier: ((row?.plan_tier as string | null) ?? 'free') as PricingTableViewer['tier'],
        isActive:
          row?.subscription_status === 'active' || row?.subscription_status === 'trialing',
        accountType: ((row?.account_type as string | null) ?? 'individual') as PricingTableViewer['accountType'],
        hasStripeCustomer: Boolean(row?.stripe_customer_id),
        studentDiscountApproved: false,
      }
    }
  } catch {
    // Anonymous request — viewer stays null
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <Link href="/" className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]">
            ← HOME
          </Link>
          <div className="text-xs text-[#004225] tracking-wider mt-6 mb-2">{'>'} PRICING</div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3">Plans for every desk</h1>
          <p className="text-base text-stone-600 max-w-2xl mx-auto">
            Free for browsing the markets. $39/mo unlocks real-time prices, cross-venue arb, and
            unlimited alerts. Business and college options available — Enterprise is custom.
          </p>
        </div>

        <PricingTable viewer={viewer} hideCurrentPlanStrip={!viewer} />

        <div className="mt-12 text-center text-xs text-stone-500">
          Questions? <a href="mailto:support@sneakersterminal.com" className="underline hover:text-stone-700">support@sneakersterminal.com</a>
        </div>
      </div>
    </main>
  )
}
