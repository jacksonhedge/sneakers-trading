import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { AccountTypeSwitcher } from './account-type-switcher'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Settings — Sneakers Terminal',
}

export default async function SettingsPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('email, account_type, plan_tier, subscription_status')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  const currentAccountType: 'individual' | 'business' =
    (row?.account_type as 'individual' | 'business' | null) ?? 'individual'
  const currentTier = (row?.plan_tier as string | null) ?? 'free'
  const hasActiveSub =
    row?.subscription_status === 'active' || row?.subscription_status === 'trialing'

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        <h1 className="text-3xl font-bold mt-6 mb-2">Settings</h1>
        <p className="text-sm text-stone-600 mb-10">
          Signed in as <span className="text-stone-900 font-medium">{user.email}</span>.
        </p>

        <section className="rounded border border-stone-200 bg-white p-6 mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Account type</h2>
              <p className="text-sm text-stone-600 mt-1">
                Individual accounts can subscribe to Pro and Elite. Business accounts
                can subscribe to Business and Fraternity. Switching does not change
                your current subscription — cancel via{' '}
                <Link
                  href="/dashboard/billing"
                  className="text-[#00703c] hover:underline"
                >
                  billing
                </Link>{' '}
                if you need to.
              </p>
            </div>
          </div>

          <AccountTypeSwitcher initial={currentAccountType} />

          {hasActiveSub && (
            <div className="mt-4 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              You have an active <span className="font-semibold">{currentTier}</span>{' '}
              subscription. Switching account type does not downgrade or refund it.
            </div>
          )}
        </section>

        <section className="rounded border border-stone-200 bg-white p-6 mb-8">
          <h2 className="text-lg font-semibold text-stone-900 mb-2">API keys</h2>
          <p className="text-sm text-stone-600 mb-3">
            BYO provider keys for O&apos;Toole AI.
          </p>
          <Link
            href="/dashboard/settings/api-keys"
            className="inline-block text-xs tracking-wider font-semibold text-[#00703c] hover:underline"
          >
            MANAGE API KEYS →
          </Link>
        </section>

        <section className="rounded border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-stone-900 mb-2">Billing</h2>
          <p className="text-sm text-stone-600 mb-3">
            Current plan: <span className="font-semibold">{currentTier}</span>
            {hasActiveSub ? ' · active' : ''}.
          </p>
          <Link
            href="/dashboard/billing"
            className="inline-block text-xs tracking-wider font-semibold text-[#00703c] hover:underline"
          >
            MANAGE SUBSCRIPTION →
          </Link>
        </section>
      </div>
    </main>
  )
}
