import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface ClickRow {
  id: string
  ts: string
  user_id: string | null
  session_id: string | null
  event_name: string
  page: string | null
  target: string | null
  metadata: Record<string, unknown> | null
  ip_country: string | null
}

function fmtAge(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-[10px] text-stone-400 tracking-wider">{label.toUpperCase()}</div>
      <div className="text-2xl font-bold text-stone-900 tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-stone-500 mt-1">{sub}</div>}
    </div>
  )
}

export default async function AdminClicksPage() {
  const admin = getServerClient()

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Pull last 24h of events. With click_events_ts_desc_idx this is fast even at
  // millions of rows. Cap at 5k so we don't blow memory if traffic spikes —
  // the aggregation only needs the recent firehose, not history.
  const { data: rawEvents, error } = await admin
    .from('click_events')
    .select(
      'id, ts, user_id, session_id, event_name, page, target, metadata, ip_country',
    )
    .gte('ts', since24h)
    .order('ts', { ascending: false })
    .limit(5000)

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} CLICKS</div>
          <h1 className="text-2xl font-bold text-stone-900">Click Tracking</h1>
        </div>
        <div className="border border-red-400 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold mb-1">Failed to load click events.</div>
          <div className="font-mono text-xs">{error.message}</div>
          <div className="mt-2 text-xs">
            If you see &quot;relation click_events does not exist,&quot; the migration hasn&apos;t run yet.
            Apply <code className="bg-red-100 px-1 rounded">supabase/migrations/026_click_events.sql</code>.
          </div>
        </div>
      </div>
    )
  }

  const events = (rawEvents ?? []) as ClickRow[]
  const total24h = events.length

  // Aggregations.
  const eventCounts = new Map<string, number>()
  const pageCounts = new Map<string, number>()
  const sessionSet = new Set<string>()
  const userSet = new Set<string>()
  let pageViews = 0
  let anonEvents = 0
  for (const e of events) {
    eventCounts.set(e.event_name, (eventCounts.get(e.event_name) ?? 0) + 1)
    if (e.page) pageCounts.set(e.page, (pageCounts.get(e.page) ?? 0) + 1)
    if (e.session_id) sessionSet.add(e.session_id)
    if (e.user_id) userSet.add(e.user_id)
    else anonEvents++
    if (e.event_name === 'page_view') pageViews++
  }
  const topEvents = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  const topPages = [...pageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  const recent = events.slice(0, 50)

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} CLICKS</div>
        <h1 className="text-2xl font-bold text-stone-900">Click Tracking</h1>
        <p className="text-sm text-stone-600 mt-1">
          Last 24h of <code className="bg-stone-100 px-1 rounded text-xs">click_events</code>. Inserts
          via <code className="bg-stone-100 px-1 rounded text-xs">/api/track</code>. Page views auto-fire
          via the root-layout <code className="bg-stone-100 px-1 rounded text-xs">PageViewTracker</code>;
          discrete clicks fire from <code className="bg-stone-100 px-1 rounded text-xs">track()</code> calls in client components.
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Events 24h"
          value={total24h.toLocaleString()}
          sub={total24h >= 5000 ? '5k cap reached — increase if needed' : 'all events'}
        />
        <MetricCard
          label="Page views 24h"
          value={pageViews.toLocaleString()}
          sub={total24h ? `${((pageViews / total24h) * 100).toFixed(0)}% of events` : '—'}
        />
        <MetricCard
          label="Unique sessions"
          value={sessionSet.size.toLocaleString()}
          sub={`${userSet.size} authed · ${anonEvents.toLocaleString()} anon events`}
        />
        <MetricCard
          label="Distinct events"
          value={eventCounts.size.toLocaleString()}
          sub="event_name varieties"
        />
      </div>

      {/* Two-column: top events + top pages */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section>
          <div className="text-[10px] text-stone-400 tracking-wider mb-2">TOP EVENTS · 24h</div>
          <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
            {topEvents.length === 0 ? (
              <div className="p-6 text-center text-sm text-stone-500">No events yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-[10px] text-stone-400 tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">EVENT NAME</th>
                    <th className="text-right px-3 py-2">COUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {topEvents.map(([name, count]) => (
                    <tr key={name} className="border-t border-stone-100 hover:bg-stone-50">
                      <td className="px-3 py-1.5 font-mono text-stone-800">{name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-stone-900 font-semibold">
                        {count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <div className="text-[10px] text-stone-400 tracking-wider mb-2">TOP PAGES · 24h</div>
          <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
            {topPages.length === 0 ? (
              <div className="p-6 text-center text-sm text-stone-500">No page views yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-[10px] text-stone-400 tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">PAGE</th>
                    <th className="text-right px-3 py-2">HITS</th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map(([page, count]) => (
                    <tr key={page} className="border-t border-stone-100 hover:bg-stone-50">
                      <td className="px-3 py-1.5 font-mono text-stone-800 truncate max-w-xs" title={page}>
                        {page}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-stone-900 font-semibold">
                        {count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Recent activity feed */}
      <section>
        <div className="text-[10px] text-stone-400 tracking-wider mb-2">RECENT ACTIVITY · last 50</div>
        <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
          {recent.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500">
              No events yet. Navigate to any page on the site (or click any tracked button)
              to populate.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-stone-50 text-[10px] text-stone-400 tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">TIME</th>
                  <th className="text-left px-3 py-2">EVENT</th>
                  <th className="text-left px-3 py-2">PAGE</th>
                  <th className="text-left px-3 py-2">TARGET</th>
                  <th className="text-left px-3 py-2">USER</th>
                  <th className="text-left px-3 py-2">META</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="px-3 py-1.5 text-stone-500 tabular-nums whitespace-nowrap">
                      <span title={fmtTs(e.ts)}>{fmtAge(e.ts)}</span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-stone-900">{e.event_name}</td>
                    <td className="px-3 py-1.5 font-mono text-stone-600 truncate max-w-[200px]" title={e.page ?? ''}>
                      {e.page ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-stone-600 truncate max-w-[180px]" title={e.target ?? ''}>
                      {e.target ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-stone-500 text-[10px]">
                      {e.user_id ? (
                        <Link
                          href={`/admin/users/${e.user_id}`}
                          className="hover:underline"
                          title={e.user_id}
                        >
                          {e.user_id.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-stone-400">anon</span>
                      )}
                      {e.ip_country && <span className="ml-1 text-stone-400">[{e.ip_country}]</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-stone-500 text-[10px] truncate max-w-[200px]" title={e.metadata ? JSON.stringify(e.metadata) : ''}>
                      {e.metadata ? JSON.stringify(e.metadata).slice(0, 60) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="text-[11px] text-stone-500 pt-4 border-t border-stone-200">
        Schema: <code className="bg-stone-100 px-1 rounded">supabase/migrations/026_click_events.sql</code>.
        Client helper: <code className="bg-stone-100 px-1 rounded">@/lib/track</code>. To instrument a
        new button: <code className="bg-stone-100 px-1 rounded">track(&apos;event_name&apos;, {`{ target: 'btn-id' }`})</code>.
      </div>
    </div>
  )
}
