import Image from 'next/image'
import { cookies } from 'next/headers'
import { WaitlistForm } from './waitlist-form'
import { getWaitlistCount, displayedPosition } from '@/lib/waitlist'
import { isValidReferralCodeFormat } from '@/lib/referral-code'

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const realCount = await getWaitlistCount().catch(() => 0)
  const displayCount = displayedPosition(realCount)

  const cookieStore = await cookies()
  const rawRef = cookieStore.get('sneakers_ref')?.value ?? null
  const referralCode =
    rawRef && isValidReferralCodeFormat(rawRef) ? rawRef : null

  return (
    <main className="relative min-h-screen flex items-center justify-center p-8 overflow-hidden isolate">
      {/* Background image — optimized via next/image */}
      <Image
        src="/hero-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover -z-20"
      />
      {/* Darkening overlay — dual-layer for extra contrast on the skyline */}
      <div className="absolute inset-0 bg-black/75 -z-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60 -z-10" />

      <div className="max-w-2xl w-full space-y-8 text-center text-white">
        <div className="flex flex-col items-center">
          <div className="text-xs text-emerald-300/80 mb-6 tracking-wider">
            SNEAKERS TERMINAL / v0.0.1 / PRE-LAUNCH
          </div>
          <div className="mb-4 rounded-full bg-stone-950 p-6 ring-1 ring-emerald-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.55),0_0_48px_rgba(0,112,60,0.18)]">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={280}
              height={280}
              priority
              className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
            />
          </div>
          <h1 className="sr-only">Sneakers</h1>
          <div className="text-emerald-400 text-xl md:text-2xl font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            Lace &apos;Em Up.
          </div>
          <div className="mt-3 text-white/85 text-lg md:text-xl italic drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
            Never Miss your best bet
          </div>
        </div>

        {referralCode && (
          <div className="mx-auto max-w-md border border-emerald-400/50 bg-black/40 backdrop-blur-sm px-4 py-3 text-xs text-white/90">
            <div>
              {'>'} Referred by operator{' '}
              <span className="text-emerald-400 tracking-wider font-semibold">{referralCode}</span>
            </div>
            <div className="text-white/60 mt-1">
              Your signup boosts them 5 positions in the queue.
            </div>
          </div>
        )}

        <div className="text-xs text-emerald-300 tracking-wider drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          {'>'} {displayCount} OPERATORS IN QUEUE
        </div>

        <div className="mx-auto max-w-md w-full">
          <WaitlistForm referralCode={referralCode} />
        </div>
      </div>
    </main>
  )
}
