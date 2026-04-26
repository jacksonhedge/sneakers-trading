import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Profile — Sneakers Terminal',
}

// User profile. Shows account state + a Captain section if the user
// happens to be the leader of an organization. The captain affordance
// inlines a quick "Manage members" CTA + recent invitation count instead
// of forcing them to a separate route.
//
// All data fetched server-side via service role (no anon RLS dance).

export default async function ProfilePage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/signup?next=/dashboard/profile')

  const email = user.email.toLowerCase()
  const admin = getServerClient()

  // Pull the user's waitlist row + profile + verification status + captain
  // org status all in parallel — single round trip.
  const [waitlistRes, profileRes, verifRes, orgRes] = await Promise.all([
    admin
      .from('waitlist')
      .select('email, plan_tier, account_type, referral_code, direct_referrals, indirect_referrals')
      .eq('email', email)
      .maybeSingle(),
    admin
      .from('user_profiles')
      .select('display_name, university, joined_leaderboard, joined_treasury, joined_autotrade_waitlist')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('student_verification')
      .select('status, university_name, expires_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('organization_signups')
      .select('id, org_name, org_type, org_college, status')
      .eq('org_leader_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Email-fallback for legacy rows where org_leader_user_id hasn't been
  // backfilled yet. post-signin populates it on first sign-in; this branch
  // becomes a no-op for active captains.
  let orgRow = orgRes.data
  if (!orgRow) {
    const fallback = await admin
      .from('organization_signups')
      .select('id, org_name, org_type, org_college, status')
      .is('org_leader_user_id', null)
      .eq('org_leader_email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    orgRow = fallback.data
  }

  const waitlist = waitlistRes.data
  const profile = profileRes.data
  const verification = verifRes.data
  const org = orgRow

  // If they're a captain, also pull invitation counts for the inline summary.
  let inviteCounts = { accepted: 0, pending: 0, total: 0 }
  if (org) {
    const { data: invs } = await admin
      .from('organization_member_invitations')
      .select('status')
      .eq('org_id', org.id)
    if (invs) {
      inviteCounts.total = invs.length
      inviteCounts.accepted = invs.filter((i) => i.status === 'accepted').length
      inviteCounts.pending = invs.filter(
        (i) => i.status === 'pending' || i.status === 'sent',
      ).length
    }
  }

  const initial = email[0]?.toUpperCase() ?? '?'
  const planTier = waitlist?.plan_tier ?? 'free'
  const isEdu = email.endsWith('.edu') || /\.edu\.[a-z]{2,3}$/.test(email)

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        {/* Header */}
        <div className="mt-6 mb-8 flex items-center gap-5 flex-wrap">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-2xl font-bold ring-2 ring-emerald-600/40 shadow-md">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-emerald-700 tracking-wider font-semibold mb-1">
              YOUR PROFILE
            </div>
            <div className="text-2xl font-bold text-stone-900 break-all">
              {profile?.display_name ?? email}
            </div>
            {profile?.display_name && (
              <div className="text-sm text-stone-600 break-all">{email}</div>
            )}
          </div>
        </div>

        {/* Captain section — top priority if applicable */}
        {org && (
          <CaptainCard org={org} counts={inviteCounts} />
        )}

        {/* Account info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card>
            <Label>EMAIL</Label>
            <div className="text-sm font-mono text-stone-900 break-all">{email}</div>
            {isEdu && (
              <div className="mt-2 text-[11px] text-emerald-700 font-semibold tracking-wider">
                ✓ .EDU DETECTED
              </div>
            )}
          </Card>

          <Card>
            <Label>PLAN</Label>
            <div className="text-sm font-bold text-stone-900 capitalize">{planTier}</div>
            {planTier === 'free' && (
              <Link
                href="/pricing"
                className="mt-2 inline-block text-xs text-emerald-700 hover:text-emerald-800 underline"
              >
                See pricing →
              </Link>
            )}
          </Card>

          <Card>
            <Label>STUDENT VERIFICATION</Label>
            {verification ? (
              <>
                <StatusBadge status={verification.status ?? 'pending'} />
                {verification.university_name && (
                  <div className="text-xs text-stone-600 mt-1">
                    {verification.university_name}
                  </div>
                )}
                {verification.expires_at && (
                  <div className="text-[10px] text-stone-500 mt-1">
                    Expires {new Date(verification.expires_at).toLocaleDateString()}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-sm text-stone-600">Not submitted</div>
                <Link
                  href="/students"
                  className="mt-2 inline-block text-xs text-emerald-700 hover:text-emerald-800 underline"
                >
                  Verify for 75% off →
                </Link>
              </>
            )}
          </Card>

          <Card>
            <Label>UNIVERSITY</Label>
            <div className="text-sm text-stone-900">
              {profile?.university ?? <span className="text-stone-500">Not set</span>}
            </div>
          </Card>

          <Card>
            <Label>REFERRALS</Label>
            <div className="flex items-baseline gap-3">
              <div>
                <div className="text-2xl font-bold font-mono tabular-nums text-stone-900">
                  {waitlist?.direct_referrals ?? 0}
                </div>
                <div className="text-[10px] text-stone-500 tracking-wider">DIRECT</div>
              </div>
              <div className="border-l border-stone-200 pl-3">
                <div className="text-2xl font-bold font-mono tabular-nums text-stone-700">
                  {waitlist?.indirect_referrals ?? 0}
                </div>
                <div className="text-[10px] text-stone-500 tracking-wider">INDIRECT</div>
              </div>
            </div>
            {waitlist?.referral_code && (
              <div className="mt-3 text-[11px] text-stone-600">
                Your link:{' '}
                <code className="bg-stone-100 px-1.5 py-0.5 rounded text-emerald-700 font-mono">
                  /r/{waitlist.referral_code}
                </code>
              </div>
            )}
          </Card>

          <Card>
            <Label>BOT &amp; WALLET</Label>
            <div className="space-y-1.5 text-xs">
              <Row label="Leaderboard" yes={profile?.joined_leaderboard ?? false} href="/dashboard/leaderboard/join" />
              <Row label="Treasury" yes={profile?.joined_treasury ?? false} href="/dashboard/treasury" />
              <Row label="Autotrade waitlist" yes={profile?.joined_autotrade_waitlist ?? false} href="/dashboard/settings/autotrade" />
            </div>
          </Card>
        </div>

        {/* Quick links */}
        <div className="rounded-lg ring-1 ring-stone-200 bg-white p-5">
          <Label>QUICK LINKS</Label>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <QuickLink href="/dashboard" label="Dashboard" />
            <QuickLink href="/dashboard/billing" label="Billing & subscription" />
            <QuickLink href="/dashboard/settings/otoole" label="O'Toole settings" />
            <QuickLink href="/dashboard/settings/autotrade" label="Autotrade waitlist" />
            <QuickLink href="/dashboard/treasury" label="Chapter treasury" />
            <QuickLink href="/pricing" label="Pricing" />
          </div>
        </div>
      </div>
    </main>
  )
}

function CaptainCard({
  org,
  counts,
}: {
  org: { id: string; org_name: string; org_type: string | null; org_college: string | null; status: string | null }
  counts: { accepted: number; pending: number; total: number }
}) {
  return (
    <section className="rounded-xl bg-gradient-to-br from-emerald-950 via-stone-900 to-stone-950 ring-1 ring-emerald-400/40 p-6 mb-6 text-white shadow-[0_8px_32px_rgba(16,185,129,0.18)]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-1">
            YOU&apos;RE THE CAPTAIN OF
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{org.org_name}</h2>
          <div className="mt-1 text-xs text-white/65">
            {org.org_type && <span className="capitalize">{org.org_type}</span>}
            {org.org_type && org.org_college && <span className="mx-2 text-white/30">·</span>}
            {org.org_college}
          </div>
        </div>
        <span
          className={`text-[10px] tracking-[0.15em] font-bold px-2.5 py-1 rounded-full ring-1 ${
            org.status === 'approved'
              ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/50'
              : 'bg-amber-500/15 text-amber-300 ring-amber-400/40'
          }`}
        >
          {(org.status ?? 'pending').toUpperCase()}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <Stat n={counts.accepted} label="ACCEPTED" />
        <Stat n={counts.pending} label="PENDING" />
        <Stat n={counts.total} label="TOTAL" />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/dashboard/org?tab=members"
          className="bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold tracking-wider px-5 py-2.5 rounded transition"
        >
          ADD MEMBERS →
        </Link>
        <Link
          href="/dashboard/org"
          className="bg-white/5 hover:bg-white/10 ring-1 ring-white/20 text-white text-sm font-semibold tracking-wider px-5 py-2.5 rounded transition"
        >
          MANAGE ORG
        </Link>
      </div>

      <div className="mt-4 pt-4 border-t border-emerald-400/20 text-[11px] text-white/65 leading-relaxed">
        <span className="text-emerald-300/80 font-semibold tracking-wider">
          QUICK ROSTER:
        </span>{' '}
        text your join link to the chapter →{' '}
        <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-300 font-mono break-all">
          sneakersterminal.com/join/{org.id.slice(0, 8)}…
        </code>
      </div>
    </section>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="text-3xl font-bold font-mono tabular-nums text-emerald-300 leading-none">
        {n}
      </div>
      <div className="text-[10px] text-white/55 tracking-wider mt-1">{label}</div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg ring-1 ring-stone-200 bg-white p-5">{children}</div>
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] tracking-[0.15em] text-stone-500 font-semibold mb-2">
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    approved: { label: 'APPROVED', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
    pending: { label: 'PENDING', cls: 'bg-amber-100 text-amber-800 ring-amber-300' },
    rejected: { label: 'REJECTED', cls: 'bg-red-100 text-red-800 ring-red-300' },
    pending_reverification: {
      label: 'REVERIFY',
      cls: 'bg-blue-100 text-blue-800 ring-blue-300',
    },
  }
  const meta = map[status] ?? map.pending
  return (
    <span
      className={`text-[10px] tracking-[0.15em] font-bold px-2 py-0.5 rounded-full ring-1 ${meta.cls}`}
    >
      {meta.label}
    </span>
  )
}

function Row({ label, yes, href }: { label: string; yes: boolean; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-stone-700">{label}</span>
      {yes ? (
        <span className="text-emerald-700 font-semibold text-[10px] tracking-wider">✓ JOINED</span>
      ) : (
        <Link href={href} className="text-emerald-700 hover:text-emerald-800 text-[10px] underline">
          Join →
        </Link>
      )}
    </div>
  )
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition"
    >
      {label} →
    </Link>
  )
}
