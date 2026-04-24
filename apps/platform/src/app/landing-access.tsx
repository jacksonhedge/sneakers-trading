'use client'

import { useEffect, useState } from 'react'
import { LandingForm } from './landing-form'

// Access trigger + modal. Lives in the landing navbar (top-right) AND as a
// primary CTA button in the hero. Both open the same centered modal that
// wraps the existing LandingForm — we don't duplicate the form logic, we
// just embed the existing component inside an overlay.
//
// Two variants:
//   - "nav" — compact pill button styled for the top-right nav placement
//   - "hero" — big CTA button, bright, primary-action styling for the hero

type Variant = 'nav' | 'hero'

interface Props {
  referralCode?: string | null
  variant: Variant
  label?: string
}

export function LandingAccess({ referralCode, variant, label }: Props) {
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

  const defaultLabel = variant === 'nav' ? 'Get Access' : 'Get Access →'
  const buttonCls =
    variant === 'nav'
      ? 'inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold tracking-wider text-black ring-1 ring-emerald-400 hover:bg-emerald-400 transition'
      : 'inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-8 py-4 text-base font-bold tracking-wider text-black ring-1 ring-emerald-400 shadow-[0_8px_32px_rgba(16,185,129,0.4)] hover:bg-emerald-400 hover:shadow-[0_12px_48px_rgba(16,185,129,0.5)] transition'

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
                SNEAKERS TERMINAL · FOR COLLEGE STUDENTS
              </div>
              <h2 className="text-xl font-bold text-white">Get in early.</h2>
              <p className="text-xs text-white/70 mt-1 leading-relaxed">
                Paste your access code to sign in, or claim your spot on the list. You get{' '}
                <span className="text-emerald-300 font-semibold">one invite</span> — bring
                somebody who will actually use it.
              </p>
            </div>
            <LandingForm referralCode={referralCode} />
          </div>
        </div>
      )}
    </>
  )
}
