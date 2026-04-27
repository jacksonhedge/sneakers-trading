import Image from 'next/image'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { SignupForm } from './signup-form'
import { TerminalBackdrop } from './terminal-backdrop'
import { isValidInviteCodeFormat } from '@/lib/invite-code'
import { isValidReferralCodeFormat } from '@/lib/referral-code'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Sign up — Sneakers Terminal',
}

// Immersive sign-up experience. The trading terminal renders behind a dark
// overlay so visitors literally see what they're signing up for. Form sits
// on top in a glass card.
//
// Renders a decorative TerminalBackdrop (no real data, no auth needed) so
// the visual works even when scrapers/Postgres are quiet.

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const sp = await searchParams
  const rawCode = sp.code?.toUpperCase()
  const initialCode = rawCode && isValidInviteCodeFormat(rawCode) ? rawCode : undefined

  // Pick up the referral cookie set by /r/[code] so the waitlist fallback
  // path can attribute this signup to the referrer. Without this read,
  // /signup → /api/waitlist → never gets the code → trigger never fires.
  const cookieStore = await cookies()
  const rawRef = cookieStore.get('sneakers_ref')?.value ?? null
  const referralCode = rawRef && isValidReferralCodeFormat(rawRef) ? rawRef : null

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* Layer 1 (base) — decorative terminal mock at full size + opacity.
          opacity-50 keeps it visibly there but recessed; sm-blur softens
          edges so it reads as ambient texture, not foreground content. */}
      <div
        className="absolute inset-0 z-0 opacity-50 blur-[1.5px] pointer-events-none select-none"
        aria-hidden
      >
        <TerminalBackdrop />
      </div>

      {/* Layer 2 — dark wash on top of the terminal so the form has
          contrast. Semi-transparent so the terminal still bleeds through. */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-br from-stone-950/75 via-stone-950/60 to-stone-950/85 pointer-events-none" />

      {/* Layer 3 — emerald glow centered behind the form */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2] w-[600px] h-[600px] rounded-full bg-emerald-500/15 blur-[100px] pointer-events-none"
        aria-hidden
      />

      {/* Top nav — back link + logo */}
      <nav className="relative z-10 px-6 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="text-xs text-emerald-300/80 tracking-wider hover:text-emerald-300 transition"
        >
          ← BACK
        </Link>
        <div className="text-[10px] tracking-[0.2em] text-white/50 font-semibold">
          SNEAKERS TERMINAL
        </div>
      </nav>

      {/* Centered glass form card */}
      <div className="relative z-10 flex items-center justify-center px-6 py-10 min-h-[calc(100vh-64px)]">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-stone-950/70 backdrop-blur-xl ring-1 ring-emerald-400/30 shadow-[0_24px_72px_rgba(0,0,0,0.6),0_0_64px_rgba(16,185,129,0.12)] p-7 md:p-8">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="rounded-full bg-stone-950 p-3 ring-1 ring-emerald-400/40 shadow-[0_0_32px_rgba(16,185,129,0.25)] mb-4">
                <Image
                  src="/logo.png"
                  alt="Sneakers"
                  width={64}
                  height={64}
                  priority
                />
              </div>
              <div className="text-[10px] tracking-[0.2em] text-emerald-300/80 font-semibold mb-1">
                SIGN UP · INDIVIDUAL
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                {initialCode ? 'Finish signing up.' : 'Create your account.'}
              </h1>
              <p className="text-sm text-white/70 mt-2 leading-relaxed">
                {initialCode
                  ? 'Your invite code is ready. Set up your account to drop into the terminal.'
                  : 'Email, name, password — then your access code (or join the waitlist).'}
              </p>
            </div>

            <SignupForm initialCode={initialCode} referralCode={referralCode} />

            <div className="mt-6 pt-5 border-t border-white/10 text-xs text-white/55 text-center leading-relaxed">
              No code yet?{' '}
              <Link
                href="/"
                className="text-emerald-300/90 hover:text-emerald-300 underline underline-offset-4"
              >
                Join the waitlist on the homepage
              </Link>
              .
            </div>
          </div>

          <div className="mt-4 text-center text-[11px] text-white/40 tracking-wide">
            <Link
              href="/students"
              className="hover:text-white/70 underline-offset-4 hover:underline"
            >
              .edu student? See your discount →
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
