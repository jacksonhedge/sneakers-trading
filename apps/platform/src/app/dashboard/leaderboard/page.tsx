import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'College Leaderboard — Sneakers Terminal',
}

// Public-to-authed leaderboard view. Lists every user who's opted in via
// /dashboard/leaderboard/join, ordered for now by join time (no real
// rate-of-return yet — that comes when trades/positions land). When P&L
// is real, swap the sort key + add a Returns column.
//
// Empty state: meaningful copy + CTA to verify-and-join, since the landing
// page advertises this page prominently.

type Row = {
  display_name: string | null
  university: string | null
  created_at: string | null
}

function fmtJoined(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default async function LeaderboardPage() {
  const auth = await getAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/signup?next=/dashboard/leaderboard')

  const admin = getServerClient()
  const { data: meProfile } = await admin
    .from('user_profiles')
    .select('joined_leaderboard, display_name, university')
    .eq('user_id', user.id)
    .maybeSingle()

  // Order by created_at as a stand-in for join time. When P&L is real we
  // re-sort by rate-of-return instead.
  const { data: rowsRaw } = await admin
    .from('user_profiles')
    .select('display_name, university, created_at')
    .eq('joined_leaderboard', true)
    .order('created_at', { ascending: true })
    .limit(200)
  const rows = (rowsRaw ?? []) as Row[]

  const userIsOnBoard = Boolean(meProfile?.joined_leaderboard)

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <div className="text-[10px] tracking-[0.15em] text-emerald-700 font-semibold mb-2">
        COLLEGE LEADERBOARD
      </div>
      <h1 className="text-3xl font-bold text-stone-900 mb-2">
        Leaderboard{' '}
        <span className="text-base font-normal text-stone-500">
          ({rows.length.toLocaleString()} {rows.length === 1 ? 'trader' : 'traders'})
        </span>
      </h1>
      <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
        Verified college students who&apos;ve opted in. Ranking by rate-of-return is coming
        when one-click trading goes live; for now, here&apos;s everyone who&apos;s on the
        board in join order.
      </p>

      {!userIsOnBoard && (
        <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-semibold text-emerald-900">You&apos;re not on the board yet.</div>
            <div className="text-xs text-emerald-800 mt-0.5">
              Verify your student status + pick a public handle. Takes ~30 seconds.
            </div>
          </div>
          <Link
            href="/dashboard/leaderboard/join"
            className="shrink-0 self-center text-xs px-3 py-2 tracking-wider bg-[#00703c] text-white hover:bg-[#005a30] transition rounded"
          >
            JOIN →
          </Link>
        </div>
      )}

      <div className="mt-8 border border-stone-200 bg-white rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-600 text-[10px] tracking-wider">
            <tr>
              <th className="text-left px-4 py-2 w-12">#</th>
              <th className="text-left px-4 py-2">HANDLE</th>
              <th className="text-left px-4 py-2">SCHOOL</th>
              <th className="text-left px-4 py-2">RETURN</th>
              <th className="text-right px-4 py-2 w-24">JOINED</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-stone-200">
                <td className="px-4 py-2.5 font-mono tabular-nums text-stone-500">
                  {(i + 1).toString().padStart(2, '0')}
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-stone-900">
                    {r.display_name ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-stone-700">{r.university ?? '—'}</td>
                <td className="px-4 py-2.5 text-stone-400">— pending trades</td>
                <td className="px-4 py-2.5 text-right text-stone-500 font-mono">
                  {fmtJoined(r.created_at)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-stone-500 text-sm">
                  No one on the leaderboard yet — be the first.{' '}
                  <Link
                    href="/dashboard/leaderboard/join"
                    className="text-[#00703c] underline"
                  >
                    Verify and join →
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-[11px] text-stone-500 leading-relaxed max-w-2xl">
        Why is the RETURN column empty? Real trade execution isn&apos;t live yet — when it
        lands, this column flips to live rate-of-return for each trader, refreshed
        nightly. Order will re-sort by performance, not join time.
      </p>
    </div>
  )
}
