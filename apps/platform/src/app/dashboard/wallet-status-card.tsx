'use client'

import { useEffect, useState } from 'react'
import { WalletPicker } from '@/components/wallet-picker'

const DISMISS_KEY = 'sneakers_wallet_card_dismissed'

// Persistent wallet-setup card on the dashboard. Pinned near the top so
// users see it on every visit until they dismiss it (localStorage flag).
// Opens the shared WalletPicker so the experience matches the topbar
// Connect Wallet button.

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

  if (dismissed !== false) return null

  return (
    <>
      <div className="rounded border border-amber-300 bg-gradient-to-r from-amber-50 to-amber-100/60 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-white text-base font-bold ring-1 ring-amber-600/40 shrink-0">
          ⌬
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-900">
            Set up your wallet
          </div>
          <div className="text-xs text-stone-700">
            Sneakers uses a wallet for deposits and payouts. Pick from Crypto.com,
            Coinbase, Robinhood, Phantom, MetaMask, or EDGE Boost.
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

      {open && <WalletPicker onClose={() => setOpen(false)} />}
    </>
  )
}
