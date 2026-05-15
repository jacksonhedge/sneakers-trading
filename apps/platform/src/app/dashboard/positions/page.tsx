import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import {
  listOpenPositionsForUser,
  type AutotradePosition,
} from '@/lib/autotrade/positions'
import { CloseButton } from './close-button'
import { RollingFormatted } from '@/components/rolling-formatted'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Positions — Sneakers Terminal' }

// Open Polymarket positions with TP/SL targets, populated by the
// copilot-execute hook after a successful confirm. The watcher in
// apps/trader polls live prices and auto-sells when TP or SL hits;
// this page renders the current state read-only for v1.

function fmtCents(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(1)}¢`
}

function fmtPp(entry: number, current: number | null): string {
  if (current == null || !Number.isFinite(current)) return '—'
  const delta = (current - entry) * 100
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}pp`
}

function fmtAge(ts: string | null): string {
  if (!ts) return '—'
  const ms = Date.now() - new Date(ts).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

function fmtOpenedAt(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function deltaClass(entry: number, current: number | null): string {
  if (current == null) return 'text-stone-500'
  if (current > entry) return 'text-emerald-700'
  if (current < entry) return 'text-red-700'
  return 'text-stone-500'
}

export default async function PositionsPage() {
  const supabase = await getAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) redirect('/signup')

  const admin = getServerClient()
  const { data: waitlistRow } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle<{ id: string }>()
  if (!waitlistRow?.id) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-stone-600">No waitlist row — contact support.</p>
      </div>
    )
  }

  const positions = await listOpenPositionsForUser(waitlistRow.id)

  return (
    <main className="min-h-full bg-gradient-to-b from-stone-50 via-stone-50 to-white text-stone-900">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-bold tracking-tight">Open positions</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              WATCHING
            </span>
          </div>
          <span className="text-[11px] text-stone-500 font-mono tabular-nums">
            {positions.length} open · polymarket
          </span>
        </header>

        <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
          Polymarket positions with auto-sell targets. The watcher polls live
          midpoints every 60s and auto-sells when the price crosses your TP or SL.
          Positions appear here automatically after you confirm an O&apos;Toole
          proposal that includes auto-sell thresholds.
        </p>

        {positions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {positions.map((p) => (
              <PositionCard key={p.id} position={p} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function PositionCard({ position }: { position: AutotradePosition }) {
  const current = position.last_observed_price
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] tracking-wider text-stone-500 mb-0.5 font-medium">
            POLYMARKET · {position.platform_market_id.slice(0, 14)}
            {position.platform_market_id.length > 14 ? '…' : ''}
          </div>
          <div className="text-sm font-semibold text-stone-900 leading-snug">
            {position.outcome_name}
          </div>
        </div>
        <span
          className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${
            position.side === 'YES'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {position.side}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Stat label="ENTRY" value={fmtCents(position.entry_price)} />
        <div className="bg-stone-50 rounded px-2 py-1.5">
          <div className="text-[9px] text-stone-500 tracking-wider">NOW</div>
          <div
            className={`font-mono font-semibold ${deltaClass(position.entry_price, current)}`}
          >
            {current == null ? (
              '—'
            ) : (
              <RollingFormatted
                value={current}
                format="cents1dp"
                flashScale={0.02}
                ariaLabel={`Now ${fmtCents(current)}`}
              />
            )}
          </div>
          {current != null && (
            <div className="text-[10px] text-stone-500 font-mono">
              {fmtPp(position.entry_price, current)}
            </div>
          )}
        </div>
        <Stat
          label="SIZE"
          value={`${position.size_shares.toFixed(0)} sh`}
          sub={`$${(position.size_shares * position.entry_price).toFixed(0)}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <TriggerStat
          label="TAKE PROFIT"
          value={fmtCents(position.take_profit_price)}
          icon="▲"
          tone="text-emerald-700"
          dim={position.take_profit_price == null}
        />
        <TriggerStat
          label="STOP LOSS"
          value={fmtCents(position.stop_loss_price)}
          icon="▼"
          tone="text-red-700"
          dim={position.stop_loss_price == null}
        />
      </div>

      <footer className="flex items-center justify-between text-[10px] text-stone-500 pt-2 border-t border-stone-100">
        <span>opened {fmtOpenedAt(position.opened_at)}</span>
        <span>checked {fmtAge(position.last_checked_at)}</span>
      </footer>

      <CloseButton positionId={position.id} />
    </article>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string | null
  tone?: string
}) {
  return (
    <div className="bg-stone-50 rounded px-2 py-1.5">
      <div className="text-[9px] text-stone-500 tracking-wider">{label}</div>
      <div className={`font-mono font-semibold ${tone ?? 'text-stone-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-stone-500 font-mono">{sub}</div>}
    </div>
  )
}

function TriggerStat({
  label,
  value,
  icon,
  tone,
  dim,
}: {
  label: string
  value: string
  icon: string
  tone: string
  dim: boolean
}) {
  return (
    <div
      className={`rounded px-2 py-1.5 ${dim ? 'bg-stone-50/50' : 'bg-emerald-50/50 ring-1 ring-emerald-100'}`}
    >
      <div className="text-[9px] text-stone-500 tracking-wider">{label}</div>
      <div className={`font-mono font-semibold flex items-center gap-1 ${dim ? 'text-stone-400' : tone}`}>
        <span>{icon}</span>
        <span>{value}</span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-2xl mb-4">
        🎯
      </div>
      <div className="text-lg font-semibold text-stone-900 mb-1">No open positions</div>
      <p className="text-sm text-stone-500 max-w-md mx-auto leading-relaxed mb-4">
        When you confirm an O&apos;Toole proposal that includes a take-profit or
        stop-loss target, the position lands here. The watcher polls Polymarket every
        minute and auto-sells when your target hits.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-[#004225] hover:text-[#003520]"
      >
        BACK TO DASHBOARD <span aria-hidden>→</span>
      </Link>
    </div>
  )
}
