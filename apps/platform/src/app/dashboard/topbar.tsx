import Link from 'next/link'
import { SignOutButton } from './sign-out-button'
import { ViewModeToggle } from './view-mode-toggle'
import { PriceFormatToggle } from './price-format-toggle'
import { FreshnessIndicator } from '@/components/freshness-indicator'

export function DashboardTopbar({
  dataDate,
  marketCount,
  latestTs,
}: {
  dataDate: string | null
  marketCount: number
  /** ISO timestamp of the newest snapshot across all venues. Drives the
   *  live/lagging/stale indicator in place of the old fake pulse. */
  latestTs?: string | null
}) {
  const now = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-4 px-6 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-stone-950 flex items-center justify-center text-[10px] text-emerald-400 font-bold ring-1 ring-emerald-400/30">
            Ø
          </div>
          <div>
            <div className="text-sm font-bold text-stone-900 leading-none">O&apos;Toole</div>
            <div className="text-[9px] text-stone-500 tracking-[0.2em] leading-none mt-0.5">
              TERMINAL
            </div>
          </div>
        </Link>

        <div className="flex-1 max-w-xl">
          <div className="flex items-center gap-2 bg-stone-100 rounded px-3 py-1.5 text-sm text-stone-500">
            <span>⌕</span>
            <span className="flex-1">Search markets, events, outcomes…</span>
            <span className="text-[10px] text-stone-400 bg-white rounded px-1.5 py-0.5 ring-1 ring-stone-200">
              /
            </span>
          </div>
        </div>

        <ViewModeToggle />
        <PriceFormatToggle />

        <Link
          href="/venues"
          className="text-xs tracking-wider text-stone-600 hover:text-stone-900 px-3 py-1.5 rounded border border-stone-300 hover:bg-stone-50 transition"
        >
          For Business ↗
        </Link>

        <a
          href="https://cryptocom.sly.io/JRXKx"
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="text-xs tracking-wider font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded border border-amber-300 transition"
        >
          Connect Wallet ↗
        </a>

        <FreshnessIndicator ts={latestTs} />
        {dataDate && (
          <span className="text-[10px] text-stone-400 tracking-wider tabular-nums">
            {dataDate}
          </span>
        )}

        <div className="text-[11px] text-stone-500 tabular-nums">
          {marketCount.toLocaleString()} markets · {now} ET
        </div>


        <SignOutButton />
      </div>
    </header>
  )
}
