'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

const ITEMS: Array<{ href: string; label: string; pending?: boolean }> = [
  { href: '/', label: 'Overview' },
  { href: '/users', label: 'Users' },
  { href: '/invites', label: 'Invites' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/clicks', label: 'Clicks' },
  { href: '/audit', label: 'Audit' },
  { href: '/markets', label: 'Markets' },
  { href: '/scrapers', label: 'Scrapers' },
  { href: '/alerts', label: 'Alerts', pending: true },
  { href: '/autotrade', label: 'AutoTrade', pending: true },
  { href: '/otoole', label: "O'Toole", pending: true },
  { href: '/students', label: 'Students', pending: true },
  { href: '/enterprise', label: 'Enterprise', pending: true },
  { href: '/system', label: 'System' },
  // /admin/signup-config nav item removed — route doesn't exist (404). Re-add
  // when the page is built.
]

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, startSignOut] = useTransition()

  function signOut() {
    startSignOut(async () => {
      await fetch('/api/auth/signout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    })
  }

  return (
    <nav className="w-full border-b border-stone-300 bg-white/70 backdrop-blur-sm">
      {/* Full-width container (was max-w-6xl). Brand + sign-out cluster pin
          to the edges and stay visible at every viewport width; the nav
          items wrap onto a second line if they don't fit. Compact padding
          on each item to keep the wrap point as far right as possible. */}
      <div className="px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <Link
            href="/"
            className="text-xs tracking-wider text-[#004225] font-bold whitespace-nowrap"
          >
            SNEAKERS / ADMIN
          </Link>
          <div className="flex items-center gap-0.5 flex-wrap">
            {ITEMS.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/' || pathname === '/admin'
                  : pathname.startsWith(item.href) ||
                    pathname.startsWith(`/admin${item.href}`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-xs px-2 py-1 tracking-wider transition inline-flex items-center gap-1 whitespace-nowrap ${
                    active
                      ? 'bg-[#00703c] text-white'
                      : item.pending
                        ? 'text-stone-400 hover:bg-stone-100'
                        : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {item.label.toUpperCase()}
                  {item.pending && (
                    <span
                      className="text-[9px] px-1 rounded bg-amber-100 text-amber-700 tracking-normal"
                      title="Not yet implemented"
                    >
                      WIP
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-stone-500">
          <span>
            <span className="hidden sm:inline">signed in as </span>
            <span className="text-stone-800">{email}</span>
          </span>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="border border-stone-300 px-2 py-1 tracking-wider hover:bg-stone-100 disabled:opacity-50"
            title="Sign out and return to /login"
          >
            {signingOut ? 'SIGNING OUT…' : 'SIGN OUT'}
          </button>
        </div>
      </div>
    </nav>
  )
}
