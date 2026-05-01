import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Strategies — Sneakers Terminal' }

// Strategies = the user's saved trading theses, grouped into:
//   - ACTIVE   : enabled alert_rules currently firing
//   - DRAFTS   : disabled alert_rules paused by the user
//   - TEMPLATES: pre-built starters they can clone with one click
// All three live on top of the existing alert_rules table — drafts are
// just rules with enabled=false. New strategies still go through the
// /dashboard/alerts/new wizard for now (and through O'Toole's chat:
// "alert me when X" → propose_alert_rule tool).

interface AlertRuleRow {
  id: string
  name: string
  description: string | null
  trigger_type: 'price_threshold' | 'price_movement' | 'overround_threshold' | 'arb_appearance'
  trigger_config: Record<string, unknown>
  market_filter: Record<string, unknown>
  enabled: boolean
  cooldown_minutes: number
  last_fired_at: string | null
  created_at: string
}

interface Template {
  id: string
  emoji: string
  name: string
  description: string
  triggerType: AlertRuleRow['trigger_type']
  defaultConfig: Record<string, unknown>
  defaultFilter: Record<string, unknown>
}

const TEMPLATES: Template[] = [
  {
    id: 'cross-book-arb-2pp',
    emoji: '🎯',
    name: 'Cross-book arbitrage (≥2pp edge)',
    description:
      'Alert any time YES_ask + NO_ask < 0.98 across two different books — guaranteed profit before fees and slippage.',
    triggerType: 'arb_appearance',
    defaultConfig: { min_edge_pp: 2 },
    defaultFilter: {},
  },
  {
    id: 'longshot-yes',
    emoji: '📉',
    name: 'Longshot YES (≤25¢)',
    description:
      'Politics or sports YES priced 25¢ or below — favorite-longshot bias is reversed in prediction markets, sometimes mispriced.',
    triggerType: 'price_threshold',
    defaultConfig: { direction: 'below', threshold: 0.25 },
    defaultFilter: { category: 'politics' },
  },
  {
    id: 'price-movement-40pp',
    emoji: '🚀',
    name: 'Big movers (≥40pp in 24h)',
    description:
      'Markets where the YES probability moved by 40 percentage points or more in the last day — news-driven repricings worth investigating.',
    triggerType: 'price_movement',
    defaultConfig: { delta_pp: 40, window_minutes: 1440 },
    defaultFilter: {},
  },
  {
    id: 'wide-overround',
    emoji: '⚠️',
    name: 'Wide overround (>1.05 on a single book)',
    description:
      'Single-book overround above 1.05 — not arbitrage on its own, but a sign that book is pricing the market wide and may have the worst edge.',
    triggerType: 'overround_threshold',
    defaultConfig: { direction: 'above', threshold: 1.05 },
    defaultFilter: {},
  },
  {
    id: 'nba-spreads-cross-book',
    emoji: '🏀',
    name: 'NBA spreads — cross-book diverge ≥3pp',
    description:
      'Specifically targets NBA spread markets where Polymarket and Kalshi diverge by 3 percentage points or more.',
    triggerType: 'arb_appearance',
    defaultConfig: { min_edge_pp: 3 },
    defaultFilter: { sport: 'nba' },
  },
  {
    id: 'closing-soon-cheap',
    emoji: '⏰',
    name: 'Resolves <60 min, YES priced 35¢-65¢',
    description:
      'Short-window crypto / minute markets where the YES is between 35¢ and 65¢ — uncertainty band, fast resolution.',
    triggerType: 'price_threshold',
    defaultConfig: { direction: 'between', threshold_min: 0.35, threshold_max: 0.65 },
    defaultFilter: { category: 'crypto' },
  },
]

function summarizeTrigger(rule: AlertRuleRow): string {
  const c = rule.trigger_config as Record<string, unknown>
  switch (rule.trigger_type) {
    case 'price_threshold':
      return `${(c.direction as string) ?? '?'} ${pct(c.threshold)}`
    case 'price_movement':
      return `≥ ${c.delta_pp}pp in ${(c.window_minutes as number) ?? '?'}m`
    case 'overround_threshold':
      return `overround ${c.direction} ${(c.threshold as number)?.toFixed?.(3) ?? '?'}`
    case 'arb_appearance':
      return c.min_edge_pp != null ? `arb ≥ ${c.min_edge_pp}pp edge` : 'any cross-book arb'
  }
}

function summarizeFilter(filter: Record<string, unknown>): string {
  const parts: string[] = []
  if (filter.platform) parts.push(`platform=${String(filter.platform)}`)
  if (filter.sport) parts.push(`sport=${String(filter.sport)}`)
  if (filter.category) parts.push(`category=${String(filter.category)}`)
  if (filter.market_key) parts.push(`market=${String(filter.market_key)}`)
  return parts.join(' · ') || 'all markets'
}

function pct(v: unknown): string {
  if (typeof v !== 'number') return '?'
  return `${(v * 100).toFixed(0)}%`
}

function fmtTime(ts: string | null): string {
  if (!ts) return 'never'
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function StrategiesPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()
  if (!row) redirect('/signup')

  const { data: rules } = await admin
    .from('alert_rules')
    .select(
      'id, name, description, trigger_type, trigger_config, market_filter, enabled, cooldown_minutes, last_fired_at, created_at',
    )
    .eq('user_id', row.id as string)
    .order('created_at', { ascending: false })

  const all = (rules ?? []) as AlertRuleRow[]
  const active = all.filter((r) => r.enabled)
  const drafts = all.filter((r) => !r.enabled)

  return (
    <div className="px-6 py-5 space-y-8 max-w-6xl">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-emerald-700 font-semibold mb-1">
            STRATEGIES
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Your trading theses</h1>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            Saved strategies fire alerts when conditions hit. Draft one with O&apos;Toole
            in the chat (&ldquo;alert me when NoVig and Polymarket diverge by 3pp on NBA
            spreads&rdquo;) or clone a template below.
          </p>
        </div>
        <Link
          href="/dashboard/alerts/new"
          prefetch={false}
          className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 text-xs tracking-wider font-semibold transition shrink-0"
        >
          <span aria-hidden>＋</span>
          NEW STRATEGY
        </Link>
      </header>

      {/* ── ACTIVE ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-stone-900 inline-flex items-center gap-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"
              aria-hidden
            />
            Active
            <span className="text-stone-500 font-normal">{active.length}</span>
          </h2>
        </div>
        {active.length === 0 ? (
          <div className="rounded-xl ring-1 ring-stone-200 bg-white p-6 text-center text-sm text-stone-600">
            No strategies running yet. Clone a template below or describe one to
            O&apos;Toole.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {active.map((r) => (
              <RuleCard key={r.id} rule={r} />
            ))}
          </div>
        )}
      </section>

      {/* ── DRAFTS ─────────────────────────────────────────────────── */}
      {drafts.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-900">
              Paused
              <span className="text-stone-500 font-normal ml-2">{drafts.length}</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {drafts.map((r) => (
              <RuleCard key={r.id} rule={r} muted />
            ))}
          </div>
        </section>
      )}

      {/* ── TEMPLATES ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-stone-900">
            Recommended templates
            <span className="text-stone-500 font-normal ml-2">{TEMPLATES.length}</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {TEMPLATES.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      </section>
    </div>
  )
}

function RuleCard({ rule, muted = false }: { rule: AlertRuleRow; muted?: boolean }) {
  return (
    <div
      className={`rounded-xl ring-1 p-4 transition ${
        muted ? 'bg-stone-50 ring-stone-200 opacity-80' : 'bg-white ring-stone-200 hover:ring-stone-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm font-semibold text-stone-900 leading-tight line-clamp-2">
          {rule.name}
        </div>
        <span
          className={`text-[9px] tracking-wider font-bold rounded-full ring-1 px-1.5 py-0.5 shrink-0 ${
            rule.enabled
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-300'
              : 'bg-stone-100 text-stone-500 ring-stone-300'
          }`}
        >
          {rule.enabled ? 'ON' : 'PAUSED'}
        </span>
      </div>
      <div className="text-[11px] font-mono text-stone-700 leading-tight mb-2">
        {summarizeTrigger(rule)}
      </div>
      <div className="text-[11px] text-stone-500 mb-3 line-clamp-1">
        {summarizeFilter(rule.market_filter)}
      </div>
      <div className="flex items-center justify-between text-[10px] text-stone-400">
        <span>last fired {fmtTime(rule.last_fired_at)}</span>
        <Link
          href={`/dashboard/alerts/${rule.id}/edit`}
          prefetch={false}
          className="text-emerald-700 hover:text-emerald-800 font-semibold tracking-wider"
        >
          EDIT →
        </Link>
      </div>
    </div>
  )
}

function TemplateCard({ template: t }: { template: Template }) {
  // For v1 the click-through goes to the same /alerts/new wizard with
  // prefill query params. The wizard reads them and pre-populates the
  // form so the user only confirms and saves.
  const params = new URLSearchParams()
  params.set('template', t.id)
  params.set('trigger_type', t.triggerType)
  params.set('config', JSON.stringify(t.defaultConfig))
  if (Object.keys(t.defaultFilter).length > 0) {
    params.set('filter', JSON.stringify(t.defaultFilter))
  }
  const cloneHref = `/dashboard/alerts/new?${params.toString()}`
  return (
    <Link
      href={cloneHref}
      prefetch={false}
      className="block rounded-xl ring-1 ring-stone-200 bg-white p-4 hover:ring-emerald-400/60 hover:shadow-sm transition"
    >
      <div className="flex items-start gap-2 mb-2">
        <span className="text-2xl leading-none" aria-hidden>
          {t.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-900 leading-tight">
            {t.name}
          </div>
        </div>
      </div>
      <div className="text-[12px] text-stone-600 leading-relaxed mb-3 line-clamp-3">
        {t.description}
      </div>
      <div className="text-[10px] text-emerald-700 font-semibold tracking-wider">
        CLONE →
      </div>
    </Link>
  )
}
