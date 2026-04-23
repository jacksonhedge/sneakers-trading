'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

// Connect Wallet CTA. Opens a modal with:
//  - QR code encoding the affiliate URL — for desktop users to scan with
//    their phone (the Crypto.com wallet is a mobile app, so scanning is
//    the natural install flow)
//  - "Continue on this device →" direct link — for users already on mobile,
//    or anyone who prefers clicking through
//
// Two visual variants: `dark` (landing page hero, emerald/amber on black)
// and `light` (dashboard topbar, amber on white). Same behavior.

const WALLET_URL = 'https://cryptocom.sly.io/JRXKx'

interface Props {
  variant?: 'dark' | 'light'
}

export function ConnectWalletButton({ variant = 'dark' }: Props) {
  const [open, setOpen] = useState(false)

  // Close on Escape when the modal is open.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const buttonCls =
    variant === 'light'
      ? 'text-xs tracking-wider font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded border border-amber-300 transition'
      : 'inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-xs font-semibold tracking-wider text-amber-300 ring-1 ring-amber-400/50 backdrop-blur-sm hover:bg-amber-500/20 hover:ring-amber-400 transition'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonCls}>
        {variant === 'light' ? 'Connect Wallet ↗' : 'CONNECT WALLET →'}
      </button>
      {open && <WalletModal onClose={() => setOpen(false)} />}
    </>
  )
}

function WalletModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center px-4 py-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-sm w-full bg-white rounded-lg shadow-2xl ring-1 ring-stone-200 p-6 text-stone-900"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] tracking-[0.15em] text-amber-700 font-semibold mb-1">
              CRYPTO.COM
            </div>
            <h2 className="text-lg font-bold text-stone-900">Create your wallet</h2>
            <p className="text-xs text-stone-600 mt-1 leading-relaxed">
              Scan with your phone to install the Crypto.com app and set up a self-custody
              wallet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-2xl leading-none -mt-1 -mr-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex justify-center py-4 bg-stone-50 rounded mb-4">
          <QRCodeSVG
            value={WALLET_URL}
            size={220}
            level="M"
            marginSize={2}
            fgColor="#1a1f2c"
            bgColor="transparent"
          />
        </div>

        <a
          href={WALLET_URL}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="block w-full text-center bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold tracking-wider px-4 py-3 rounded transition"
        >
          CONTINUE ON THIS DEVICE →
        </a>

        <div className="text-[10px] text-stone-400 text-center mt-3 leading-relaxed">
          Crypto.com is a partner. Sneakers earns a referral when you sign up.
        </div>
      </div>
    </div>
  )
}
