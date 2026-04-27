import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { InviteFriendsForm } from './invite-friends-form'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

export default async function InviteFriendsPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/signup?next=/onboarding/invite-friends')

  const admin = getServerClient()
  const [{ data: profile }, { data: row }] = await Promise.all([
    admin
      .from('user_profiles')
      .select('invites_sent_emails')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('waitlist')
      .select('referral_code')
      .eq('email', user.email.toLowerCase())
      .maybeSingle(),
  ])

  const referralUrl = row?.referral_code
    ? `${SITE_URL}/r/${row.referral_code}`
    : SITE_URL

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">
          Bring your inner circle
        </h1>
        <p className="text-sm text-white/60 mt-2">
          Share your link, or list a few emails. Both move you up the queue and unlock
          features faster.
        </p>
      </div>
      <InviteFriendsForm
        initialEmails={(profile?.invites_sent_emails as string[] | null) ?? []}
        referralUrl={referralUrl}
      />
    </div>
  )
}
