'use client'

import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'rainbow'

const STORAGE_KEY = 'sneakers.market-theme'
const ORDER: Theme[] = ['light', 'dark', 'rainbow']

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === 'dark' || v === 'rainbow' ? v : 'light'
}

/**
 * Applies the selected theme to the nearest wrapper via `data-theme`.
 * Caller renders this button inside a `<div data-theme={...}>` wrapper;
 * the button updates a CSS-only `data-theme` on the nearest `data-theme-root`
 * ancestor so theme.css vars re-cascade.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = readStoredTheme()
    setTheme(stored)
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    window.localStorage.setItem(STORAGE_KEY, theme)
    const root = document.querySelector<HTMLElement>('[data-theme-root]')
    if (root) root.setAttribute('data-theme', theme)
  }, [theme, mounted])

  function cycle() {
    setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length])
  }

  const label: Record<Theme, string> = {
    light: 'Light',
    dark: 'Dark',
    rainbow: 'Rainbow',
  }
  const glyph: Record<Theme, string> = {
    light: '☀',
    dark: '☾',
    rainbow: '⚘',
  }

  return (
    <button
      onClick={cycle}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded ring-1 ring-[var(--border)] text-[var(--text-2)] hover:bg-[var(--panel-2)] transition"
      title="Toggle theme (light / dark / rainbow)"
    >
      <span className="text-sm leading-none">{glyph[theme]}</span>
      <span className="tracking-wider">{label[theme]}</span>
    </button>
  )
}
