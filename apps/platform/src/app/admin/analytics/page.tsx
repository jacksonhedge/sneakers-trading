import Link from 'next/link'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  email: string
  created_at: string
  ip_country: string | null
  referral_code: string | null
  direct_referrals: number
  indirect_referrals: number
  invite_code: string | null
  invite_used_at: string | null
  referred_by_code: string | null
}

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max === 0 ? 0 : (value / max) * 100
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-stone-700 tracking-wider">{label}</span>
        <span className="text-stone-900 font-mono">
          {value.toLocaleString()}{' '}
          <span className="text-stone-500">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-6 bg-stone-200 w-full relative">
        <div
          className="h-full bg-[#00703c]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function DailyBar({ value, max }: { value: number; max: number }) {
  const h = max === 0 ? 0 : Math.max(2, Math.round((value / max) * 80))
  return (
    <div className="flex flex-col items-center justify-end gap-1 flex-1 min-w-0">
      <div className="bg-[#00703c] w-full" style={{ height: `${h}px` }} />
    </div>
  )
}

export default async function AnalyticsPage() {
  const admin = getServerClient()

  const { data, error } = await admin
    .from('waitlist')
    .select(
      'id, email, created_at, ip_country, referral_code, direct_referrals, indirect_referrals, invite_code, invite_used_at, referred_by_code',
    )

  if (error) {
    return (
      <div className="border border-red-400 bg-red-50 p-4 text-sm text-red-800">
        Failed to load analytics: {error.message}
      </div>
    )
  }

  const rows = (data ?? []) as Row[]

  // Funnel
  const total = rows.length
  const invited = rows.filter((r) => r.invite_code).length
  const authed = rows.filter((r) => r.invite_used_at).length

  // Top referrers (by direct_referrals + indirect_referrals), show those with at least 1
  const topReferrers = rows
    .filter((r) => r.direct_referrals > 0 || r.indirect_referrals > 0)
    .sort(
      (a, b) =>
        5 * b.direct_referrals + 2 * b.indirect_referrals -
        (5 * a.direct_referrals + 2 * a.indirect_referrals),
    )
    .slice(0, 10)

  // Geo breakdown
  const geoMap = new Map<string, number>()
  for (const r of rows) {
    const c = r.ip_country ?? 'unknown'
    geoMap.set(c, (geoMap.get(c) ?? 0) + 1)
  }
  const geo = [...geoMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  const geoMax = Math.max(...geo.map(([, n]) => n), 1)

  // Daily chart last 60 days
  const DAYS = 60
  const daily = new Array(DAYS).fill(0)
  const now = Date.now()
  for (const r of rows) {
    const ts = new Date(r.created_at).getTime()
    const diff = Math.floor((now - ts) / (24 * 3600 * 1000))
    if (diff >= 0 && diff < DAYS) daily[DAYS - 1 - diff] += 1
  }
  const dailyMax = Math.max(...daily, 1)

  // Referral-depth histogram — how many rows have referred_by_code
  const referredCount = rows.filter((r) => r.referred_by_code).length
  const directSignups = total - referredCount

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} ANALYTICS</div>
        <h1 className="text-2xl font-bold text-stone-900">Funnel & Cohort</h1>
      </div>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-3">{'>'} SIGNUP FUNNEL</div>
        <div className="border border-stone-300 bg-white p-5 space-y-4">
          <FunnelBar label="WAITLIST" value={total} max={total} />
          <FunnelBar label="INVITED" value={invited} max={total} />
          <FunnelBar label="AUTHED" value={authed} max={total} />
          <div className="grid grid-cols-3 gap-3 text-xs text-stone-600 pt-3 border-t border-stone-200">
            <div>
              <span className="tracking-wider">WAITLIST → INVITED</span>
              <div className="text-lg font-bold text-stone-900">
                {total > 0 ? ((invited / total) * 100).toFixed(1) : '0.0'}%
              </div>
            </div>
            <div>
              <span className="tracking-wider">INVITED → AUTHED</span>
              <div className="text-lg font-bold text-stone-900">
                {invited > 0 ? ((authed / invited) * 100).toFixed(1) : '0.0'}%
              </div>
            </div>
            <div>
              <span className="tracking-wider">WAITLIST → AUTHED</span>
              <div className="text-lg font-bold text-stone-900">
                {total > 0 ? ((authed / total) * 100).toFixed(1) : '0.0'}%
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-3">{'>'} DAILY SIGNUPS (last {DAYS} days)</div>
        <div className="border border-stone-300 bg-white p-4">
          <div className="flex items-end gap-0.5 h-24">
            {daily.map((v, i) => (
              <DailyBar key={i} value={v} max={dailyMax} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-stone-500 mt-2">
            <span>{DAYS}d ago</span>
            <span>peak {dailyMax}/day</span>
            <span>today</span>
          </div>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-3">{'>'} TOP REFERRERS</div>
        <div className="border border-stone-300 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-stone-100 text-stone-600 tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">EMAIL</th>
                <th className="text-left px-3 py-2">CODE</th>
                <th className="text-right px-3 py-2">DIRECT</th>
                <th className="text-right px-3 py-2">INDIRECT</th>
                <th className="text-right px-3 py-2">BOOST</th>
              </tr>
            </thead>
            <tbody>
              {topReferrers.map((r, i) => (
                <tr key={r.id} className="border-t border-stone-200 hover:bg-stone-50">
                  <td className="px-3 py-2 text-stone-500">{i + 1}</td>
                  <td className="px-3 py-2 font-mono">
                    <Link href={`/admin/users/${r.id}`} className="hover:underline">
                      {r.email}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-stone-700">{r.referral_code}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.direct_referrals}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.indirect_referrals}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#00703c] font-bold">
                    +{5 * r.direct_referrals + 2 * r.indirect_referrals}
                  </td>
                </tr>
              ))}
              {topReferrers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                    No referrers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-3">{'>'} GEO</div>
        <div className="border border-stone-300 bg-white p-4">
          <div className="space-y-2">
            {geo.map(([country, n]) => {
              const pct = (n / geoMax) * 100
              return (
                <div key={country}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-mono text-stone-800">{country}</span>
                    <span className="text-stone-500">{n}</span>
                  </div>
                  <div className="h-2 bg-stone-200 w-full">
                    <div className="h-full bg-[#00703c]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-3">{'>'} REFERRAL SOURCE</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-stone-300 bg-white p-4">
            <div className="text-[10px] text-stone-500 tracking-wider mb-1">DIRECT (no referrer)</div>
            <div className="text-2xl font-bold text-stone-900">{directSignups.toLocaleString()}</div>
            <div className="text-[10px] text-stone-500 mt-1">
              {total > 0 ? ((directSignups / total) * 100).toFixed(1) : '0.0'}% of signups
            </div>
          </div>
          <div className="border border-stone-300 bg-white p-4">
            <div className="text-[10px] text-stone-500 tracking-wider mb-1">REFERRED</div>
            <div className="text-2xl font-bold text-[#00703c]">{referredCount.toLocaleString()}</div>
            <div className="text-[10px] text-stone-500 mt-1">
              {total > 0 ? ((referredCount / total) * 100).toFixed(1) : '0.0'}% of signups
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
