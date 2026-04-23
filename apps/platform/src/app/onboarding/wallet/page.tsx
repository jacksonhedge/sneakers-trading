import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'

const WALLET_URL = 'https://cryptocom.sly.io/JRXKx'

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

      <div className="border border-emerald-400/40 bg-black/60 backdrop-blur-sm p-6 space-y-5">
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold">
          STEP 1 · INSTALL
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="bg-white p-3 rounded shrink-0">
            <QRCodeSVG
              value={WALLET_URL}
              size={160}
              level="M"
              marginSize={1}
              fgColor="#1a1f2c"
              bgColor="transparent"
            />
          </div>
          <div className="text-sm text-white/80 leading-relaxed flex-1">
            <div className="text-white font-semibold mb-1">Scan with your phone</div>
            <div className="text-white/60 text-xs">
              Opens the Crypto.com download page. Install the app, create an account with
              the same email you used to sign in here.
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-emerald-400/20 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="text-xs text-white/60 flex-1">Already on your phone?</div>
          <a
            href={WALLET_URL}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-block border border-amber-400 bg-amber-500/10 text-amber-300 text-xs font-semibold tracking-wider px-4 py-2 rounded hover:bg-amber-500/20 transition"
          >
            OPEN ON THIS DEVICE →
          </a>
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
