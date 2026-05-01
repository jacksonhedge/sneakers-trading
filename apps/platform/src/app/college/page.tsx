import Image from 'next/image'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { WaitlistForm } from '../waitlist-form'
import { isValidReferralCodeFormat } from '@/lib/referral-code'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Sneakers Terminal — College',
  description: 'A personal trading terminal for the college user.',
  openGraph: {
    title: 'Sneakers Terminal — College',
    description: 'A personal trading terminal for the college user.',
    url: 'https://sneakersterminal.com/college',
    siteName: 'Sneakers Terminal',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'Sneakers Terminal — College',
    description: 'A personal trading terminal for the college user.',
  },
}

export default async function CollegePage() {
  const cookieStore = await cookies()
  const rawRef = cookieStore.get('sneakers_ref')?.value ?? null
  const referralCode =
    rawRef && isValidReferralCodeFormat(rawRef) ? rawRef : null

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

      <Link
        href="/students"
        className="absolute top-4 right-4 z-10 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-semibold tracking-wider text-emerald-300 ring-1 ring-emerald-400/50 backdrop-blur-sm hover:bg-emerald-500/20 hover:ring-emerald-400 transition"
      >
        🎓 STUDENT? 75% OFF
      </Link>

      <div className="max-w-2xl w-full space-y-8 text-center text-white">
        <div className="flex flex-col items-center">
          <div className="text-xs text-emerald-300/80 mb-6 tracking-wider">
            SNEAKERS TERMINAL / COLLEGE
          </div>
          <div className="mb-6 rounded-full bg-stone-950 p-6 ring-1 ring-emerald-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.55),0_0_48px_rgba(0,112,60,0.18)]">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={240}
              height={240}
              priority
              className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
            />
          </div>
          <h1 className="sr-only">
            A personal trading terminal for the college user
          </h1>
          <div className="text-white/90 text-2xl md:text-3xl font-semibold leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            A personal trading terminal
          </div>
          <div className="text-emerald-400 text-2xl md:text-3xl font-semibold leading-tight mt-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            for the college user.
          </div>
          <div className="mt-4 text-white/70 text-sm md:text-base italic drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            Every prediction market in your pocket. Verify your .edu to unlock{' '}
            <Link
              href="/students"
              className="text-emerald-300 font-semibold hover:underline"
            >
              75% off
            </Link>
            .
          </div>
        </div>

        {referralCode && (
          <div className="mx-auto max-w-md border border-emerald-400/50 bg-black/40 backdrop-blur-sm px-4 py-3 text-xs text-white/90">
            <div>
              {'>'} Referred by{' '}
              <span className="text-emerald-400 tracking-wider font-semibold">
                {referralCode}
              </span>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-md w-full">
          <div className="text-xs text-emerald-300 tracking-wider mb-3 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            {'>'} JOIN THE WAITLIST
          </div>
          <WaitlistForm referralCode={referralCode} />
        </div>
      </div>
    </main>
  )
}
