'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const TIMEFRAMES = ['5m', '1h', 'D', '1w'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const DEFAULT_TIMEFRAME: Timeframe = '1w'

export function isTimeframe(v: string | null | undefined): v is Timeframe {
  return v != null && (TIMEFRAMES as readonly string[]).includes(v)
}

export function timeframeToDays(tf: Timeframe): number {
  switch (tf) {
    case '5m': return 5 / 1440
    case '1h': return 1 / 24
    case 'D':  return 1
    case '1w': return 7
  }
}

export function TimeframeTabs() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlTf = searchParams.get('tf')
  const active: Timeframe = isTimeframe(urlTf) ? urlTf : DEFAULT_TIMEFRAME

  const setActive = (t: Timeframe) => {
    const params = new URLSearchParams(searchParams.toString())
    if (t === DEFAULT_TIMEFRAME) params.delete('tf')
    else params.set('tf', t)
    const q = params.toString()
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  return (
    <div className="flex items-center gap-4 text-xs">
      {TIMEFRAMES.map((t) => (
        <button
          key={t}
          onClick={() => setActive(t)}
          className={`transition tracking-wider ${
            active === t
              ? 'text-[var(--accent)] font-semibold'
              : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
          }`}
        >
          {t}
          <span className="text-[var(--text-muted)] ml-0.5">▾</span>
        </button>
      ))}
      <span className="h-4 w-px bg-[var(--border)] mx-1" />
      <button className="text-[var(--text-muted)] hover:text-[var(--text-2)]" aria-label="line chart">
        ▤
      </button>
      <button className="text-[var(--text-muted)] hover:text-[var(--text-2)]" aria-label="candlestick">
        ▦
      </button>
      <span className="h-4 w-px bg-[var(--border)] mx-1" />
      <button className="text-[var(--text-muted)] hover:text-[var(--text-2)] flex items-center gap-1">
        <span className="italic">fx</span>
        <span className="tracking-wider">Indicators</span>
      </button>
    </div>
  )
}

export function DetailTabs() {
  const tabs = ['Positions', 'Orders', 'Buy/Sell', 'Trades', 'Top Traders', 'Top Holders']
  const [active, setActive] = useState('Buy/Sell')

  return (
    <div className="flex items-center gap-6 text-sm border-b border-[var(--border)] px-4">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => setActive(t)}
          className={`py-3 transition ${
            active === t
              ? 'text-[var(--text)] font-semibold border-b-2 border-[var(--accent)] -mb-px'
              : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
