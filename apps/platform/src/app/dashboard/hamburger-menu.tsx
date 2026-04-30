'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { SignOutButton } from './sign-out-button'

// Slide-down hamburger menu in the top-right of the dashboard nav.
// Houses the "everything else" — settings, billing, profile, sign-out
// + the SOON nav items that used to clutter the left sidebar.

const PRIMARY_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/markets', label: 'Markets' },
  { href: '/dashboard/minute', label: 'Minute Markets' },
  { href: '/dashboard/strategies', label: 'Strategies' },
  { href: '/dashboard/alerts', label: 'Alerts' },
  { href: '/dashboard/profile', label: 'Profile' },
] as const

const SETTINGS_LINKS = [
  { href: '/dashboard/settings', label: 'Settings' },
  { href: '/dashboard/settings/autotrade', label: 'Trading & autotrade' },
  { href: '/dashboard/settings/api-keys', label: 'AI API keys' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/connections', label: 'Connections' },
] as const

const SOON_LINKS = [
  { label: 'Signals' },
  { label: 'Portfolio' },
  { label: 'Calendar' },
  { label: 'Heatmap' },
  { label: 'Scanner' },
  { label: 'Order book' },
  { label: 'Positions' },
  { label: 'History' },
  { label: 'Simulator' },
] as const

export function HamburgerMenu() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        className="w-8 h-8 inline-flex items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 bg-white ring-1 ring-stone-200 rounded-xl shadow-xl overflow-hidden z-50"
        >
          <Section label="MAIN">
            {PRIMARY_LINKS.map((l) => (
              <Item key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Item>
            ))}
          </Section>
          <Section label="SETTINGS">
            {SETTINGS_LINKS.map((l) => (
              <Item key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Item>
            ))}
          </Section>
          <Section label="COMING SOON">
            <div className="grid grid-cols-2 gap-1 px-2 pb-2">
              {SOON_LINKS.map((l) => (
                <span
                  key={l.label}
                  className="text-xs text-stone-400 px-2 py-1.5 rounded cursor-not-allowed"
                >
                  {l.label}
                </span>
              ))}
            </div>
          </Section>
          <div className="px-3 py-2 border-t border-stone-100 flex items-center justify-end">
            <SignOutButton />
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.15em] text-stone-400 font-semibold px-4 pt-3 pb-1">
        {label}
      </div>
      {children}
      <div className="border-t border-stone-100 mt-1" />
    </div>
  )
}

function Item({
  href,
  onClick,
  children,
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      prefetch={false}
      className="block px-4 py-2 text-sm text-stone-800 hover:bg-stone-50 transition"
    >
      {children}
    </Link>
  )
}
