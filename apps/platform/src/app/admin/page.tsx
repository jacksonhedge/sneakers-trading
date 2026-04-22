import Link from 'next/link'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type WaitlistRow = {
  created_at: string
  invite_code: string | null
  invited_at: string | null
  invite_used_at: string | null
  referred_by_code: string | null
  plan_tier: string | null
  account_type: string | null
}

type StudentRow = { status: string; submitted_at: string }

type EnterpriseRow = {
  id: string
  created_at: string
  contact_name: string
  company_name: string | null
  status: string
  quoted_amount_usd: number | null
  hardware_interest: boolean | null
  hardware_form_factor: string | null
}

function countInRange(rows: { created_at: string }[], sinceHours: number) {
  const cutoff = Date.now() - sinceHours * 3600 * 1000
  return rows.filter((r) => {
    const v = r.created_at
    return typeof v === 'string' && new Date(v).getTime() >= cutoff
  }).length
}

function sparkline(rows: { created_at: string }[], days: number) {
  const buckets = new Array(days).fill(0)
  const now = Date.now()
  for (const r of rows) {
    const v = r.created_at
    if (typeof v !== 'string') continue
    const ts = new Date(v).getTime()
    const diffDays = Math.floor((now - ts) / (24 * 3600 * 1000))
    if (diffDays >= 0 && diffDays < days) {
      buckets[days - 1 - diffDays] += 1
    }
  }
  return buckets
}

function Bar({ value, max }: { value: number; max: number }) {
  const h = max === 0 ? 0 : Math.max(2, Math.round((value / max) * 40))
  return (
    <div className="flex flex-col items-center justify-end gap-1 flex-1 min-w-0">
      <div className="text-[9px] text-stone-500">{value}</div>
      <div className="bg-[#00703c] w-full" style={{ height: `${h}px` }} />
    </div>
  )
}

async function safeSelect<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>,
): Promise<T | null> {
  try {
    const { data, error } = await fn()
    if (error) return null
    return data
  } catch {
    return null
  }
}

async function loadScraperSummary(): Promise<{
  platforms: number
  rowsToday: number
  quotaRemaining: number | null
}> {
  const candidates = [
    path.join(process.cwd(), '..', 'trader', 'data'),
    path.join(process.cwd(), 'apps', 'trader', 'data'),
  ]
  let dataDir: string | null = null
  for (const d of candidates) {
    try {
      await fs.access(d)
      dataDir = d
      break
    } catch {}
  }
  if (!dataDir) return { platforms: 0, rowsToday: 0, quotaRemaining: null }

  const entries = await fs.readdir(dataDir, { withFileTypes: true }).catch(() => [])
  const platforms = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name)

  let platformsWithData = 0
  let rowsToday = 0
  for (const p of platforms) {
    const files = await fs.readdir(path.join(dataDir, p)).catch(() => [])
    const jsonl = files.filter((f) => f.endsWith('.jsonl')).sort()
    if (jsonl.length === 0) continue
    platformsWithData++
    const latest = path.join(dataDir, p, jsonl[jsonl.length - 1])
    const text = await fs.readFile(latest, 'utf8').catch(() => '')
    rowsToday += text ? text.split('\n').filter(Boolean).length : 0
  }

  let quotaRemaining: number | null = null
  const quotaFile = path.join(dataDir, 'oddsapi', '.quota.jsonl')
  try {
    const text = await fs.readFile(quotaFile, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    if (lines.length > 0) {
      const last = JSON.parse(lines[lines.length - 1]) as { remaining?: number }
      if (typeof last.remaining === 'number') quotaRemaining = last.remaining
    }
  } catch {}

  return { platforms: platformsWithData, rowsToday, quotaRemaining }
}

export default async function AdminOverview() {
  const admin = getServerClient()

  const [waitlistRows, studentRows, enterpriseRows, scraperSummary] = await Promise.all([
    safeSelect<WaitlistRow[]>(async () =>
      admin
        .from('waitlist')
        .select('created_at, invite_code, invited_at, invite_used_at, referred_by_code, plan_tier, account_type')
        .order('created_at', { ascending: false }),
    ),
    safeSelect<StudentRow[]>(async () =>
      admin.from('student_verification').select('status, submitted_at'),
    ),
    safeSelect<EnterpriseRow[]>(async () =>
      admin
        .from('enterprise_inquiries')
        .select('id, created_at, contact_name, company_name, status, quoted_amount_usd, hardware_interest, hardware_form_factor')
        .order('created_at', { ascending: false }),
    ),
    loadScraperSummary(),
  ])

  if (!waitlistRows) {
    return (
      <div className="border border-red-400 bg-red-50 p-4 text-sm text-red-800">
        Failed to load waitlist — check Supabase connection + service role key.
      </div>
    )
  }

  // --- Waitlist headline stats ---
  const total = waitlistRows.length
  const invited = waitlistRows.filter((r) => r.invite_code).length
  const authed = waitlistRows.filter((r) => r.invite_used_at).length
  const last24 = countInRange(waitlistRows, 24)
  const last7d = countInRange(waitlistRows, 24 * 7)
  const paidTier = waitlistRows.filter((r) => r.plan_tier && r.plan_tier !== 'free').length
  const businessAccounts = waitlistRows.filter((r) => r.account_type === 'business').length
  const invitePending = invited - authed

  const spark = sparkline(waitlistRows, 30)
  const sparkMax = Math.max(...spark, 1)

  // --- Students ---
  const studentCounts = { pending: 0, approved: 0, rejected: 0 }
  if (studentRows) {
    for (const r of studentRows) {
      if (r.status in studentCounts) studentCounts[r.status as keyof typeof studentCounts]++
    }
  }

  // --- Enterprise ---
  const enterprise = enterpriseRows ?? []
  const enterpriseCounts = {
    new: 0,
    contacted: 0,
    qualified: 0,
    negotiating: 0,
    won: 0,
    lost: 0,
  }
  for (const r of enterprise) {
    if (r.status in enterpriseCounts) enterpriseCounts[r.status as keyof typeof enterpriseCounts]++
  }
  const hardwareRequests = enterprise.filter((r) => r.hardware_interest === true)
  const openPipeline = enterprise.filter(
    (r) => r.status !== 'won' && r.status !== 'lost',
  )
  const pipelineValue = openPipeline.reduce((a, r) => a + (r.quoted_amount_usd ?? 0), 0)
  const wonTotal = enterprise
    .filter((r) => r.status === 'won')
    .reduce((a, r) => a + (r.quoted_amount_usd ?? 0), 0)

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} OVERVIEW</div>
        <h1 className="text-2xl font-bold text-stone-900">Admin Console</h1>
      </div>

      {/* Row 1: core waitlist metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Waitlist total" value={total.toLocaleString()} />
        <StatCard label="Invited" value={invited.toLocaleString()} hint={`${total > 0 ? ((invited / total) * 100).toFixed(1) : '0'}% of waitlist`} />
        <StatCard label="Authenticated" value={authed.toLocaleString()} hint={`${invited > 0 ? ((authed / invited) * 100).toFixed(1) : '0'}% of invited`} />
        <StatCard label="Paid tier" value={paidTier.toLocaleString()} hint={`${businessAccounts} business accounts`} />
      </div>

      {/* Row 2: velocity */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Last 24h signups" value={last24.toLocaleString()} />
        <StatCard label="Last 7d signups" value={last7d.toLocaleString()} />
        <StatCard label="Invites pending" value={invitePending.toLocaleString()} hint="Issued, not yet used" />
        <StatCard
          label="Odds API quota"
          value={scraperSummary.quotaRemaining?.toLocaleString() ?? '—'}
          hint={scraperSummary.quotaRemaining == null ? 'No runs logged' : 'Credits left this month'}
          accent={
            scraperSummary.quotaRemaining != null && scraperSummary.quotaRemaining < 50
              ? 'amber'
              : 'default'
          }
        />
      </div>

      {/* Enterprise — Hardware + Pipeline (prominent because hardware is real money) */}
      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} ENTERPRISE PIPELINE</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-stone-300 bg-white p-4 md:col-span-2">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-[10px] text-stone-500 tracking-wider">STATUS BREAKDOWN</div>
              <Link
                href="/admin/enterprise"
                className="text-xs text-emerald-700 hover:underline tracking-wider"
              >
                VIEW ALL →
              </Link>
            </div>
            <div className="grid grid-cols-6 gap-2 text-center">
              {(Object.keys(enterpriseCounts) as Array<keyof typeof enterpriseCounts>).map((k) => (
                <div key={k}>
                  <div className="text-lg font-bold text-stone-900 tabular-nums">
                    {enterpriseCounts[k]}
                  </div>
                  <div className="text-[9px] text-stone-500 tracking-wider uppercase">{k}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-baseline justify-between text-xs">
              <span className="text-stone-600">
                Open pipeline value:{' '}
                <span className="text-stone-900 font-bold tabular-nums">
                  ${pipelineValue.toLocaleString()}
                </span>
              </span>
              <span className="text-stone-600">
                Closed-won:{' '}
                <span className="text-emerald-700 font-bold tabular-nums">
                  ${wonTotal.toLocaleString()}
                </span>
              </span>
            </div>
          </div>

          <div className="border-2 border-emerald-400/60 bg-emerald-50/50 p-4">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[10px] text-emerald-800 tracking-wider font-semibold">
                🖥️ HARDWARE REQUESTS
              </div>
            </div>
            <div className="text-3xl font-bold text-emerald-800 tabular-nums">
              {hardwareRequests.length}
            </div>
            <div className="text-[11px] text-emerald-800/70 mt-1">
              Prospects asking for Mac Studio / MacBook Pro bundles
            </div>
            {hardwareRequests.length > 0 && (
              <div className="mt-3 pt-3 border-t border-emerald-200/60 text-[11px] text-emerald-900 space-y-1">
                {(() => {
                  const byFactor: Record<string, number> = {}
                  for (const r of hardwareRequests) {
                    const k = r.hardware_form_factor ?? 'unspecified'
                    byFactor[k] = (byFactor[k] ?? 0) + 1
                  }
                  return Object.entries(byFactor).map(([k, n]) => (
                    <div key={k} className="flex justify-between">
                      <span className="capitalize">{k.replace('_', ' ')}</span>
                      <span className="tabular-nums font-semibold">{n}</span>
                    </div>
                  ))
                })()}
              </div>
            )}
            {hardwareRequests.length === 0 && enterprise.length === 0 && (
              <div className="text-[11px] text-emerald-800/60 mt-3">
                Awaiting first Enterprise inquiry. Form at /pricing → Contact Sales.
              </div>
            )}
          </div>
        </div>

        {hardwareRequests.length > 0 && (
          <div className="mt-3 border border-stone-300 bg-white">
            <div className="px-4 py-2 border-b border-stone-200 text-[10px] text-stone-500 tracking-wider">
              RECENT HARDWARE REQUESTS
            </div>
            <div className="divide-y divide-stone-100">
              {hardwareRequests.slice(0, 5).map((r) => (
                <Link
                  key={r.id}
                  href="/admin/enterprise"
                  className="px-4 py-2.5 flex items-center justify-between hover:bg-stone-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-900">
                      {r.company_name ?? r.contact_name}
                      <span className="text-[10px] text-stone-400 tracking-wider ml-2">
                        {(r.hardware_form_factor ?? 'unspecified').replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500">
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {r.quoted_amount_usd != null && (
                        <span className="ml-2 text-stone-700 font-mono">
                          ${r.quoted_amount_usd.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-stone-500 tracking-wider uppercase px-2 py-0.5 rounded bg-stone-100">
                    {r.status}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Per-surface status cards */}
      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} BY SURFACE</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <SurfaceCard
            href="/admin/users"
            title="Users"
            metrics={[
              { label: 'waitlist', value: total },
              { label: 'authed', value: authed },
              { label: 'business', value: businessAccounts },
            ]}
          />
          <SurfaceCard
            href="/admin/invites"
            title="Invites"
            metrics={[
              { label: 'issued', value: invited },
              { label: 'used', value: authed },
              { label: 'pending', value: invitePending },
            ]}
          />
          <SurfaceCard
            href="/admin/students"
            title="Students"
            metrics={[
              { label: 'pending', value: studentCounts.pending, highlight: studentCounts.pending > 0 },
              { label: 'approved', value: studentCounts.approved },
              { label: 'rejected', value: studentCounts.rejected },
            ]}
            hint={studentRows ? undefined : 'Table not migrated yet'}
          />
          <SurfaceCard
            href="/admin/enterprise"
            title="Enterprise"
            metrics={[
              { label: 'inquiries', value: enterprise.length },
              { label: 'in progress', value: openPipeline.length },
              { label: 'hardware', value: hardwareRequests.length, highlight: hardwareRequests.length > 0 },
            ]}
            hint={enterpriseRows ? undefined : 'Table not migrated yet'}
          />
          <SurfaceCard
            href="/admin/scrapers"
            title="Scrapers"
            metrics={[
              { label: 'platforms', value: scraperSummary.platforms },
              { label: 'rows today', value: scraperSummary.rowsToday },
              { label: 'quota left', value: scraperSummary.quotaRemaining ?? 0 },
            ]}
          />
          <SurfaceCard
            href="/admin/alerts"
            title="Alerts"
            pending
            briefRef="HANDOFF_NOTIFICATIONS.md"
          />
          <SurfaceCard
            href="/admin/autotrade"
            title="AutoTrade"
            pending
            briefRef="HANDOFF_AUTOTRADE.md"
          />
          <SurfaceCard
            href="/admin/otoole"
            title="O'Toole AI"
            pending
            briefRef="HANDOFF_STRIPE_SUBSCRIPTIONS.md (8e)"
          />
        </div>
      </section>

      {/* Signup velocity */}
      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">
          {'>'} SIGNUP VELOCITY (last 30 days)
        </div>
        <div className="border border-stone-300 bg-white p-4">
          <div className="flex items-end gap-1 h-14">
            {spark.map((v, i) => (
              <Bar key={i} value={v} max={sparkMax} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-stone-500 mt-2">
            <span>30d ago</span>
            <span>today</span>
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} QUICK ACTIONS</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/admin/users" className="border border-stone-300 bg-white hover:bg-stone-50 p-4 transition">
            <div className="text-sm font-semibold text-stone-900">Users →</div>
            <div className="text-xs text-stone-500 mt-1">Search, view referral trees, manage invites</div>
          </Link>
          <Link href="/admin/invites" className="border border-stone-300 bg-white hover:bg-stone-50 p-4 transition">
            <div className="text-sm font-semibold text-stone-900">Issue invites →</div>
            <div className="text-xs text-stone-500 mt-1">Unblock the 100-testers recruitment push</div>
          </Link>
          <Link href="/admin/analytics" className="border border-stone-300 bg-white hover:bg-stone-50 p-4 transition">
            <div className="text-sm font-semibold text-stone-900">Analytics →</div>
            <div className="text-xs text-stone-500 mt-1">Funnel, top referrers, geo, cohort</div>
          </Link>
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  accent = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  accent?: 'default' | 'amber'
}) {
  const cls =
    accent === 'amber'
      ? 'border-amber-400 bg-amber-50'
      : 'border-stone-300 bg-white'
  return (
    <div className={`border ${cls} p-4`}>
      <div className="text-[10px] text-stone-500 tracking-wider mb-1">{label.toUpperCase()}</div>
      <div className={`text-2xl font-bold ${accent === 'amber' ? 'text-amber-800' : 'text-[#00703c]'}`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-stone-500 mt-1">{hint}</div>}
    </div>
  )
}

function SurfaceCard({
  href,
  title,
  metrics,
  hint,
  pending,
  briefRef,
}: {
  href: string
  title: string
  metrics?: Array<{ label: string; value: number; highlight?: boolean }>
  hint?: string
  pending?: boolean
  briefRef?: string
}) {
  return (
    <Link
      href={href}
      className={`block border p-4 transition ${
        pending
          ? 'border-stone-200 bg-stone-50/50 hover:bg-stone-50'
          : 'border-stone-300 bg-white hover:bg-stone-50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-stone-900">{title}</div>
        {pending && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 tracking-wider">
            WIP
          </span>
        )}
      </div>
      {pending ? (
        <div className="text-[11px] text-stone-500">
          Scaffolded. Implemented in <code className="bg-stone-200/60 px-1 rounded">{briefRef}</code>.
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-3 gap-2">
          {metrics.map((m) => (
            <div key={m.label}>
              <div
                className={`text-lg font-bold tabular-nums ${
                  m.highlight ? 'text-amber-700' : 'text-stone-900'
                }`}
              >
                {m.value.toLocaleString()}
              </div>
              <div className="text-[9px] text-stone-500 tracking-wider uppercase">{m.label}</div>
            </div>
          ))}
        </div>
      ) : null}
      {hint && <div className="text-[10px] text-amber-700 mt-2">{hint}</div>}
    </Link>
  )
}
