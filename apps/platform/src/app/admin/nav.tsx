'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS: Array<{ href: string; label: string; pending?: boolean }> = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/invites', label: 'Invites' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/scrapers', label: 'Scrapers' },
  { href: '/admin/alerts', label: 'Alerts', pending: true },
  { href: '/admin/autotrade', label: 'AutoTrade', pending: true },
  { href: '/admin/otoole', label: "O'Toole", pending: true },
  { href: '/admin/students', label: 'Students', pending: true },
  { href: '/admin/enterprise', label: 'Enterprise', pending: true },
  { href: '/admin/signup-config', label: 'Signups' },
  { href: '/admin/system', label: 'System' },
]

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname()
  return (
    <nav className="w-full border-b border-stone-300 bg-white/70 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <Link
            href="/admin"
            className="text-xs tracking-wider text-[#004225] font-bold"
          >
            SNEAKERS / ADMIN
          </Link>
          <div className="flex items-center gap-1">
            {ITEMS.map((item) => {
              const active =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-xs px-3 py-1.5 tracking-wider transition inline-flex items-center gap-1.5 ${
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
                      className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 tracking-normal"
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
        <div className="text-xs text-stone-500">
          <span className="hidden sm:inline">signed in as </span>
          <span className="text-stone-800">{email}</span>
        </div>
      </div>
    </nav>
  )
}
