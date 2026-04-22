'use client'

import { useEffect, useState } from 'react'

type ViewMode = 'simple' | 'medium' | 'terminal'

const STORAGE_KEY = 'sneakers_view_mode'
const DEFAULT_MODE: ViewMode = 'medium'

// Terminal view is gated behind the elite tier / business plan. When Stripe
// integration lands this will check the user's subscription from Supabase;
// for now we key on a localStorage flag the billing page can flip to unlock
// preview. Keeping logic local means no layout flash before auth data loads.
function hasTerminalAccess(): boolean {
  if (typeof window === 'undefined') return false
  const tier = window.localStorage.getItem('sneakers_tier')
  return tier === 'elite' || tier === 'business'
}

function applyMode(mode: ViewMode) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-view', mode)
}

export function ViewModeToggle() {
  const [mode, setMode] = useState<ViewMode>(DEFAULT_MODE)
  const [terminalUnlocked, setTerminalUnlocked] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as ViewMode | null
    const initial = saved ?? DEFAULT_MODE
    const canTerminal = hasTerminalAccess()
    setTerminalUnlocked(canTerminal)
    // If user was on terminal but lost access, drop back to medium.
    const effective: ViewMode = initial === 'terminal' && !canTerminal ? 'medium' : initial
    setMode(effective)
    applyMode(effective)
  }, [])

  function choose(next: ViewMode) {
    if (next === 'terminal' && !terminalUnlocked) {
      // Let the billing page handle the upsell. For now, a no-op + visual
      // indication that it's locked keeps the toggle honest.
      window.location.href = '/dashboard/billing?upgrade=terminal'
      return
    }
    setMode(next)
    applyMode(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  const btn = (m: ViewMode, label: string, locked = false) => {
    const active = m === mode
    return (
      <button
        type="button"
        onClick={() => choose(m)}
        aria-pressed={active}
        className={[
          'px-3 py-1 text-xs tracking-wider rounded-full transition',
          active
            ? 'bg-white text-stone-900 font-semibold shadow-sm'
            : 'text-stone-500 hover:text-stone-700',
          locked && !active ? 'flex items-center gap-1' : '',
        ].join(' ')}
      >
        {label}
        {locked && !active && <span className="text-[9px]" aria-label="locked">🔒</span>}
      </button>
    )
  }

  return (
    <div
      className="flex items-center gap-1 rounded-full bg-stone-100 p-1"
      role="group"
      aria-label="Dashboard view mode"
    >
      {btn('simple', 'Simple')}
      {btn('medium', 'Medium')}
      {btn('terminal', 'Terminal', !terminalUnlocked)}
    </div>
  )
}
