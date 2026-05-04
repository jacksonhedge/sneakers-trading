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
  /** Effective tier — 'free' | 'pro' | 'elite' | 'business'. Already
   *  status-collapsed (past_due → free) by the layout loader. */
  planTier?: string
}

export function DashboardTopbarV2({
  email,
  displayName,
  latestTs,
  configuredVenueIds,
  avatarUrl,
  avatarEmoji,
  avatarColor,
  planTier,
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
          <TierBadge tier={planTier} />
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

// Small tier pill — gives the user constant-visible signal of their plan
// state without burying it in /dashboard/billing. Click → billing page.
// Free is muted so it doesn't compete visually; paid tiers earn the
// emerald/gold/navy accents. Hidden on mobile (handled inline via Tailwind).
function TierBadge({ tier }: { tier?: string }) {
  const t = (tier ?? 'free').toLowerCase()
  const variant: { label: string; cls: string; href: string } =
    t === 'business' || t === 'fraternity'
      ? {
          label: t === 'fraternity' ? 'FRAT' : 'BUSINESS',
          cls: 'bg-stone-900 text-stone-100 ring-stone-900',
          href: '/dashboard/billing',
        }
      : t === 'elite'
        ? {
            label: 'ELITE',
            cls: 'bg-amber-50 text-amber-900 ring-amber-300',
            href: '/dashboard/billing',
          }
        : t === 'pro'
          ? {
              label: 'PRO',
              cls: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
              href: '/dashboard/billing',
            }
          : {
              label: 'FREE · UPGRADE',
              cls: 'bg-stone-50 text-stone-600 ring-stone-200 hover:bg-stone-100 hover:text-stone-900',
              href: '/pricing',
            }
  return (
    <Link
      href={variant.href}
      prefetch={false}
      className={`hidden md:inline-flex items-center text-[10px] font-semibold tracking-[0.12em] px-2 py-0.5 rounded ring-1 transition ${variant.cls}`}
      title={`Plan: ${variant.label}`}
    >
      {variant.label}
    </Link>
  )
}
