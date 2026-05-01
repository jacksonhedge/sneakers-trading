import Image from 'next/image'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { WaitlistForm } from '../waitlist-form'
import { isValidReferralCodeFormat } from '@/lib/referral-code'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Sneakers Terminal — 75% off for students',
  description:
    '2 weeks free, then 75% off Pro or Elite for verified college students.',
  openGraph: {
    title: 'Sneakers Terminal — 75% off for students',
    description: '2 weeks free, then 75% off Pro or Elite for verified college students.',
    url: 'https://sneakersterminal.com/students',
    siteName: 'Sneakers Terminal',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'Sneakers Terminal — 75% off for students',
    description: '2 weeks free, then 75% off Pro or Elite for verified college students.',
  },
}

export default async function StudentsPage() {
  const cookieStore = await cookies()
  const rawRef = cookieStore.get('sneakers_ref')?.value ?? null
  const referralCode = rawRef && isValidReferralCodeFormat(rawRef) ? rawRef : null

  return (
    <main className="relative min-h-screen flex items-center justify-center p-8 overflow-hidden isolate">
      <Image
        src="/hero-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover -z-20"
      />
      <div className="absolute inset-0 bg-black/75 -z-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60 -z-10" />

      <Link
        href="/"
        className="absolute top-4 left-4 z-10 text-xs text-emerald-300/80 tracking-wider hover:text-emerald-300"
      >
        ← BACK
      </Link>

      <div className="max-w-2xl w-full space-y-8 text-center text-white">
        <div className="flex flex-col items-center">
          <div className="text-xs text-emerald-300/80 mb-6 tracking-wider">
            🎓 STUDENT PROGRAM
          </div>
          <div className="text-5xl md:text-6xl font-bold text-emerald-400 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] mb-4">
            2 weeks free, then 75% off.
          </div>
          <div className="text-white/90 text-xl md:text-2xl font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            For verified college students.
          </div>
          <div className="mt-3 text-white/70 text-sm md:text-base italic drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            14-day free trial, then Pro at{' '}
            <span className="text-emerald-300 font-semibold">$10/mo</span> · Elite at{' '}
            <span className="text-emerald-300 font-semibold">$25/mo</span>
          </div>
        </div>

        <div className="mx-auto max-w-md border border-emerald-400/50 bg-black/40 backdrop-blur-sm px-5 py-4 text-left text-sm text-white/90 space-y-2">
          <div className="text-xs text-emerald-300 tracking-wider mb-2">VERIFICATION REQUIRES</div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>
              <span className="font-semibold">.edu email</span> from a US university
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>
              <span className="font-semibold">Instagram handle</span> — to confirm you're a real person
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>
              <span className="font-semibold">LinkedIn URL</span> — to confirm current enrollment
            </span>
          </div>
          <div className="text-xs text-white/50 mt-3 pt-3 border-t border-white/10">
            Submit after sign-up from your dashboard. Reviewed within 24 hours. Re-verified annually until graduation.
          </div>
        </div>

        {referralCode && (
          <div className="mx-auto max-w-md border border-emerald-400/50 bg-black/40 backdrop-blur-sm px-4 py-3 text-xs text-white/90">
            <div>
              {'>'} Referred by{' '}
              <span className="text-emerald-400 tracking-wider font-semibold">{referralCode}</span>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-md w-full">
          <div className="text-xs text-emerald-300 tracking-wider mb-3 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            {'>'} START BY JOINING THE WAITLIST
          </div>
          <WaitlistForm referralCode={referralCode} />
        </div>

        <div className="text-xs text-white/60 tracking-wide max-w-md mx-auto">
          Once approved, Pro and Elite start with a <span className="text-emerald-300 font-semibold">14-day free trial</span> — no charge until day 15 — then
          75% off forever while you&apos;re enrolled. Verification is human-reviewed;
          we&apos;ll email once you&apos;re approved.
        </div>

        {/* Alumni section — targeted from the landing nav "Recent grad?" pill.
            Keeps the copy tight since this is secondary to the active-student
            acquisition funnel. */}
        <div
          id="alumni"
          className="scroll-mt-8 mx-auto max-w-md w-full border-t border-white/10 pt-10 mt-6"
        >
          <div className="text-xs text-emerald-300/80 tracking-wider mb-2">
            RECENT GRADS (0–5 YEARS OUT)
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight">
            Just graduated? You&apos;re still in.
          </h2>
          <p className="text-sm text-white/80 leading-relaxed mb-5">
            Sneakers is for the college-and-adjacent window. Students get the biggest
            discount; recent grads get the next-best tier. Verification is a LinkedIn link
            showing your graduation year — we confirm it was within the last 5 years.
          </p>
          <div className="rounded-lg border border-emerald-400/30 bg-black/40 backdrop-blur-sm px-5 py-4 text-left space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-emerald-400 mt-0.5">✓</span>
              <div>
                <div className="text-sm font-semibold text-white">50% off Pro, 50% off Elite</div>
                <div className="text-xs text-white/60 mt-0.5">
                  For 2 years post-graduation, then standard pricing.
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-emerald-400 mt-0.5">✓</span>
              <div>
                <div className="text-sm font-semibold text-white">
                  Join alumni groups + legacy frat competitions
                </div>
                <div className="text-xs text-white/60 mt-0.5">
                  Your .edu cohort doesn&apos;t disappear when you graduate.
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-emerald-400 mt-0.5">✓</span>
              <div>
                <div className="text-sm font-semibold text-white">Verification via LinkedIn</div>
                <div className="text-xs text-white/60 mt-0.5">
                  Share your profile URL — we confirm the graduation year was within 5 years.
                </div>
              </div>
            </div>
          </div>
          <div className="text-[11px] text-white/50 mt-4 leading-relaxed">
            Beyond 5 years out? Contact us —{' '}
            <a
              href="mailto:hi@sneakersterminal.com?subject=Recent%20grad%20%E2%80%94%20access"
              className="text-emerald-300/90 hover:text-emerald-300 underline underline-offset-4"
            >
              hi@sneakersterminal.com
            </a>{' '}
            — we evaluate case-by-case.
          </div>
        </div>
      </div>
    </main>
  )
}
