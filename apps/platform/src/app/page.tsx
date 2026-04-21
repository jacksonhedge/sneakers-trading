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
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div className="flex flex-col items-center">
          <div className="text-xs text-[#004225]/60 mb-6 tracking-wider">
            SNEAKERS TERMINAL / v0.0.1 / PRE-LAUNCH
          </div>
          <Image
            src="/logo.png"
            alt="Sneakers"
            width={320}
            height={320}
            priority
            className="mb-4 mix-blend-multiply"
          />
          <h1 className="sr-only">Sneakers</h1>
          <div className="mt-2 text-[#00703c] text-xl md:text-2xl font-semibold">
            Lace &apos;Em Up.
          </div>
          <div className="mt-3 text-stone-700 text-lg md:text-xl italic">
            Never Miss your best bet
          </div>
        </div>

        {referralCode && (
          <div className="mx-auto max-w-md border border-[#00703c]/40 bg-[#00703c]/5 px-4 py-3 text-xs text-stone-800">
            <div>
              {'>'} Referred by operator{' '}
              <span className="text-[#00703c] tracking-wider font-semibold">{referralCode}</span>
            </div>
            <div className="text-stone-600 mt-1">
              Your signup boosts them 5 positions in the queue.
            </div>
          </div>
        )}

        <div className="text-xs text-[#004225] tracking-wider">
          {'>'} {displayCount} OPERATORS IN QUEUE
        </div>

        <div className="mx-auto max-w-md w-full">
          <WaitlistForm referralCode={referralCode} />
        </div>

        <div className="text-xs text-stone-500 pt-8 border-t border-stone-300 mx-auto max-w-md">
          Sneakers Terminal is not a registered investment advisor. Educational
          and research use only. Trading involves substantial risk of loss.
        </div>
      </div>
    </main>
  )
}
