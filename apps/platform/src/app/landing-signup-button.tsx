'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { OrgSignupForm } from './org-signup-form'

// SIGN UP nav button. Single pill that reveals a two-option panel:
//   - Individual → routes to /signup
//   - Organization → opens the OrgSignupForm modal
//
// Replaces the previous setup that exposed both signup paths as separate
// nav buttons. Cleaner top bar, with the choice deferred to one click.

interface Props {
  referralCode: string | null
  individualEnabled: boolean
  organizationEnabled: boolean
}

export function LandingSignupButton({
  referralCode,
  individualEnabled,
  organizationEnabled,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [orgOpen, setOrgOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Lock body scroll while the org modal is open.
  useEffect(() => {
    if (!orgOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [orgOpen])

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold tracking-wider text-black ring-1 ring-emerald-400 hover:bg-emerald-400 transition"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        SIGN UP
        <span className="text-[8px]" aria-hidden>
          {menuOpen ? '▲' : '▼'}
        </span>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 rounded-lg bg-stone-950 ring-1 ring-emerald-400/30 shadow-[0_24px_72px_rgba(0,0,0,0.6)] overflow-hidden"
        >
          {individualEnabled && (
            <Link
              href="/signup"
              className="block p-4 hover:bg-emerald-500/10 transition border-b border-white/5"
              onClick={() => setMenuOpen(false)}
              role="menuitem"
            >
              <div className="text-sm font-semibold text-emerald-300">Individual →</div>
              <div className="text-[11px] text-white/60 mt-0.5 leading-snug">
                Sign up just for you. Personal account, .edu unlocks 75% off after
                verification.
              </div>
            </Link>
          )}
          {organizationEnabled && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setOrgOpen(true)
              }}
              className="block w-full text-left p-4 hover:bg-emerald-500/10 transition"
              role="menuitem"
            >
              <div className="text-sm font-semibold text-emerald-300">
                Organization / Group →
              </div>
              <div className="text-[11px] text-white/60 mt-0.5 leading-snug">
                Frat / sorority / dorm / class. You become the captain and onboard
                your members.
              </div>
            </button>
          )}
        </div>
      )}

      {/* Organization signup modal — same form as before, just behind the
          dropdown instead of as its own top-bar button. */}
      {orgOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4 py-8 overflow-y-auto"
          onClick={() => setOrgOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-lg w-full bg-stone-950 rounded-xl shadow-2xl ring-1 ring-emerald-400/30 p-6 text-white my-8"
          >
            <button
              type="button"
              onClick={() => setOrgOpen(false)}
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
    </div>
  )
}
