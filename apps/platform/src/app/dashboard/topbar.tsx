import Image from 'next/image'
import Link from 'next/link'
import { SignOutButton } from './sign-out-button'
import { ViewModeToggle } from './view-mode-toggle'
import { PriceFormatToggle } from './price-format-toggle'
import { FreshnessIndicator } from '@/components/freshness-indicator'
import { ConnectWalletButton } from '@/components/connect-wallet-button'
import { ProfileAvatar } from '@/components/profile-avatar'

export function DashboardTopbar({
  dataDate,
  marketCount,
  latestTs,
  email,
}: {
  dataDate: string | null
  marketCount: number
  /** ISO timestamp of the newest snapshot across all venues. Drives the
   *  live/lagging/stale indicator in place of the old fake pulse. */
  latestTs?: string | null
  /** Signed-in user's email — drives the profile-avatar initial + tooltip. */
  email?: string | null
}) {
  const now = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <header className="border-b border-stone-200 bg-white/90 backdrop-blur-sm sticky top-0 z-20">
      <div className="flex items-center gap-5 px-8 py-4">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-full bg-stone-950 flex items-center justify-center ring-1 ring-emerald-400/30 shadow-sm overflow-hidden p-1.5">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={36}
              height={36}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="text-sm font-bold text-stone-900 leading-none">Sneakers</div>
            <div className="text-[9px] text-stone-700 tracking-[0.2em] leading-none mt-1">
              TERMINAL
            </div>
          </div>
        </Link>

        {/* Search — takes remaining space */}
        <div className="flex-1 max-w-xl">
          <div className="flex items-center gap-2 bg-stone-100 rounded-full px-4 py-2 text-sm text-stone-700 hover:bg-stone-200/60 transition cursor-pointer">
            <span className="text-base">⌕</span>
            <span className="flex-1">Search markets, events, outcomes…</span>
            <span className="text-[10px] text-stone-800 bg-white rounded px-1.5 py-0.5 ring-1 ring-stone-200 font-mono">
              /
            </span>
          </div>
        </div>

        <Separator />

        {/* Display-mode toggles */}
        <div className="flex items-center gap-2 shrink-0">
          <ViewModeToggle />
          <PriceFormatToggle />
        </div>

        <Separator />

        {/* Cross-site CTAs */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/venues"
            className="text-xs tracking-wider text-stone-800 hover:text-stone-900 px-3 py-1.5 rounded border border-stone-300 hover:bg-stone-50 transition"
          >
            For Business ↗
          </Link>
          <ConnectWalletButton variant="light" />
        </div>

        <Separator />

        {/* Data-freshness cluster */}
        <div className="flex items-center gap-3 shrink-0 text-[11px] text-stone-700 tabular-nums">
          <FreshnessIndicator ts={latestTs} />
          {dataDate && (
            <span className="text-[10px] text-stone-800 tracking-wider">{dataDate}</span>
          )}
          <span>
            {marketCount.toLocaleString()} markets · {now} ET
          </span>
        </div>

        <Separator />

        {/* User actions — profile avatar + sign out, pinned to the far right */}
        <div className="flex items-center gap-3 shrink-0">
          <ProfileAvatar email={email ?? null} variant="topbar" />
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}

function Separator() {
  return (
    <span className="h-6 w-px bg-stone-200 shrink-0" aria-hidden="true" />
  )
}
