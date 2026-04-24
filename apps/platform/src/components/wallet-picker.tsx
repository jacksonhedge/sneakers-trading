'use client'

import Image from 'next/image'
import { useEffect } from 'react'

// Wallet picker modal. Crypto.com is the live option — our affiliate deal.
// The other wallets are roadmapped but not yet integrated, so they show as
// "Coming soon" tiles so users see the breadth without hitting a dead link.
//
// Used by both the topbar Connect Wallet button and the dashboard
// WalletStatusCard so the experience is identical no matter where the user
// taps in.

export interface WalletEntry {
  id: string
  name: string
  url?: string
  // Brand color for the tile. Pick the wallet's primary marketing color so
  // the visual maps to user expectation.
  color: string
  // Optional: short tagline shown under the name. Keep to ~40 chars.
  tagline?: string
}

export const WALLETS: WalletEntry[] = [
  {
    id: 'cryptocom',
    name: 'Crypto.com',
    url: 'https://cryptocom.sjv.io/c/3732491/2051372/25666',
    color: '#003CDA',
    tagline: 'Featured · 1-tap deposits',
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    color: '#0052FF',
    tagline: 'Self-custody Web3 wallet',
  },
  {
    id: 'robinhood',
    name: 'Robinhood',
    color: '#00C805',
    tagline: 'Crypto + brokerage',
  },
  {
    id: 'phantom',
    name: 'Phantom',
    color: '#AB9FF2',
    tagline: 'Solana / EVM multichain',
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    color: '#F6851B',
    tagline: 'EVM standard',
  },
  {
    id: 'edgeboost',
    name: 'EDGE Boost',
    color: '#1a1f2c',
    tagline: 'Sportsbook deposit account',
  },
]

const FEATURED_ID = 'cryptocom'

interface Props {
  onClose: () => void
}

export function WalletPicker({ onClose }: Props) {
  // Esc closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const featured = WALLETS.find((w) => w.id === FEATURED_ID)!
  const others = WALLETS.filter((w) => w.id !== FEATURED_ID)

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full bg-white rounded-lg shadow-2xl ring-1 ring-stone-200 p-6 text-stone-900 my-8"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] tracking-[0.15em] text-amber-700 font-semibold mb-1">
              CONNECT A WALLET
            </div>
            <h2 className="text-lg font-bold text-stone-900">Pick your wallet</h2>
            <p className="text-xs text-stone-700 mt-1 leading-relaxed">
              Sneakers uses a wallet for deposits and payouts. Crypto.com is live —
              tap to set up in about 90 seconds.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 hover:text-stone-800 text-2xl leading-none -mt-1 -mr-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Featured: Crypto.com — big clickable brand card */}
        <a
          href={featured.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="block rounded-lg mb-2 overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-0.5 transition ring-1 ring-stone-200"
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
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="text-[9px] tracking-[0.15em] text-amber-700 font-semibold">
            RECOMMENDED · 1-TAP DEPOSITS
          </div>
          <div className="text-[11px] font-semibold text-stone-800">
            Set up →
          </div>
        </div>

        {/* Secondary: 5 other wallets in a 2-col grid, all marked Coming soon */}
        <div className="text-[10px] tracking-[0.15em] text-stone-600 font-semibold mb-2 px-1">
          OR USE ANOTHER WALLET
        </div>
        <div className="grid grid-cols-2 gap-2">
          {others.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded ring-1 ring-stone-200 bg-stone-50 opacity-75"
            >
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: w.color }}
                aria-hidden
              >
                {w.name[0]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-stone-900 truncate">{w.name}</div>
                <div className="text-[10px] text-stone-500 truncate">Coming soon</div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-[10px] text-stone-500 text-center mt-4 leading-relaxed">
          You keep self-custody on every option. Sneakers never sees your keys.
        </div>
      </div>
    </div>
  )
}
