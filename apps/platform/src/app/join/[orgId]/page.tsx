import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerClient } from '@/lib/supabase-server'
import { JoinSignupForm } from './join-signup-form'

export const dynamic = 'force-dynamic'

// Public join landing for org members. Captain shares
// `https://sneakersterminal.com/join/<orgId>` with their brothers; each
// click lands here, sees the org info, signs up with one form, drops into
// the dashboard as a tracked member of the org.
//
// Uses the full org UUID in the URL — no migration needed for an invite-
// token column. Pretty slugs are a follow-up if we want them.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  if (!isUuid(orgId)) return { title: 'Join — Sneakers Terminal' }
  const admin = getServerClient()
  const { data } = await admin
    .from('organization_signups')
    .select('org_name')
    .eq('id', orgId)
    .maybeSingle()
  if (!data) return { title: 'Join — Sneakers Terminal' }
  return {
    title: `Join ${data.org_name} — Sneakers Terminal`,
    description: `${data.org_name} just joined Sneakers Terminal. Get in via your captain's link.`,
  }
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  if (!isUuid(orgId)) notFound()

  const admin = getServerClient()
  const { data: org } = await admin
    .from('organization_signups')
    .select('id, org_name, org_type, org_college, org_leader_name, status')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) notFound()

  const isApproved = org.status === 'approved' || org.status === 'active'

  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-stone-950">
      {/* Subtle emerald glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-[600px] h-[600px] rounded-full bg-emerald-500/15 blur-[100px] pointer-events-none"
        aria-hidden
      />

      <nav className="relative z-10 px-6 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="text-xs text-emerald-300/80 tracking-wider hover:text-emerald-300 transition"
        >
          ← SNEAKERS TERMINAL
        </Link>
        <div className="text-[10px] tracking-[0.2em] text-white/50 font-semibold">
          GROUP INVITE
        </div>
      </nav>

      <div className="relative z-10 flex items-center justify-center px-6 py-10 min-h-[calc(100vh-64px)]">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-stone-950/70 backdrop-blur-xl ring-1 ring-emerald-400/30 shadow-[0_24px_72px_rgba(0,0,0,0.6),0_0_64px_rgba(16,185,129,0.12)] p-7 md:p-8">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="rounded-full bg-stone-950 p-3 ring-1 ring-emerald-400/40 shadow-[0_0_32px_rgba(16,185,129,0.25)] mb-4">
                <Image
                  src="/logo.png"
                  alt="Sneakers"
                  width={56}
                  height={56}
                  priority
                />
              </div>
              <div className="text-[10px] tracking-[0.2em] text-emerald-300/80 font-semibold mb-1">
                YOU&apos;RE INVITED TO
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                {org.org_name}
              </h1>
              <div className="mt-1 text-sm text-white/65">
                {org.org_type && <span className="capitalize">{org.org_type}</span>}
                {org.org_type && org.org_college && (
                  <span className="mx-2 text-white/30">·</span>
                )}
                {org.org_college}
              </div>
              {org.org_leader_name && (
                <div className="mt-2 text-xs text-white/55">
                  Captain: <span className="text-white/85">{org.org_leader_name}</span>
                </div>
              )}
              {!isApproved && (
                <div className="mt-3 text-[10px] tracking-wider font-semibold text-amber-300 bg-amber-500/10 ring-1 ring-amber-400/30 px-2 py-1 rounded">
                  ORG PENDING REVIEW · CAPTAIN WILL APPROVE YOU
                </div>
              )}
              <div className="mt-2 text-[10px] tracking-wider font-medium text-white/55">
                Your sign-in goes through immediately. The captain reviews + approves
                your roster row separately.
              </div>
            </div>

            <JoinSignupForm orgId={org.id} orgName={org.org_name} />

            <div className="mt-6 pt-5 border-t border-white/10 text-xs text-white/55 text-center leading-relaxed">
              Already in?{' '}
              <Link
                href={`/login`}
                className="text-emerald-300/90 hover:text-emerald-300 underline underline-offset-4"
              >
                Sign in to your existing account
              </Link>
              .
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}
