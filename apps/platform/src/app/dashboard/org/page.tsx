import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { OrgDashboard } from './org-dashboard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Organization — Sneakers Terminal',
}

// Captain-only dashboard for the org. Single route, 5 tabs (Members /
// Seats / Treasury / Bot / Settings). Access gate: the authed user's
// email must match an organization_signups.org_leader_email row.
//
// Phase 1+2 (this commit): route + tab nav + Members tab with paste-list
// + CSV upload + roster view.
//
// Future phases: Seats inline upgrade, Treasury folded in, Bot config,
// captain-transfer Settings, Google OAuth contact sync.

export default async function OrgDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/signup?next=/dashboard/org')

  const admin = getServerClient()
  const { data: org } = await admin
    .from('organization_signups')
    .select('id, org_name, org_type, org_college, org_leader_name, status, created_at')
    .eq('org_leader_email', user.email.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!org) {
    return <NotACaptain email={user.email} />
  }

  // Pull current invite roster for the Members tab. Cap at 200 — anything
  // larger is a UI issue we'll handle later (pagination + search).
  const { data: invitations } = await admin
    .from('organization_member_invitations')
    .select('id, invited_email, status, invited_at, sent_at, accepted_at')
    .eq('org_id', org.id)
    .order('invited_at', { ascending: false })
    .limit(200)

  const sp = await searchParams
  const initialTab =
    sp.tab && ['members', 'seats', 'treasury', 'bot', 'settings'].includes(sp.tab)
      ? sp.tab
      : 'members'

  return (
    <OrgDashboard
      org={{
        id: org.id,
        name: org.org_name,
        type: org.org_type,
        college: org.org_college,
        leaderName: org.org_leader_name,
        status: org.status ?? 'pending',
      }}
      initialInvitations={invitations ?? []}
      initialTab={initialTab as 'members' | 'seats' | 'treasury' | 'bot' | 'settings'}
    />
  )
}

function NotACaptain({ email }: { email: string }) {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="text-xs text-emerald-700 tracking-wider font-semibold mb-3">
          ORGANIZATION DASHBOARD
        </div>
        <h1 className="text-2xl font-bold mb-3">No org found for this account.</h1>
        <p className="text-sm text-stone-600 leading-relaxed mb-6">
          We don&apos;t have an organization registered to{' '}
          <span className="font-mono text-stone-900 break-all">{email}</span>. The captain
          dashboard is only visible to whoever submitted the org signup form.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold tracking-wider px-6 py-3 rounded transition"
          >
            REGISTER YOUR ORG →
          </Link>
          <Link
            href="/dashboard"
            className="inline-block bg-stone-200 hover:bg-stone-300 text-stone-900 text-sm font-semibold tracking-wider px-6 py-3 rounded transition"
          >
            BACK TO DASHBOARD
          </Link>
        </div>
        <div className="mt-8 text-xs text-stone-500 leading-relaxed">
          Got an org under a different email? Sign in with that one. Captain access is
          tied to whichever email submitted the signup.
        </div>
      </div>
    </main>
  )
}
