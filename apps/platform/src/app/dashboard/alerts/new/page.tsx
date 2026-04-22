import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { ruleCapFor } from '@/lib/alerts/validate'
import { RuleForm } from '../rule-form'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'New alert rule — Sneakers Terminal' }

export default async function NewAlertPage() {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/login?next=/dashboard/alerts/new')

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('id, plan_tier, business_subtype, subscription_status')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  const tier = ((row?.plan_tier as string | null) ?? 'free') as 'free' | 'pro' | 'elite' | 'business'
  const subtype = (row?.business_subtype as 'standard' | 'fraternity' | null) ?? null
  const isActive = row?.subscription_status === 'active' || row?.subscription_status === 'trialing'
  const cap = isActive ? ruleCapFor(tier, subtype) : 0

  // Hard gate: free tier or inactive sub → redirect with paywall.
  if (cap === 0) {
    redirect('/dashboard/billing?from=alerts')
  }

  // Push availability: rules can pre-check the toggle but the user has to
  // actually grant permission via /dashboard/alerts/settings before push
  // notifications will deliver. We assume "available" if at least one
  // push subscription is registered.
  let pushAvailable = false
  if (row?.id) {
    const { count } = await admin
      .from('push_subscriptions')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', row.id as string)
    pushAvailable = (count ?? 0) > 0
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <Link href="/dashboard/alerts" className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]">
          ← ALERTS
        </Link>
        <header>
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} NEW RULE</div>
          <h1 className="text-3xl md:text-4xl font-bold">Create alert rule</h1>
        </header>
        <RuleForm pushAvailable={pushAvailable} />
      </div>
    </main>
  )
}
