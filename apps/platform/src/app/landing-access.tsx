'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { OrgSignupForm } from './org-signup-form'

// Access trigger. Two signup modes with different UX:
//   - "individual" — navigates to /signup (the immersive terminal-bg page)
//   - "organization" — opens an in-page modal with the OrgSignupForm
//                      (longer form, modal flow makes sense)
//
// Variants control button styling:
//   - "nav" — compact pill button for the top-right nav
//   - "hero" — big CTA button for the hero
//
// For Individual, this component is a styled <Link>. For Organization, it's
// a button + modal overlay. Same visual API across both so the landing
// nav/hero placement code doesn't need to branch.

type Variant = 'nav' | 'hero'
type Mode = 'individual' | 'organization'

interface Props {
  referralCode?: string | null
  variant: Variant
  mode?: Mode
  label?: string
  tone?: 'primary' | 'secondary'
}

export function LandingAccess({
  referralCode,
  variant,
  mode = 'individual',
  label,
  tone = 'primary',
}: Props) {
  const [open, setOpen] = useState(false)

  // Esc closes the modal
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const defaultLabel =
    mode === 'organization'
      ? variant === 'nav'
        ? 'Sign Up as Organization'
        : 'Sign up your organization →'
      : variant === 'nav'
        ? 'Sign Up as Individual'
        : 'Sign up as an individual →'

  // Primary tone = bright emerald, secondary = outlined. In the nav we show
  // BOTH buttons at once, so we use tone to differentiate without having two
  // same-color buttons compete for attention.
  const buttonCls =
    variant === 'nav'
      ? tone === 'primary'
        ? 'inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold tracking-wider text-black ring-1 ring-emerald-400 hover:bg-emerald-400 transition'
        : 'inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs font-semibold tracking-wider text-white ring-1 ring-white/30 backdrop-blur-sm hover:bg-white/10 hover:ring-white/60 transition'
      : tone === 'primary'
        ? 'inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-8 py-4 text-base font-bold tracking-wider text-black ring-1 ring-emerald-400 shadow-[0_8px_32px_rgba(16,185,129,0.4)] hover:bg-emerald-400 hover:shadow-[0_12px_48px_rgba(16,185,129,0.5)] transition'
        : 'inline-flex items-center gap-2 rounded-lg bg-white/5 px-8 py-4 text-base font-bold tracking-wider text-white ring-1 ring-white/30 backdrop-blur-sm hover:bg-white/10 hover:ring-white/60 transition'

  // Individual signup is a navigation, not a modal — sends them to /signup
  // which renders the immersive terminal-background experience. Org stays
  // as a modal because the form is longer and modal flow keeps users in
  // context with the landing.
  if (mode === 'individual') {
    return (
      <Link href="/signup" className={buttonCls}>
        {label ?? defaultLabel}
      </Link>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonCls}>
        {label ?? defaultLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4 py-8 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-lg w-full bg-stone-950 rounded-xl shadow-2xl ring-1 ring-emerald-400/30 p-6 text-white my-8"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 text-white/50 hover:text-white/90 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition"
            >
              ×
            </button>
            <div className="mb-5 pr-8">
              <div className="text-[10px] tracking-[0.2em] text-emerald-300/80 font-semibold mb-1">
                SNEAKERS TERMINAL · FOR COLLEGE ORGS
              </div>
              <h2 className="text-xl font-bold text-white">Get your org in early.</h2>
              <p className="text-xs text-white/70 mt-1 leading-relaxed">
                Sign up as the leader. You&apos;ll be the captain, and we&apos;ll onboard
                your members when the Groups feature ships. First 10 accepted orgs get
                bonus early access.
              </p>
            </div>
            <OrgSignupForm referralCode={referralCode} />
          </div>
        </div>
      )}
    </>
  )
}
