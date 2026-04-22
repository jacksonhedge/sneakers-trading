import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'
import type { TriggerType } from '@/lib/alerts/types'

export const dynamic = 'force-dynamic'

const TRIGGER_LABEL: Record<TriggerType, string> = {
  price_threshold: 'Price threshold',
  price_movement: 'Price movement',
  overround_threshold: 'Overround',
  arb_appearance: 'Cross-book arb',
}

interface RuleRow {
  id: string
  user_id: string
  trigger_type: TriggerType
  enabled: boolean
}

interface EventRow {
  id: string
  user_id: string
  rule_id: string
  fired_at: string
  market_key: string
  channels_sent: string[]
  delivery_status: Record<string, { success: boolean; reason?: string; error?: string }> | null
  trigger_snapshot: Record<string, unknown>
}

interface UserRow {
  id: string
  email: string
}

const ABUSE_THRESHOLD_PER_DAY = 1000

function fmt(ts: string): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16)
}

export default async function AdminAlertsPage() {
  const sb = getServerClient()
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const [{ data: rulesRaw }, { data: events24Raw }, { data: events7dRaw }] = await Promise.all([
    sb.from('alert_rules').select('id, user_id, trigger_type, enabled'),
    sb.from('alert_events').select('id, user_id, rule_id, fired_at, market_key, channels_sent, delivery_status, trigger_snapshot').gte('fired_at', since24h),
    sb.from('alert_events').select('id, user_id, fired_at').gte('fired_at', since7d),
  ])
  const rules = (rulesRaw ?? []) as RuleRow[]
  const events24 = (events24Raw ?? []) as EventRow[]
  const events7d = (events7dRaw ?? []) as Pick<EventRow, 'id' | 'user_id' | 'fired_at'>[]

  // Counts
  const totalRules = rules.length
  const enabledRules = rules.filter((r) => r.enabled).length
  const triggerCounts: Record<TriggerType, number> = {
    price_threshold: 0,
    price_movement: 0,
    overround_threshold: 0,
    arb_appearance: 0,
  }
  for (const r of rules) triggerCounts[r.trigger_type] = (triggerCounts[r.trigger_type] ?? 0) + 1

  // Per-channel success / failure counts (24h)
  let pushOk = 0, pushFail = 0, emailOk = 0, emailFail = 0
  let skippedQuiet = 0
  const failures: Array<{ event: EventRow; channel: string; error: string }> = []
  for (const e of events24) {
    const ds = e.delivery_status ?? {}
    for (const [ch, outcome] of Object.entries(ds)) {
      if (ch === 'browser_push') {
        if (outcome.success) pushOk++
        else pushFail++
      } else if (ch === 'email') {
        if (outcome.success) emailOk++
        else emailFail++
      }
      if (outcome.reason === 'quiet_hours') skippedQuiet++
      if (!outcome.success && outcome.reason !== 'quiet_hours' && outcome.reason !== 'channel_disabled') {
        failures.push({ event: e, channel: ch, error: outcome.error ?? outcome.reason ?? 'unknown' })
      }
    }
  }

  // Per-user fire counts (24h) → abuse flagging
  const fireCount24h = new Map<string, number>()
  for (const e of events24) {
    fireCount24h.set(e.user_id, (fireCount24h.get(e.user_id) ?? 0) + 1)
  }
  const fireCount7d = new Map<string, number>()
  for (const e of events7d) {
    fireCount7d.set(e.user_id, (fireCount7d.get(e.user_id) ?? 0) + 1)
  }
  const topUsers = Array.from(fireCount24h.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
  const abusers = topUsers.filter(([, count]) => count >= ABUSE_THRESHOLD_PER_DAY)

  // Resolve user emails
  const userIds = Array.from(new Set(topUsers.map(([id]) => id)))
  const { data: usersRaw } = userIds.length
    ? await sb.from('waitlist').select('id, email').in('id', userIds)
    : { data: [] }
  const userById = new Map((usersRaw ?? []).map((u: UserRow) => [u.id, u.email]))

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Alerts overview</h1>
        <p className="text-sm text-stone-600 mt-2">
          Fire-rate and delivery metrics for the alert engine. Drill into failures to see the
          raw delivery_status payload. Per-user fire-counts above {ABUSE_THRESHOLD_PER_DAY.toLocaleString()}
          /day flag for review.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total rules" value={totalRules} sub={`${enabledRules} enabled`} />
        <Stat label="Fires (24h)" value={events24.length} />
        <Stat label="Fires (7d)" value={events7d.length} />
        <Stat label="Skipped — quiet hours" value={skippedQuiet} />
      </div>

      {/* Trigger-type breakdown */}
      <Section title="Rules by trigger">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.keys(triggerCounts) as TriggerType[]).map((k) => (
            <div key={k} className="rounded border border-stone-200 bg-white p-4">
              <div className="text-[10px] text-stone-500 tracking-wider mb-1">{TRIGGER_LABEL[k]}</div>
              <div className="text-2xl font-bold tabular-nums">{triggerCounts[k]}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Per-channel delivery */}
      <Section title="Delivery (last 24h)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChannelCard label="Browser push" ok={pushOk} fail={pushFail} />
          <ChannelCard label="Email" ok={emailOk} fail={emailFail} />
        </div>
      </Section>

      {/* Abuse flag */}
      {abusers.length > 0 && (
        <Section title={`⚠ Abnormal fire rate (${abusers.length})`}>
          <div className="rounded border border-amber-300 bg-amber-50 p-4 space-y-2">
            {abusers.map(([uid, count]) => (
              <div key={uid} className="flex items-center justify-between text-sm">
                <Link href={`/admin/users/${uid}`} className="text-stone-900 font-mono hover:underline">
                  {userById.get(uid) ?? uid}
                </Link>
                <span className="text-amber-800 font-semibold tabular-nums">
                  {count.toLocaleString()} fires / 24h
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Top firers */}
      <Section title="Top firers (24h)">
        {topUsers.length === 0 ? (
          <div className="rounded border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            No fires in the last 24 hours.
          </div>
        ) : (
          <div className="rounded border border-stone-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-[10px] tracking-wider text-stone-500">
                <tr>
                  <th className="text-left px-4 py-2">User</th>
                  <th className="text-right px-4 py-2">Fires (24h)</th>
                  <th className="text-right px-4 py-2">Fires (7d)</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map(([uid, count]) => (
                  <tr key={uid} className="border-t border-stone-100">
                    <td className="px-4 py-2 text-stone-700">
                      <Link href={`/admin/users/${uid}`} className="hover:underline">
                        {userById.get(uid) ?? uid}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{count.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-stone-500">
                      {(fireCount7d.get(uid) ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Recent failures */}
      <Section title={`Recent delivery failures (${failures.length})`}>
        {failures.length === 0 ? (
          <div className="rounded border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            No failures in the last 24 hours.
          </div>
        ) : (
          <div className="space-y-2">
            {failures.slice(0, 20).map((f) => (
              <details key={`${f.event.id}-${f.channel}`} className="rounded border border-stone-200 bg-white p-3">
                <summary className="cursor-pointer text-sm text-stone-800 flex items-center justify-between gap-2">
                  <span>
                    <span className="text-[10px] tracking-wider text-stone-500 mr-2">
                      {fmt(f.event.fired_at)}
                    </span>
                    <span className="font-mono">{f.event.market_key}</span>{' '}
                    <span className="text-stone-500">— {f.channel}</span>
                  </span>
                  <span className="text-[11px] text-red-700 truncate max-w-md">{f.error}</span>
                </summary>
                <pre className="mt-2 text-[11px] text-stone-700 bg-stone-50 p-2 rounded overflow-x-auto">
                  {JSON.stringify(f.event.delivery_status, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        )}
      </Section>
    </main>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded border border-stone-200 bg-white p-4">
      <div className="text-[10px] text-stone-500 tracking-wider mb-1">{label.toUpperCase()}</div>
      <div className="text-3xl font-bold tabular-nums">{value.toLocaleString()}</div>
      {sub && <div className="text-xs text-stone-500 mt-1">{sub}</div>}
    </div>
  )
}

function ChannelCard({ label, ok, fail }: { label: string; ok: number; fail: number }) {
  const total = ok + fail
  const pct = total > 0 ? Math.round((ok / total) * 100) : null
  return (
    <div className="rounded border border-stone-200 bg-white p-4">
      <div className="text-[10px] text-stone-500 tracking-wider mb-1">{label.toUpperCase()}</div>
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold tabular-nums">{ok.toLocaleString()}</span>
        <span className="text-xs text-stone-500">delivered</span>
        {fail > 0 && (
          <>
            <span className="text-2xl font-bold tabular-nums text-red-700 ml-3">{fail.toLocaleString()}</span>
            <span className="text-xs text-red-600">failed</span>
          </>
        )}
      </div>
      {pct !== null && (
        <div className="text-xs text-stone-500 mt-1">{pct}% success</div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs text-[#004225] tracking-wider font-semibold">{'>'} {title.toUpperCase()}</h2>
      {children}
    </section>
  )
}
