import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { PlanPicker } from './plan-picker'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Billing — Sneakers Terminal',
}

export default async function BillingPage() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/billing')

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        <header className="mt-6 mb-10">
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} BILLING</div>
          <h1 className="text-3xl md:text-4xl font-bold">Plan & add-ons</h1>
          <p className="text-sm text-stone-600 mt-2 max-w-2xl">
            Pick the tier that matches your workflow. Upgrade anytime, cancel anytime. All tiers
            include live prices across every book we track — paid tiers unlock Terminal mode,
            O&apos;Toole&apos;s AI insights, and cross-book arbitrage alerts.
          </p>
        </header>

        <PlanPicker />
      </div>
    </main>
  )
}
