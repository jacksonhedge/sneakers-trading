import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function DonePage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/signup?next=/onboarding/done')

  // Flip profile_complete_at = now() on first arrival here. Idempotent —
  // if it's already set we don't overwrite it. Subsequent visits become
  // a no-op so the dashboard auth check (which keys on this column to
  // decide whether to send people back through onboarding) keeps the
  // original timestamp.
  const admin = getServerClient()
  const { data: existing } = await admin
    .from('user_profiles')
    .select('profile_complete_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing?.profile_complete_at) {
    await admin
      .from('user_profiles')
      .upsert(
        {
          user_id: user.id,
          profile_complete_at: new Date().toISOString(),
          current_step: 'done',
        },
        { onConflict: 'user_id' },
      )
  }

  return (
    <div className="space-y-6 text-center">
      <div>
        <div className="text-4xl font-bold text-emerald-400 mb-2">Ready.</div>
        <h1 className="text-xl text-white/90">Your terminal is live.</h1>
        <p className="text-sm text-white/60 mt-2">
          Setup is complete. Your dashboard is configured with what you told us.
        </p>
      </div>

      <div className="pt-4">
        <Link
          href="/dashboard"
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-8 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition"
        >
          OPEN DASHBOARD →
        </Link>
      </div>
    </div>
  )
}
