import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { getVerificationStatus } from '@/lib/student'
import { JoinForm } from './join-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Join the College Leaderboard — Sneakers Terminal',
}

// Gate: must be signed in AND have an approved student_verification row.
// Non-verified users see a prompt to go verify; verified users see the
// handle + college form.

export default async function LeaderboardJoinPage() {
  const auth = await getAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/signup?next=/dashboard/leaderboard/join')

  const status = await getVerificationStatus(user.id)
  const admin = getServerClient()

  // If they already opted in, skip straight to the leaderboard.
  const { data: profile } = await admin
    .from('user_profiles')
    .select('joined_leaderboard, display_name, university')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.joined_leaderboard) {
    redirect('/dashboard/leaderboard')
  }

  // Verification gate
  if (status !== 'approved') {
    return (
      <div className="max-w-xl mx-auto py-16 px-6 text-stone-900">
        <div className="text-[10px] tracking-[0.15em] text-emerald-700 font-semibold mb-3">
          COLLEGE LEADERBOARD
        </div>
        <h1 className="text-2xl font-bold mb-3">Verify your student status first.</h1>
        <p className="text-sm text-stone-700 leading-relaxed mb-6">
          The leaderboard is gated to verified college students — keeps the board honest and
          prevents randos from spamming the rankings. Submit your .edu email + 30-second
          verification form and you&apos;ll be in.
        </p>
        <Link
          href="/students"
          className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold tracking-wider px-6 py-3 rounded transition"
        >
          VERIFY STUDENT STATUS →
        </Link>
        <div className="mt-6 text-xs text-stone-500">
          Current status:{' '}
          <span className="font-semibold text-stone-700">
            {status === 'none' ? 'not submitted' : status}
          </span>
        </div>
      </div>
    )
  }

  // Verified — show the form.
  return (
    <div className="max-w-xl mx-auto py-16 px-6 text-stone-900">
      <div className="text-[10px] tracking-[0.15em] text-emerald-700 font-semibold mb-3">
        COLLEGE LEADERBOARD
      </div>
      <h1 className="text-2xl font-bold mb-3">Join the board.</h1>
      <p className="text-sm text-stone-700 leading-relaxed mb-6">
        Pick a handle and confirm your school. You&apos;ll compete on <strong>stake-weighted
        return on investment</strong> across any paper positions you open. Top 50 per school, top
        100 nationally, refreshed every market resolution.
      </p>
      <JoinForm />
      <div className="mt-8 text-xs text-stone-500 space-y-2 leading-relaxed">
        <div>
          <strong>Paper trading only</strong> — stake simulated dollars on any market, P&amp;L
          resolves when the market settles. No real money moves.
        </div>
        <div>
          <strong>Minimums to rank publicly</strong>: 5 resolved positions, $100 total cumulative
          stake. Keeps the board from being gamed by one lucky $1 bet.
        </div>
      </div>
    </div>
  )
}
