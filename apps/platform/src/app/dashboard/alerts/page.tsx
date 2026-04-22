import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { ruleCapFor } from '@/lib/alerts/validate'
import type { AlertRule, TriggerType } from '@/lib/alerts/types'
import { RuleEnabledToggle } from './rule-enabled-toggle'
import { DeleteRuleButton } from './delete-rule-button'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Alerts — Sneakers Terminal' }

const TRIGGER_LABEL: Record<TriggerType, string> = {
  price_threshold: 'Price threshold',
  price_movement: 'Price movement',
  overround_threshold: 'Overround threshold',
  arb_appearance: 'Cross-book arb',
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return 'never'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function summarizeTrigger(rule: AlertRule): string {
  const c = rule.trigger_config as Record<string, unknown>
  switch (rule.trigger_type) {
    case 'price_threshold':
      return `prob ${c.direction} ${pct(c.threshold)}`
    case 'price_movement':
      return `≥ ${c.delta_pp}pp move in ${windowLabel(c.window_minutes as number)}`
    case 'overround_threshold':
      return `overround ${c.direction} ${(c.threshold as number)?.toFixed(3) ?? '?'}`
    case 'arb_appearance':
      return c.min_edge_pp != null ? `arb ≥ ${c.min_edge_pp}pp edge` : 'any cross-book arb'
  }
}

function summarizeFilter(filter: Record<string, unknown>): string {
  const parts: string[] = []
  if (filter.platform) parts.push(`platform=${filter.platform}`)
  if (filter.sport) parts.push(`sport=${filter.sport}`)
  if (filter.category) parts.push(`category=${filter.category}`)
  if (filter.market_key) parts.push(`market=${filter.market_key}`)
  return parts.join(' · ') || 'no filter'
}

function pct(v: unknown): string {
  if (typeof v !== 'number') return '?'
  return `${(v * 100).toFixed(0)}%`
}

function windowLabel(min: number): string {
  if (min < 60) return `${min}m`
  if (min < 1440) return `${Math.round(min / 60)}h`
  if (min < 10080) return `${Math.round(min / 1440)}d`
  return `${Math.round(min / 10080)}w`
}

export default async function AlertsPage() {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/login?next=/dashboard/alerts')

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('id, plan_tier, business_subtype, subscription_status')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  const tier = ((row?.plan_tier as string | null) ?? 'free') as 'free' | 'pro' | 'elite' | 'business'
  const subtype = (row?.business_subtype as 'standard' | 'fraternity' | null) ?? null
  const cap = ruleCapFor(tier, subtype)
  const isActive = row?.subscription_status === 'active' || row?.subscription_status === 'trialing'
  const effectiveCap = isActive ? cap : 0

  const { data: rules } = row
    ? await admin
        .from('alert_rules')
        .select('*')
        .eq('user_id', row.id as string)
        .order('created_at', { ascending: false })
    : { data: [] as AlertRule[] }
  const list = (rules ?? []) as AlertRule[]
  const used = list.length
  const atCap = Number.isFinite(effectiveCap) && used >= effectiveCap

  const upsell =
    tier === 'free'
      ? 'Upgrade to Pro for 3 alert rules.'
      : tier === 'pro'
        ? 'Upgrade to Elite for 20 rules.'
        : tier === 'elite'
          ? 'Upgrade to Business for unlimited rules.'
          : null

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <Link href="/dashboard" className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]">
              ← DASHBOARD
            </Link>
            <h1 className="text-3xl md:text-4xl font-bold mt-3">Alerts</h1>
            <p className="text-sm text-stone-600 mt-2 max-w-2xl">
              Build rules that fire on price thresholds, sharp moves, book widening, or cross-book
              arb. Notifications go to browser push and email.
            </p>
          </div>
          <Link
            href="/dashboard/alerts/settings"
            className="text-xs tracking-wider font-semibold px-3 py-2 rounded border border-stone-300 hover:bg-stone-50"
          >
            DELIVERY SETTINGS
          </Link>
        </div>

        {/* Cap indicator */}
        <div className="rounded border border-stone-200 bg-white p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-stone-700">
            <span className="font-semibold tabular-nums">{used}</span>
            {' of '}
            {Number.isFinite(effectiveCap) ? (
              <span className="font-semibold tabular-nums">{effectiveCap}</span>
            ) : (
              <span className="font-semibold">unlimited</span>
            )}
            {' rules used'}
            {tier && (
              <span className="ml-2 text-[10px] tracking-wider text-stone-500 uppercase">
                {tier}
                {subtype === 'fraternity' ? ' · fraternity' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {atCap && upsell && (
              <Link
                href="/dashboard/billing"
                className="text-xs tracking-wider font-semibold text-emerald-700 hover:text-emerald-900"
              >
                {upsell.toUpperCase()} →
              </Link>
            )}
            <Link
              href="/dashboard/alerts/new"
              aria-disabled={atCap}
              className={`px-4 py-2 text-xs tracking-wider font-semibold rounded ${
                atCap
                  ? 'bg-stone-200 text-stone-400 cursor-not-allowed pointer-events-none'
                  : 'bg-stone-900 text-white hover:bg-stone-800'
              }`}
            >
              NEW RULE
            </Link>
          </div>
        </div>

        {/* Rules table */}
        {list.length === 0 ? (
          <div className="rounded border border-stone-200 bg-white p-10 text-center">
            <div className="text-sm text-stone-700 mb-2">No rules yet.</div>
            {effectiveCap > 0 && (
              <Link
                href="/dashboard/alerts/new"
                className="text-xs tracking-wider font-semibold text-emerald-700 hover:text-emerald-900"
              >
                CREATE YOUR FIRST RULE →
              </Link>
            )}
            {effectiveCap === 0 && tier === 'free' && (
              <div className="text-xs text-stone-500 mt-2">
                Alerts are a Pro feature.{' '}
                <Link href="/dashboard/billing" className="text-emerald-700 hover:underline">
                  Upgrade to Pro
                </Link>
                .
              </div>
            )}
          </div>
        ) : (
          <div className="rounded border border-stone-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-[10px] tracking-wider text-stone-500">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Trigger</th>
                  <th className="text-left px-4 py-2">Filter</th>
                  <th className="text-left px-4 py-2">Channels</th>
                  <th className="text-left px-4 py-2">Last fired</th>
                  <th className="text-center px-4 py-2">Enabled</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/alerts/${r.id}/edit`}
                        className="font-semibold text-stone-900 hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.description && (
                        <div className="text-xs text-stone-500 mt-0.5 line-clamp-1">
                          {r.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-700">
                      <div className="font-medium">{TRIGGER_LABEL[r.trigger_type]}</div>
                      <div className="text-stone-500 mt-0.5">{summarizeTrigger(r)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-600">
                      {summarizeFilter((r.market_filter as Record<string, unknown>) ?? {})}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-600">{r.channels.join(', ')}</td>
                    <td className="px-4 py-3 text-xs text-stone-500">{fmt(r.last_fired_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <RuleEnabledToggle ruleId={r.id} enabled={r.enabled} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeleteRuleButton ruleId={r.id} ruleName={r.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
