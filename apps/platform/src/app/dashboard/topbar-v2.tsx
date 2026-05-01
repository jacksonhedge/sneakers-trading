import Image from 'next/image'
import Link from 'next/link'
import { FreshnessIndicator } from '@/components/freshness-indicator'
import { ProfileAvatar } from '@/components/profile-avatar'
import { DashboardSearchBox } from './search-box'
import { AppsBar } from './apps-bar'
import { HamburgerMenu } from './hamburger-menu'
import { TopbarFilterPills } from './topbar-filter-pills'
import { WalletButton } from './wallet-button'

// New (Heyday-inspired) top bar:
//   Left:   small logo + "<name>'s terminal"
//   Center: search box (already wired) + filter pills (client component)
//   Right:  freshness, apps row (+ icon → venue picker), avatar, hamburger
//
// Visual contract: white background, subtle stone border, 56px tall.

interface Props {
  email?: string | null
  displayName?: string | null
  latestTs?: string | null
  marketCount?: number
  dataDate?: string | null
  configuredVenueIds?: string[]
  avatarUrl?: string | null
  avatarEmoji?: string | null
  avatarColor?: string | null
}

export function DashboardTopbarV2({
  email,
  displayName,
  latestTs,
  configuredVenueIds,
  avatarUrl,
  avatarEmoji,
  avatarColor,
}: Props) {
  const headerName = displayName
    ? `${displayName}'s terminal`
    : email
      ? `${email.split('@')[0]}'s terminal`
      : 'Sneakers Terminal'

  return (
    <header className="border-b border-stone-200 bg-white sticky top-0 z-30">
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Brand + identity */}
        <Link href="/dashboard" prefetch={false} className="flex items-center gap-2.5 shrink-0 pr-2">
          <div className="w-7 h-7 rounded-full bg-stone-950 flex items-center justify-center ring-1 ring-emerald-500/40 overflow-hidden p-1">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={28}
              height={28}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-sm text-stone-900 font-medium truncate max-w-[200px]">
            {headerName}
          </span>
        </Link>

        {/* Search */}
        <DashboardSearchBox />

        {/* Filter pills — client component with imperative router.push
            so the click fires even before hydration completes. */}
        <TopbarFilterPills />

        {/* Right cluster */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          {/* Freshness pill: only render when we have a real ts. The
              dashboard layout doesn't load market data, so when
              latestTs is undefined the pill used to render a permanent
              "LOADING" — confusing UX, looked like the page was stuck.
              Hiding it until ts is supplied keeps the topbar honest. */}
          {latestTs && (
            <span className="hidden lg:inline-flex">
              <FreshnessIndicator ts={latestTs} compact />
            </span>
          )}
          <WalletButton />
          <AppsBar configuredIds={configuredVenueIds} />
          <span className="w-px h-6 bg-stone-200" aria-hidden />
          <ProfileAvatar
            email={email ?? null}
            avatarUrl={avatarUrl}
            avatarEmoji={avatarEmoji}
            avatarColor={avatarColor}
            variant="topbar"
          />
          <HamburgerMenu />
        </div>
      </div>
    </header>
  )
}
