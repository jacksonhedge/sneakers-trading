'use client'

import { useEffect, useState } from 'react'
import { OToolePanel } from './otoole-panel'

// Mobile-only floating action button that opens O'Toole as a full-screen
// overlay. Above the md breakpoint (768px) this entire component renders
// nothing — desktop keeps the docked left-sidebar OToolePanel.
//
// Why a popup instead of just unhiding the sidebar at narrow widths:
// the sidebar's 380px width crushes the rest of the page on phones,
// and the dashboard's grid layout needs the full viewport for legibility.
// A FAB-driven full-screen overlay gives O'Toole full real estate when
// invoked, gets out of the way otherwise.

export function OTooleMobileFAB({ userName }: { userName: string | null }) {
  const [open, setOpen] = useState(false)

  // Lock body scroll while the overlay is open — keeps the user inside
  // the chat instead of the dashboard scrolling underneath.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Close on escape key for laptop users who happen to be on a narrow
  // viewport and have a keyboard.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* FAB: hidden on md+ where the sidebar is visible */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open O'Toole AI chat"
        className="md:hidden fixed bottom-4 right-4 z-40 w-14 h-14 rounded-full bg-stone-950 ring-2 ring-emerald-400/60 shadow-lg shadow-stone-950/30 inline-flex items-center justify-center text-emerald-400 text-xl font-bold hover:ring-emerald-400 active:scale-95 transition"
      >
        Ø
      </button>

      {/* Full-screen overlay containing the OToolePanel itself. The
          panel's internal `hidden md:flex` gate doesn't apply inside
          this overlay because we explicitly mark it visible via the
          data-otoole-mobile-overlay attribute + a CSS override below.
          */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex flex-col">
          <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-stone-200">
            <span className="text-sm font-semibold text-stone-900">O&apos;Toole AI</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close O'Toole"
              className="w-8 h-8 inline-flex items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 transition text-lg"
            >
              ×
            </button>
          </header>
          {/* Scrollable body — render the full panel inside, override
              its hidden-on-mobile state with a wrapper class. */}
          <div className="otoole-mobile-overlay flex-1 overflow-y-auto bg-white min-h-0">
            <OToolePanel userName={userName} />
          </div>
        </div>
      )}

      {/* Inline style: when inside .otoole-mobile-overlay, force the
          panel's <aside> visible regardless of its own md:flex gate.
          Cheap CSS escape hatch keeps the panel component itself simple. */}
      <style>{`
        .otoole-mobile-overlay aside {
          display: flex !important;
          width: 100% !important;
          border-right: 0 !important;
          height: 100%;
        }
      `}</style>
    </>
  )
}
