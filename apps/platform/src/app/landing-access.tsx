'use client'

import { useEffect, useState } from 'react'
import { LandingForm } from './landing-form'
import { OrgSignupForm } from './org-signup-form'

// Access trigger + modal. Lives in the landing navbar (top-right) AND as a
// primary CTA button in the hero. Supports two signup modes:
//   - "individual" — standard waitlist flow via LandingForm
//   - "organization" — frat/sorority/dorm flow via OrgSignupForm
//
// Variants control button styling:
//   - "nav" — compact pill button for the top-right nav
//   - "hero" — big CTA button for the hero

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
            className="relative max-w-md w-full bg-stone-950 rounded-xl shadow-2xl ring-1 ring-emerald-400/30 p-6 text-white my-8"
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
                {mode === 'organization'
                  ? 'SNEAKERS TERMINAL · FOR COLLEGE ORGS'
                  : 'SNEAKERS TERMINAL · FOR COLLEGE STUDENTS'}
              </div>
              <h2 className="text-xl font-bold text-white">
                {mode === 'organization' ? 'Get your org in early.' : 'Get in early.'}
              </h2>
              <p className="text-xs text-white/70 mt-1 leading-relaxed">
                {mode === 'organization' ? (
                  <>
                    Sign up as the leader. You&apos;ll be the captain, and we&apos;ll onboard
                    your members when the Groups feature ships. First 10 accepted orgs get
                    bonus early access.
                  </>
                ) : (
                  <>
                    Paste your access code to sign in, or claim your spot on the list. You
                    get <span className="text-emerald-300 font-semibold">one invite</span> —
                    bring somebody who will actually use it.
                  </>
                )}
              </p>
            </div>
            {mode === 'organization' ? (
              <OrgSignupForm referralCode={referralCode} />
            ) : (
              <LandingForm referralCode={referralCode} />
            )}
          </div>
        </div>
      )}
    </>
  )
}
