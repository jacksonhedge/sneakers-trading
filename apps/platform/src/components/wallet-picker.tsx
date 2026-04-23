'use client'

import { useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'

// Six-wallet picker modal. Crypto.com is the featured option (we have an
// affiliate deal there) — gets the big QR + "Continue on this device" CTA.
// The other five are secondary tiles that open the wallet's site / install
// page in a new tab.
//
// Used by both the topbar Connect Wallet button and the dashboard
// WalletStatusCard so the experience is identical no matter where the user
// taps in.

export interface WalletEntry {
  id: string
  name: string
  url: string
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
    url: 'https://cryptocom.sly.io/JRXKx',
    color: '#003CDA',
    tagline: 'Featured · 1-tap deposits',
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    url: 'https://coinbase.com/wallet',
    color: '#0052FF',
    tagline: 'Self-custody Web3 wallet',
  },
  {
    id: 'robinhood',
    name: 'Robinhood',
    url: 'https://robinhood.com/wallet',
    color: '#00C805',
    tagline: 'Crypto + brokerage',
  },
  {
    id: 'phantom',
    name: 'Phantom',
    url: 'https://phantom.app',
    color: '#AB9FF2',
    tagline: 'Solana / EVM multichain',
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    url: 'https://metamask.io/download',
    color: '#F6851B',
    tagline: 'EVM standard',
  },
  {
    id: 'edgeboost',
    name: 'EDGE Boost',
    url: 'https://edgeboost.com',
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
              Sneakers uses a wallet for deposits and payouts. Already have one? Tap it
              below. Don&apos;t? Crypto.com is the fastest setup.
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

        {/* Featured: Crypto.com */}
        <div className="rounded border-2 border-amber-300 bg-amber-50/40 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] tracking-[0.15em] text-amber-700 font-bold bg-amber-200/60 px-2 py-0.5 rounded-full">
              RECOMMENDED
            </span>
            <span className="text-sm font-bold text-stone-900">{featured.name}</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="bg-white p-2 rounded ring-1 ring-stone-200 shrink-0">
              <QRCodeSVG
                value={featured.url}
                size={120}
                level="M"
                marginSize={1}
                fgColor="#1a1f2c"
                bgColor="transparent"
              />
            </div>
            <div className="flex-1 text-xs text-stone-700 leading-relaxed">
              Scan with your phone to install the Crypto.com app, or open directly on this
              device.
              <a
                href={featured.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="block w-full text-center bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold tracking-wider px-3 py-2 rounded transition mt-3"
              >
                CONTINUE ON THIS DEVICE →
              </a>
            </div>
          </div>
        </div>

        {/* Secondary: 5 other wallets in a 2-col grid */}
        <div className="text-[10px] tracking-[0.15em] text-stone-600 font-semibold mb-2 px-1">
          OR USE ANOTHER WALLET
        </div>
        <div className="grid grid-cols-2 gap-2">
          {others.map((w) => (
            <a
              key={w.id}
              href={w.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded ring-1 ring-stone-200 bg-white hover:ring-stone-400 hover:bg-stone-50 transition group"
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
                {w.tagline && (
                  <div className="text-[10px] text-stone-600 truncate">{w.tagline}</div>
                )}
              </div>
              <span className="text-stone-400 group-hover:text-stone-700 text-xs">→</span>
            </a>
          ))}
        </div>

        <div className="text-[10px] text-stone-500 text-center mt-4 leading-relaxed">
          You keep self-custody on every option. Sneakers never sees your keys.
        </div>
      </div>
    </div>
  )
}
