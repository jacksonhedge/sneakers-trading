'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

// Client-side filter pills for the dashboard topbar.
//
// Why not <Link> here: the QA report flagged that the FIRST pill click
// after a fresh dashboard load was being swallowed — Next 16 was doing
// a full-page navigation (because the bundle hadn't finished hydrating)
// to /markets which is a heavy server route, with no loading state on
// the destination. Net effect: 22-second blank screen.
//
// Switching to router.push() inside startTransition gives us:
//   1. A pending state we can render as opacity/disabled — visible
//      proof to the user that the click was received
//   2. Client-side navigation that hits /markets/loading.tsx (the
//      branded splash) instantly instead of a full reload
//   3. No reliance on Link's onClick handler being attached, since
//      onClick on a <button> fires regardless of hydration phase
//
// Exact same hrefs as before — pure client-side transport swap.

interface Pill {
  label: string
  emoji: string
  href: string
  primary?: boolean
  accent?: boolean
  /** Hot-pink "tournament" treatment — accent for the Horse Race surface. */
  hot?: boolean
  /** Tiny corner badge — e.g. "NEW" on a fresh surface. */
  badge?: string
  /** Render a thin separator before this pill so it reads as a different group. */
  groupBreak?: boolean
}

const PILLS: Pill[] = [
  { label: 'All', emoji: '◉', href: '/dashboard/markets', primary: true },
  { label: 'Sports', emoji: '🏆', href: '/dashboard/markets?category=sports' },
  { label: 'Politics', emoji: '🗳️', href: '/dashboard/markets?category=politics' },
  { label: 'Crypto', emoji: '₿', href: '/dashboard/markets?category=crypto' },
  { label: 'Economics', emoji: '📊', href: '/dashboard/markets?category=economics' },
  { label: 'Tech', emoji: '💻', href: '/dashboard/markets?category=tech' },
  // Quick markets is its own surface (short-duration, shoppable, not a
  // category filter on /dashboard/markets). Lives in the same pill row for
  // discoverability — separator + accent styling marks it as a different
  // mode rather than another category.
  { label: 'Quick', emoji: '⚡', href: '/dashboard/quick', accent: true, groupBreak: true },
  // Horse Race — tournament wrapper around 5/10/60-min crypto strike
  // markets. Buy-in → chips → trade strikes → top stacks paid out at
  // resolution. Different surface from Quick (gambling-style tournament
  // vs free browsing), so it gets its own pill + a NEW badge until users
  // know it exists.
  {
    label: 'Horse Race',
    emoji: '🏇',
    href: '/dashboard/horse-race',
    hot: true,
    badge: 'NEW',
  },
]

export function TopbarFilterPills() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function go(href: string) {
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <nav className="hidden md:flex items-center gap-0.5 shrink-0 ml-1">
      {PILLS.map((p) => (
        <span key={p.label} className="inline-flex items-center">
          {p.groupBreak && (
            <span aria-hidden className="mx-1.5 h-4 w-px bg-stone-200" />
          )}
          <button
            type="button"
            onClick={() => go(p.href)}
            disabled={pending}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full transition disabled:opacity-60 ${
              p.primary
                ? 'bg-stone-900 text-white hover:bg-stone-800'
                : p.hot
                  ? 'bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white hover:from-fuchsia-600 hover:to-rose-600 font-semibold shadow-sm'
                  : p.accent
                    ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-semibold'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <span aria-hidden>{p.emoji}</span>
            <span>{p.label}</span>
            {p.badge && (
              <span
                aria-hidden
                className={`text-[8px] font-bold tracking-wider px-1 py-px rounded leading-none ${
                  p.hot
                    ? 'bg-white/30 text-white'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {p.badge}
              </span>
            )}
          </button>
        </span>
      ))}
    </nav>
  )
}
