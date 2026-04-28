import Image from 'next/image'
import Link from 'next/link'
import { FreshnessIndicator } from '@/components/freshness-indicator'
import { ProfileAvatar } from '@/components/profile-avatar'
import { DashboardSearchBox } from './search-box'
import { AppsBar } from './apps-bar'
import { HamburgerMenu } from './hamburger-menu'

// New (Heyday-inspired) top bar:
//   Left:   small logo + "<name>'s terminal"
//   Center: search box (already wired) + filter pills
//   Right:  freshness, apps row (+ icon → venue picker), avatar, hamburger
//
// Visual contract: white background, subtle stone border, 56px tall.
// No more dark glass / heavy chrome — matches the new login page tone.

interface Props {
  email?: string | null
  displayName?: string | null
  latestTs?: string | null
  marketCount?: number
  dataDate?: string | null
  configuredVenueIds?: string[]
}

const FILTER_PILLS: Array<{ label: string; href: string; primary?: boolean }> = [
  { label: 'All', href: '/markets', primary: true },
  { label: 'Sports', href: '/markets?category=sports' },
  { label: 'Politics', href: '/markets?category=politics' },
  { label: 'Crypto', href: '/markets?category=crypto' },
  { label: 'Economics', href: '/markets?category=economics' },
  { label: 'Tech', href: '/markets?category=tech' },
]

export function DashboardTopbarV2({
  email,
  displayName,
  latestTs,
  configuredVenueIds,
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
        <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 pr-2">
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

        {/* Filter pills */}
        <nav className="hidden md:flex items-center gap-0.5 shrink-0 ml-1">
          {FILTER_PILLS.map((p) => (
            <Link
              key={p.label}
              href={p.href}
              className={`px-3 py-1 text-xs rounded-full transition ${
                p.primary
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <span className="hidden lg:inline-flex">
            <FreshnessIndicator ts={latestTs} compact />
          </span>
          <AppsBar configuredIds={configuredVenueIds} />
          <span className="w-px h-6 bg-stone-200" aria-hidden />
          <ProfileAvatar email={email ?? null} variant="topbar" />
          <HamburgerMenu />
        </div>
      </div>
    </header>
  )
}
