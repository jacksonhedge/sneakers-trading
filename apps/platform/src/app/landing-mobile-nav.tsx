'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LandingAccess } from './landing-access'
import type { SignupConfig } from '@/lib/signup-config'

// Mobile-only nav. Renders as a hamburger button that opens a slide-down
// panel with the same items as the desktop nav. Hidden at sm: + up; the
// desktop nav handles those widths.
//
// Reuses LandingAccess so signup flows (Individual routes to /signup,
// Organization opens the in-page modal) behave identically across nav
// variants.

interface Props {
  referralCode: string | null
  signupCfg: SignupConfig
}

export function LandingMobileNav({ referralCode, signupCfg }: Props) {
  const [open, setOpen] = useState(false)

  // Esc closes. Also close on route change — though /signup navigation
  // is a hard nav so the component unmounts anyway.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="sm:hidden relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-sm text-white hover:bg-white/15 transition"
      >
        {open ? (
          // X icon
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          // Hamburger
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Full-screen click catcher to close when tapping outside */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Panel */}
          <div
            className="absolute top-12 right-0 z-50 w-64 rounded-xl bg-stone-950/95 backdrop-blur-xl ring-1 ring-emerald-400/30 shadow-2xl p-3 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href="/login"
              className="block w-full text-center rounded-full bg-white/5 px-4 py-2.5 text-xs font-semibold tracking-wider text-white ring-1 ring-white/30 hover:bg-white/10 transition"
              onClick={() => setOpen(false)}
            >
              LOG IN
            </Link>
            {signupCfg.individualEnabled && (
              <div onClick={() => setOpen(false)}>
                <LandingAccess
                  referralCode={referralCode}
                  variant="nav"
                  mode="individual"
                  tone="primary"
                  label="Sign up — Individual"
                />
              </div>
            )}
            {signupCfg.organizationEnabled && (
              <div onClick={() => setOpen(false)}>
                <LandingAccess
                  referralCode={referralCode}
                  variant="nav"
                  mode="organization"
                  tone="secondary"
                  label="Sign up — Organization / Group"
                />
              </div>
            )}
            <div className="pt-2 mt-2 border-t border-white/10 space-y-1.5">
              <Link
                href="/venues"
                className="block px-3 py-2 text-xs font-medium tracking-wider text-white/80 hover:text-white hover:bg-white/5 rounded transition"
                onClick={() => setOpen(false)}
              >
                Venues we track →
              </Link>
              <Link
                href="/pricing"
                className="block px-3 py-2 text-xs font-medium tracking-wider text-white/80 hover:text-white hover:bg-white/5 rounded transition"
                onClick={() => setOpen(false)}
              >
                Pricing →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
