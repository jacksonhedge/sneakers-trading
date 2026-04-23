'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const WALLET_URL = 'https://cryptocom.sly.io/JRXKx'
const DISMISS_KEY = 'sneakers_wallet_card_dismissed'

// Persistent wallet-setup card on the dashboard. Pinned near the top so
// users see it on every visit until they dismiss it (localStorage flag).
// Opens an inline modal with the same QR + button as the topbar Connect
// Wallet CTA — no need for a separate path. When real wallet connection
// is built, this card flips to show balance / status instead.

export function WalletStatusCard() {
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)

  // Read the dismissed flag once on mount. null until we know — keeps
  // the card hidden during SSR/hydration to avoid a flash for users
  // who already dismissed it.
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Storage disabled — at least dismiss in-memory for this session.
    }
  }

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (dismissed !== false) return null

  return (
    <>
      <div className="rounded border border-amber-300 bg-gradient-to-r from-amber-50 to-amber-100/60 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-white text-base font-bold ring-1 ring-amber-600/40 shrink-0">
          ⌬
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-900">
            Set up your Crypto.com wallet
          </div>
          <div className="text-xs text-stone-700">
            Sneakers uses Crypto.com as the on-ramp for deposits and payouts. Install the
            app once — every transaction after that is one tap.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold tracking-wider px-4 py-2 rounded transition shrink-0"
        >
          SET UP
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-stone-500 hover:text-stone-800 text-xl leading-none px-1 shrink-0"
        >
          ×
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center px-4 py-8"
          onClick={() => setOpen(false)}
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
                <p className="text-xs text-stone-700 mt-1 leading-relaxed">
                  Scan with your phone to install the Crypto.com app and set up a
                  self-custody wallet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-stone-500 hover:text-stone-800 text-2xl leading-none -mt-1 -mr-1"
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

            <div className="text-[10px] text-stone-500 text-center mt-3 leading-relaxed">
              Crypto.com is a Sneakers partner. You keep self-custody; we never see your
              keys.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
