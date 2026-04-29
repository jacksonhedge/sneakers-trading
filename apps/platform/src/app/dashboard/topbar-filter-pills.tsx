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
  href: string
  primary?: boolean
}

const PILLS: Pill[] = [
  { label: 'All', href: '/dashboard/markets', primary: true },
  { label: 'Sports', href: '/dashboard/markets?category=sports' },
  { label: 'Politics', href: '/dashboard/markets?category=politics' },
  { label: 'Crypto', href: '/dashboard/markets?category=crypto' },
  { label: 'Economics', href: '/dashboard/markets?category=economics' },
  { label: 'Tech', href: '/dashboard/markets?category=tech' },
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
        <button
          key={p.label}
          type="button"
          onClick={() => go(p.href)}
          disabled={pending}
          className={`px-3 py-1 text-xs rounded-full transition disabled:opacity-60 ${
            p.primary
              ? 'bg-stone-900 text-white hover:bg-stone-800'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          {p.label}
        </button>
      ))}
    </nav>
  )
}
