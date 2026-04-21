import Image from 'next/image'
import { WaitlistForm } from './waitlist-form'
import { getWaitlistCount, displayedPosition } from '@/lib/waitlist'

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const realCount = await getWaitlistCount().catch(() => 0)
  const displayCount = displayedPosition(realCount)

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div>
          <div className="text-xs opacity-50 mb-6">
            SNEAKERS TERMINAL / v0.0.1 / PRE-LAUNCH
          </div>
          <Image
            src="/logo.png"
            alt="Sneakers"
            width={160}
            height={160}
            priority
            className="mb-6"
          />
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            Sneakers
          </h1>
          <div className="mt-2 text-green-300 text-xl md:text-2xl">
            Lace &apos;Em Up.
          </div>
          <p className="mt-6 text-green-300 opacity-90 text-lg leading-relaxed">
            A trading terminal for prediction markets. Unified across Kalshi,
            Polymarket, ProphetX, CDNA, and the sportsbook hybrids. Built for
            operators who want one screen instead of twenty tabs.
          </p>
        </div>

        <div className="text-xs opacity-70 tracking-wider">
          {'>'} {displayCount} OPERATORS IN QUEUE
        </div>

        <WaitlistForm />

        <div className="text-xs opacity-40 pt-8 border-t border-green-400/20">
          Sneakers Terminal is not a registered investment advisor. Educational
          and research use only. Trading involves substantial risk of loss.
        </div>
      </div>
    </main>
  )
}
