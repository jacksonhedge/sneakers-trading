import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin-auth'
import { SignOutButton } from '@/app/dashboard/sign-out-button'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Pending — Sneakers Terminal',
}

// Holding-pattern page for users whose Supabase auth is good but who
// haven't been approved yet (waitlist row exists with invite_used_at:
// null). Dashboard layout redirects them here. Admins skip this gate
// entirely. If somehow an approved user lands here, we send them back
// to /dashboard.

export default async function PendingPage() {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/login?next=/pending')

  // Admins don't belong here — bounce to dashboard.
  if (isAdminEmail(user.email)) redirect('/dashboard')

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('invite_used_at, invited_at, source, account_type, avatar_emoji, avatar_color')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  // Already approved → go straight to dashboard.
  if (row?.invite_used_at) redirect('/dashboard')

  const joined = row?.invited_at
    ? new Date(row.invited_at).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-6">
          <span className="w-16 h-16 rounded-full bg-stone-950 flex items-center justify-center ring-1 ring-emerald-500/40 overflow-hidden p-2.5">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={64}
              height={64}
              priority
              className="w-full h-full object-contain"
            />
          </span>
        </div>

        <div className="rounded-2xl bg-white ring-1 ring-stone-200 shadow-sm p-7 text-center">
          <div className="text-[10px] tracking-[0.2em] text-emerald-700 font-semibold mb-2">
            ON THE WAITLIST
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">
            You&apos;re in line.
          </h1>
          <p className="text-sm text-stone-600 leading-relaxed mb-6">
            Your account is created and you&apos;re on the Sneakers Terminal
            waitlist. We&apos;re onboarding new traders in batches — you&apos;ll
            get an email the moment your seat opens.
          </p>

          <div className="bg-stone-50 rounded-lg ring-1 ring-stone-200 px-4 py-3 text-left text-xs space-y-1.5 mb-6">
            <Row label="Email">{user.email}</Row>
            {joined && <Row label="Joined">{joined}</Row>}
            <Row label="Status">
              <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"
                  aria-hidden
                />
                Pending approval
              </span>
            </Row>
          </div>

          <p className="text-[11px] text-stone-500 leading-relaxed mb-6">
            Have an invite code? Sign out and re-sign-up with the code to skip
            the line.
          </p>

          <div className="flex items-center justify-center gap-3 text-xs">
            <Link
              href="/"
              className="text-stone-500 hover:text-stone-900 underline"
            >
              ← Home
            </Link>
            <span className="text-stone-300">·</span>
            <SignOutButton />
          </div>
        </div>

        <div className="text-[11px] text-stone-400 text-center mt-6">
          Need help? Email{' '}
          <a
            href="mailto:hello@sneakersterminal.com"
            className="text-emerald-700 hover:text-emerald-800 underline"
          >
            hello@sneakersterminal.com
          </a>
          .
        </div>
      </div>
    </main>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] tracking-wider text-stone-500 font-semibold">
        {label.toUpperCase()}
      </span>
      <span className="text-stone-900 truncate">{children}</span>
    </div>
  )
}
