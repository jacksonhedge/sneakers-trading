'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

// Branded loading splash. Used while:
//   1. Dashboard does its first-render server work (markets / canonical /
//      history) — wraps inside the dashboard layout's main slot.
//   2. The market-detail page does its targeted load — fills the viewport.
//   3. The login page is mid-redirect to /dashboard.
//
// Pure CSS/SVG, no video. Three layers:
//   - Top: scrolling ticker tape mixing crypto / sports lines / politics
//     so the user immediately reads "this is a markets product."
//   - Center: pulsing Sneakers disc with a soft emerald ring expanding
//     out, terminal-style label underneath.
//   - Bottom: cycling status line + dot tracker so a 3–6s wait still
//     reads as progress, not lock-up.

type TickerItem = { sym: string; dir: '▲' | '▼'; val: string }

const TICKER_ITEMS: TickerItem[] = [
  { sym: 'BTC',          dir: '▲', val: '+0.8%' },
  { sym: 'NVDA',         dir: '▲', val: '+1.4%' },
  { sym: 'LAKERS',       dir: '▼', val: '-3.5' },
  { sym: 'TRUMP-2028',   dir: '▲', val: '47¢' },
  { sym: 'ETH',          dir: '▼', val: '-0.6%' },
  { sym: 'CHIEFS',       dir: '▲', val: '+6.5' },
  { sym: 'FED-RATE-MAY', dir: '▼', val: '21¢' },
  { sym: 'SPY',          dir: '▲', val: '+0.3%' },
  { sym: 'NBA-FINALS',   dir: '▲', val: 'BOS 38¢' },
  { sym: 'SUPERBOWL',    dir: '▼', val: 'KC 22¢' },
  { sym: 'GOLD',         dir: '▲', val: '+0.5%' },
  { sym: 'NEXT-DEM-NOM', dir: '▲', val: 'NEW 19¢' },
]

const STATUS_LINES = [
  'Connecting to Polymarket, Kalshi, NoVig, ProphetX…',
  'Indexing 2,000+ live markets…',
  'Reading O’Toole…',
  'Scanning for cross-book arb…',
  'Almost there…',
] as const

export function TerminalLoadingSplash() {
  const [statusIdx, setStatusIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_LINES.length)
    }, 1500)
    return () => clearInterval(id)
  }, [])

  // The ticker is the same row rendered twice so translating it -50%
  // produces a seamless infinite scroll.
  const tickerRow = (
    <div className="flex items-center gap-7 px-3 py-2 text-[11px] font-mono whitespace-nowrap">
      {TICKER_ITEMS.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-2 text-stone-500">
          <span className="font-semibold text-stone-700 tracking-wide">{t.sym}</span>
          <span
            className={
              t.dir === '▲'
                ? 'text-emerald-600 tabular-nums'
                : 'text-red-500 tabular-nums'
            }
          >
            {t.dir} {t.val}
          </span>
        </span>
      ))}
    </div>
  )

  return (
    <div className="w-full h-full min-h-[420px] flex flex-col bg-stone-50">
      <style>{`
        @keyframes sneakers-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .sneakers-ticker-track { animation: sneakers-ticker 40s linear infinite; }
        @keyframes sneakers-ring-pulse {
          0%   { transform: scale(0.92); opacity: 0.55; }
          70%  { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        .sneakers-ring-pulse { animation: sneakers-ring-pulse 1.8s cubic-bezier(0,0,0.2,1) infinite; }
      `}</style>

      {/* Ticker tape */}
      <div className="overflow-hidden border-y border-stone-200 bg-white shrink-0">
        <div className="sneakers-ticker-track flex w-max">
          {tickerRow}
          {tickerRow}
        </div>
      </div>

      {/* Center column */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-6">
        <div className="relative w-24 h-24">
          <span
            className="sneakers-ring-pulse absolute inset-0 rounded-full bg-emerald-400/40"
            aria-hidden
          />
          <span
            className="sneakers-ring-pulse absolute inset-0 rounded-full bg-emerald-400/20"
            style={{ animationDelay: '0.6s' }}
            aria-hidden
          />
          <span className="relative w-24 h-24 rounded-full bg-stone-950 ring-2 ring-emerald-400/60 flex items-center justify-center overflow-hidden p-3.5">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={80}
              height={80}
              priority
              className="w-full h-full object-contain"
            />
          </span>
        </div>

        <div className="text-center space-y-1.5">
          <div className="text-[10px] tracking-[0.3em] text-stone-500 font-semibold">
            SNEAKERS&nbsp;TERMINAL
          </div>
          <div className="text-sm text-stone-900 font-mono min-h-[20px] transition-opacity duration-300">
            {STATUS_LINES[statusIdx]}
          </div>
        </div>

        <div className="flex gap-2">
          {STATUS_LINES.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`block w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                i === statusIdx ? 'bg-emerald-500' : 'bg-stone-300'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
