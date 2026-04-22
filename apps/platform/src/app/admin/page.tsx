import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = {
  created_at: string
  invite_code: string | null
  invited_at: string | null
  invite_used_at: string | null
  referred_by_code: string | null
}

function countInRange(rows: Row[], field: keyof Row, sinceHours: number) {
  const cutoff = Date.now() - sinceHours * 3600 * 1000
  return rows.filter((r) => {
    const v = r[field]
    return typeof v === 'string' && new Date(v).getTime() >= cutoff
  }).length
}

function sparkline(rows: Row[], field: keyof Row, days: number) {
  const buckets = new Array(days).fill(0)
  const now = Date.now()
  for (const r of rows) {
    const v = r[field]
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

export default async function AdminOverview() {
  const admin = getServerClient()
  const { data: rows, error } = await admin
    .from('waitlist')
    .select('created_at, invite_code, invited_at, invite_used_at, referred_by_code')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="border border-red-400 bg-red-50 p-4 text-sm text-red-800">
        Failed to load waitlist: {error.message}
      </div>
    )
  }

  const all = (rows ?? []) as Row[]
  const total = all.length
  const invited = all.filter((r) => r.invite_code).length
  const authed = all.filter((r) => r.invite_used_at).length
  const last24 = countInRange(all, 'created_at', 24)
  const last7d = countInRange(all, 'created_at', 24 * 7)
  const withReferrer = all.filter((r) => r.referred_by_code).length

  const invitePending = invited - authed
  const waitlistConv = total > 0 ? ((invited / total) * 100).toFixed(1) : '0.0'
  const inviteConv = invited > 0 ? ((authed / invited) * 100).toFixed(1) : '0.0'

  const spark = sparkline(all, 'created_at', 30)
  const sparkMax = Math.max(...spark, 1)

  const stats: Array<{ label: string; value: string | number; hint?: string }> = [
    { label: 'WAITLIST TOTAL', value: total.toLocaleString() },
    { label: 'INVITED', value: invited.toLocaleString(), hint: `${waitlistConv}% of waitlist` },
    { label: 'AUTHENTICATED', value: authed.toLocaleString(), hint: `${inviteConv}% of invited` },
    { label: 'INVITES PENDING', value: invitePending.toLocaleString() },
    { label: 'LAST 24H SIGNUPS', value: last24.toLocaleString() },
    { label: 'LAST 7D SIGNUPS', value: last7d.toLocaleString() },
    { label: 'REFERRED SIGNUPS', value: withReferrer.toLocaleString(), hint: `${total > 0 ? ((withReferrer / total) * 100).toFixed(1) : '0.0'}% of total` },
  ]

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} OVERVIEW</div>
        <h1 className="text-2xl font-bold text-stone-900">Admin Console</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="border border-stone-300 bg-white p-4">
            <div className="text-[10px] text-stone-500 tracking-wider mb-1">{s.label}</div>
            <div className="text-2xl font-bold text-[#00703c]">{s.value}</div>
            {s.hint && <div className="text-[10px] text-stone-500 mt-1">{s.hint}</div>}
          </div>
        ))}
      </div>

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
