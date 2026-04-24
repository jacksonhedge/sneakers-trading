import Image from 'next/image'
import Link from 'next/link'

const WALLET_URL = 'https://cryptocom.sjv.io/c/3732491/2051372/25666'

export default function WalletPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">
          Set up your wallet.
        </h1>
        <p className="text-sm text-white/70 mt-2 leading-relaxed">
          Sneakers uses <span className="text-emerald-300 font-semibold">Crypto.com</span> as the
          on-ramp for site deposits and withdrawals. Install the app, fund it once, and
          every deposit + payout after that is one tap.
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold">
          STEP 1 · INSTALL
        </div>

        <a
          href={WALLET_URL}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="block rounded-lg shadow-lg hover:shadow-2xl hover:-translate-y-0.5 transition overflow-hidden"
        >
          <Image
            src="/cryptocom-logo.webp"
            alt="Crypto.com"
            width={1200}
            height={628}
            priority
            className="w-full h-auto block"
          />
        </a>
        <div className="flex items-center justify-between text-xs">
          <div className="text-emerald-300/80 tracking-[0.1em] font-semibold">
            RECOMMENDED · 1-TAP DEPOSITS
          </div>
          <div className="text-white/80 font-semibold">
            Set up →
          </div>
        </div>

        <div className="text-xs text-white/60 leading-relaxed">
          Opens the Crypto.com install page. Create an account with the same email you
          used to sign in here, and we&apos;ll detect the wallet on your first deposit.
        </div>
      </div>

      <div className="border border-white/10 bg-white/5 p-4 text-xs text-white/70 leading-relaxed space-y-2">
        <div className="text-white/90 font-semibold text-sm">What happens next</div>
        <div>
          <span className="text-emerald-300">1.</span> Fund the Crypto.com wallet with
          USDC, ETH, or USD (bank / card).
        </div>
        <div>
          <span className="text-emerald-300">2.</span> Come back to Sneakers — we&apos;ll
          detect the wallet on first deposit.
        </div>
        <div>
          <span className="text-emerald-300">3.</span> Every subsequent deposit + payout
          is one tap. Withdrawals settle back to the same wallet.
        </div>
        <div className="text-white/50 pt-1">
          Crypto.com is a Sneakers partner. You keep self-custody; we never see your
          keys.
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Link
          href="/onboarding/about-you"
          className="text-xs text-white/50 hover:text-white/80 tracking-wider"
        >
          ← BACK
        </Link>
        <Link
          href="/onboarding/platforms"
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition"
        >
          CONTINUE
        </Link>
      </div>
    </div>
  )
}
